export function cleanTextForSpeech(markdown: string): string {
  if (!markdown) return "";
  return markdown
    // Remove fenced code blocks completely so TTS doesn't read raw code syntax
    .replace(/```[\s\S]*?```/g, " ")
    // Replace markdown links [label](url) with just label
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    // Remove citation brackets like [1], [2, 3]
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, "")
    // Remove bare URLs
    .replace(/https?:\/\/[^\s)]+/g, "")
    // Remove markdown headings, bold/italic markers, inline code ticks, list bullets
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`~>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitSpeechChunks(text: string, maxLen = 170): string[] {
  const cleaned = cleanTextForSpeech(text);
  if (!cleaned) return [];

  // Split by sentence-ending punctuation across English and Indic scripts (incl. danda ।)
  const rawSentences = cleaned
    .split(/(?<=[.!?।])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const sentence of rawSentences) {
    if (sentence.length <= maxLen) {
      chunks.push(sentence);
      continue;
    }
    const words = sentence.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxLen && current) {
        chunks.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

export function detectSpeechLang(text: string, fallbackLang = "en-IN"): string {
  if (/[\u0900-\u097F]/.test(text)) return "hi-IN";
  if (/[\u0B80-\u0BFF]/.test(text)) return "ta-IN";
  if (/[\u0C00-\u0C7F]/.test(text)) return "te-IN";
  if (/[\u0C80-\u0CFF]/.test(text)) return "kn-IN";
  if (/[\u0D00-\u0D7F]/.test(text)) return "ml-IN";
  return fallbackLang || "en-IN";
}
