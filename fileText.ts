/* Local, dependency-light text extraction for PDF and DOCX attachments.
   Nothing leaves the browser. Encrypted, scanned, or unsupported files return
   an empty string so the UI can be honest about what was actually read. */

function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}

function decodePdfString(raw: string) {
  return raw
    .replace(/\\([nrtbf()\\])/g, (_, code: string) => {
      const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f", "(": "(", ")": ")", "\\": "\\" };
      return escapes[code] ?? code;
    })
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(parseInt(octal, 8)));
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const text = decodeText(new Uint8Array(buffer));
  if (!text.includes("%PDF")) throw new Error("Not a valid PDF");

  const chunks: string[] = [];
  const streamPattern = /stream\r?\n([\s\S]*?)endstream/g;
  let streamMatch: RegExpExecArray | null;

  while ((streamMatch = streamPattern.exec(text)) !== null) {
    const stream = streamMatch[1];
    if (!stream.includes("BT") && !stream.includes("Tj") && !stream.includes("TJ")) continue;

    const tokens = stream.match(/\((?:\\.|[^\\()])*\)|\bT[dDmJj*]\b|<[0-9A-Fa-f\s]+>/g);
    if (!tokens) continue;

    for (const token of tokens) {
      if (token.startsWith("(") && token.endsWith(")")) {
        chunks.push(decodePdfString(token.slice(1, -1)));
      } else if (token.startsWith("<") && token.endsWith(">")) {
        const hex = token.slice(1, -1).replace(/\s+/g, "");
        if (hex.length > 1 && hex.length % 2 === 0) {
          let decoded = "";
          for (let index = 0; index < hex.length; index += 2) {
            const code = parseInt(hex.slice(index, index + 2), 16);
            if (Number.isFinite(code)) decoded += String.fromCharCode(code);
          }
          if (/[\x20-\x7E]/.test(decoded)) chunks.push(decoded);
        }
      } else if (token === "T*" || token === "Td" || token === "TD") {
        chunks.push("\n");
      }
    }
  }

  return chunks
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const result = await new Response(stream).arrayBuffer();
    return new Uint8Array(result);
  } catch {
    return null;
  }
}

function xmlText(xml: string) {
  return xml
    .replace(/<w:tab[^>]*\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("Not a DOCX archive");

  const view = new DataView(buffer);
  let endOffset = bytes.length - 22;
  while (endOffset >= 0 && view.getUint32(endOffset, true) !== 0x06054b50) endOffset -= 1;
  if (endOffset < 0) throw new Error("Missing archive directory");

  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  let offset = directoryOffset;

  for (let entry = 0; entry < entryCount && offset + 46 <= bytes.length; entry += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decodeText(bytes.subarray(offset + 46, offset + 46 + nameLength));

    if (name === "word/document.xml") {
      if (view.getUint32(localOffset, true) !== 0x04034b50) break;
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      if (compression === 0) return xmlText(decodeText(data));
      if (compression === 8) {
        const inflated = await inflateRaw(data);
        if (inflated) return xmlText(decodeText(inflated));
        throw new Error("This browser cannot decompress DOCX files");
      }
      throw new Error("Unsupported DOCX compression");
    }

    offset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error("No document body found");
}
