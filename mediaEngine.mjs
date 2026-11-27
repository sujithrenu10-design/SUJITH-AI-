import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import dns from "node:dns/promises";
import { GoogleGenAI } from "@google/genai";

const MEDIA_DIR = path.resolve(os.tmpdir(), "sujith-media-assets");
fs.mkdirSync(MEDIA_DIR, { recursive: true });

const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const MAX_MEDIA_BYTES = 80 * 1024 * 1024; // 80 MB safety cap
const NOTRACK_API_BASE = "https://api.notrack.ai/v1";

const mediaJobs = new Map();
const mediaAssets = new Map();
const jobSubscribers = new Map();

function makeAssetId(prefix = "asset") {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function makeJobId() {
  return `mjob_${crypto.randomUUID().replace(/-/g, "")}`;
}

function isPrivateIpAddress(ip) {
  const clean = String(ip || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (!clean) return true;
  if (clean.startsWith("::ffff:")) {
    const mapped = clean.slice(7);
    if (net.isIP(mapped) === 4) return isPrivateIpAddress(mapped);
  }
  const ipVer = net.isIP(clean);
  if (ipVer === 4) {
    const parts = clean.split(".").map(Number);
    if (parts[0] === 0) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] >= 224) return true;
  }
  if (ipVer === 6) {
    if (clean === "::" || clean === "::1" || clean.startsWith("fe80:") || clean.startsWith("fc") || clean.startsWith("fd")) {
      return true;
    }
  }
  return false;
}

export function isPrivateOrLocalIp(host) {
  const clean = String(host || "").replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !clean ||
    clean === "localhost" ||
    clean === "127.0.0.1" ||
    clean === "::1" ||
    clean === "::" ||
    clean === "0.0.0.0" ||
    clean.endsWith(".local") ||
    clean.endsWith(".internal")
  ) {
    return true;
  }
  return isPrivateIpAddress(clean);
}

export async function assertSafeRemoteUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid media asset URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Rejected non-HTTPS media asset URL.");
  }
  const host = parsed.hostname;
  if (!host || isPrivateOrLocalIp(host)) {
    throw new Error("Rejected disallowed media asset host.");
  }
  if (!net.isIP(host.replace(/^\[|\]$/g, ""))) {
    const records = await dns.lookup(host, { all: true }).catch(() => []);
    if (!records.length || records.some((rec) => isPrivateIpAddress(rec.address))) {
      throw new Error("Rejected media host resolving to private or unresolvable address.");
    }
  }
  return parsed.toString();
}

function extFromMime(mime) {
  const clean = String(mime || "").toLowerCase().split(";")[0].trim();
  if (clean === "image/jpeg" || clean === "image/jpg") return "jpg";
  if (clean === "image/webp") return "webp";
  if (clean === "image/gif") return "gif";
  if (clean === "video/mp4") return "mp4";
  if (clean === "video/webm") return "webm";
  if (clean === "video/quicktime") return "mov";
  return "png";
}

function mimeFromExt(ext) {
  const clean = String(ext || "").toLowerCase().replace(/^\./, "");
  if (clean === "jpg" || clean === "jpeg") return "image/jpeg";
  if (clean === "webp") return "image/webp";
  if (clean === "gif") return "image/gif";
  if (clean === "mp4") return "video/mp4";
  if (clean === "webm") return "video/webm";
  if (clean === "mov") return "video/quicktime";
  return "image/png";
}

function detectImageMime(buffer) {
  if (!buffer || buffer.byteLength < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  const head = buffer.subarray(0, 6).toString("ascii");
  if (head === "GIF87a" || head === "GIF89a") {
    return "image/gif";
  }
  return null;
}

function detectVideoMime(buffer) {
  if (!buffer || buffer.byteLength < 16) return null;
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    return "video/mp4";
  }
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "video/webm";
  }
  return null;
}

function safeAssetFilePath(fileName) {
  const resolved = path.resolve(MEDIA_DIR, path.basename(fileName));
  if (!resolved.startsWith(MEDIA_DIR + path.sep)) {
    throw new Error("Invalid asset storage path.");
  }
  return resolved;
}

function saveMediaBuffer({ buffer, mimeType, kind, prompt, enhancedPrompt, provider, model, aspectRatio, durationSec }) {
  if (!buffer || buffer.byteLength === 0) {
    throw new Error("Media engine returned empty output.");
  }
  if (buffer.byteLength > MAX_MEDIA_BYTES) {
    throw new Error("Generated media exceeds maximum allowed size.");
  }
  const id = makeAssetId(kind === "video" ? "vid" : "img");
  const ext = extFromMime(mimeType);
  const fileName = `${id}.${ext}`;
  const filePath = safeAssetFilePath(fileName);
  fs.writeFileSync(filePath, buffer);

  const item = {
    id,
    kind,
    url: `/api/media/assets/${id}`,
    mimeType: mimeType || mimeFromExt(ext),
    prompt,
    ...(enhancedPrompt && enhancedPrompt !== prompt ? { enhancedPrompt } : {}),
    aspectRatio,
    durationSec,
    provider,
    model,
    fileName,
    size: buffer.byteLength,
    createdAt: Date.now(),
  };
  mediaAssets.set(id, item);
  pruneOldAssets();
  return publicAssetItem(item);
}

function publicAssetItem(item) {
  if (!item) return undefined;
  return {
    id: item.id,
    kind: item.kind,
    url: item.url,
    mimeType: item.mimeType,
    prompt: item.prompt,
    ...(item.enhancedPrompt ? { enhancedPrompt: item.enhancedPrompt } : {}),
    aspectRatio: item.aspectRatio,
    durationSec: item.durationSec,
    provider: item.provider,
    model: item.model,
    createdAt: item.createdAt,
  };
}

function pruneOldAssets() {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [id, item] of mediaAssets.entries()) {
    if (item.createdAt < cutoff) {
      try {
        fs.unlinkSync(safeAssetFilePath(item.fileName));
      } catch {
        // Ignore cleanup error
      }
      mediaAssets.delete(id);
    }
  }
  for (const [jobId, job] of mediaJobs.entries()) {
    if ((job.finishedAt || job.startedAt) < cutoff) {
      mediaJobs.delete(jobId);
    }
  }
}

async function downloadRemoteMedia(rawUrl, signal, fallbackMime = "application/octet-stream") {
  let currentUrl = await assertSafeRemoteUrl(rawUrl);
  let res;
  for (let hop = 0; hop < 3; hop += 1) {
    res = await fetch(currentUrl, { signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect missing Location header.");
      const nextUrl = new URL(location, currentUrl).toString();
      currentUrl = await assertSafeRemoteUrl(nextUrl);
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    throw new Error(`Failed downloading generated media (HTTP ${res?.status || "ERR"}).`);
  }
  const arr = await res.arrayBuffer();
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() || fallbackMime;
  return { buffer: Buffer.from(arr), mimeType: contentType };
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: match[1],
    base64: match[2],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function findDiskAssetById(assetId) {
  if (!assetId || !ID_RE.test(assetId)) return null;
  for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "mp4", "webm", "mov"]) {
    const fileName = `${assetId}.${ext}`;
    const candidate = safeAssetFilePath(fileName);
    if (fs.existsSync(candidate)) {
      return {
        id: assetId,
        fileName,
        filePath: candidate,
        mimeType: mimeFromExt(ext),
        kind: ["mp4", "webm", "mov"].includes(ext) ? "video" : "image",
      };
    }
  }
  return null;
}

function resolveSourceImage(sourceImageDataUrl, sourceMediaId) {
  if (sourceImageDataUrl) {
    const parsed = parseDataUrl(sourceImageDataUrl);
    if (parsed) return { ...parsed, originalPrompt: undefined };
  }
  if (sourceMediaId && ID_RE.test(sourceMediaId)) {
    const asset = mediaAssets.get(sourceMediaId);
    if (asset && asset.kind === "image") {
      const buf = fs.readFileSync(safeAssetFilePath(asset.fileName));
      return {
        mimeType: asset.mimeType,
        base64: buf.toString("base64"),
        buffer: buf,
        originalPrompt: asset.prompt,
      };
    }
    const disk = findDiskAssetById(sourceMediaId);
    if (disk && disk.kind === "image") {
      const buf = fs.readFileSync(disk.filePath);
      return {
        mimeType: disk.mimeType,
        base64: buf.toString("base64"),
        buffer: buf,
        originalPrompt: undefined,
      };
    }
  }
  return null;
}

function imageDimensions(aspectRatio) {
  if (aspectRatio === "16:9") return { width: 1280, height: 720, hordeWidth: 640, hordeHeight: 384, openai: "1536x1024" };
  if (aspectRatio === "4:3") return { width: 1024, height: 768, hordeWidth: 640, hordeHeight: 512, openai: "1536x1024" };
  if (aspectRatio === "9:16") return { width: 720, height: 1280, hordeWidth: 384, hordeHeight: 640, openai: "1024x1536" };
  if (aspectRatio === "3:4") return { width: 768, height: 1024, hordeWidth: 512, hordeHeight: 640, openai: "1024x1536" };
  return { width: 1024, height: 1024, hordeWidth: 512, hordeHeight: 512, openai: "1024x1024" };
}

function videoDimensions(aspectRatio) {
  if (aspectRatio === "9:16") return { width: 720, height: 1280, hordeWidth: 384, hordeHeight: 640 };
  if (aspectRatio === "1:1") return { width: 720, height: 720, hordeWidth: 512, hordeHeight: 512 };
  return { width: 1280, height: 720, hordeWidth: 640, hordeHeight: 384 };
}

export function getMediaCapabilities(noTrackKey, _models, geminiKey) {
  const hasNoTrack = Boolean(noTrackKey && String(noTrackKey).trim());
  const hasGemini = Boolean((geminiKey || process.env.GEMINI_API_KEY) && String(geminiKey || process.env.GEMINI_API_KEY).trim());
  const imgReady = hasNoTrack || hasGemini;
  const vidReady = hasNoTrack || hasGemini;
  const imageProviders = [];
  const videoProviders = [];
  if (hasGemini) {
    imageProviders.push("gemini");
    videoProviders.push("gemini");
  }
  if (hasNoTrack) {
    imageProviders.push("notrack");
    videoProviders.push("notrack");
  }
  return {
    imageReady: imgReady,
    videoReady: vidReady,
    imageProviders,
    videoProviders,
  };
}

function emitJobUpdate(job) {
  const payload = serializeJob(job);
  const subs = jobSubscribers.get(job.jobId);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(payload);
    } catch {
      // Ignore subscriber failure
    }
  }
}

function serializeJob(job) {
  return {
    jobId: job.jobId,
    kind: job.kind,
    mode: job.mode,
    status: job.status,
    stage: job.stage,
    progress: typeof job.progress === "number" ? job.progress : null,
    prompt: job.prompt,
    ...(job.enhancedPrompt ? { enhancedPrompt: job.enhancedPrompt } : {}),
    aspectRatio: job.aspectRatio,
    provider: job.provider,
    model: job.model,
    partialUrl: job.partialUrl,
    media: job.media,
    error: job.error,
    errorHint: job.errorHint,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

function updateJob(job, patch) {
  const next = { ...patch };
  if (typeof next.progress === "number" && typeof job.progress === "number" && next.status !== "queued") {
    next.progress = Math.max(job.progress, next.progress);
  }
  Object.assign(job, next);
  emitJobUpdate(job);
}

// ---------- NoTrack.ai Prompt & Storyboard Intelligence ----------

const QUALITY_NEGATIVE_PROMPT =
  "extra fingers, deformed hands, mutated hands, fused fingers, six fingers, bad anatomy, malformed limbs, ugly face, distorted eyes, blurry, lowres, pixelated, noisy, jpeg artifacts, watermark, signature, text, cropped, out of frame";

function cleanRequestPhrase(rawPrompt) {
  return String(rawPrompt || "")
    .trim()
    .replace(/^(?:please\s+)?(?:can you\s+)?(?:create|generate|make|draw|paint|render|design|show)\s+(?:me\s+)?(?:an?\s+)?(?:high[- ]?quality\s+|realistic\s+|anime\s+)?(?:image|picture|photo|portrait|illustration|artwork|drawing|wallpaper)\s+(?:of|about|showing)?\s*/i, "")
    .trim();
}

function isAnimeOrIllustrationIntent(prompt) {
  return /\b(anime|manga|naruto|sasuke|goku|luffy|zoro|gojo|demon slayer|studio ghibli|chibi|waifu|illustration|cartoon|comic|cel[- ]?shad|2d|sketch|vector|fanart|ninja|shinobi|superhero)\b/i.test(
    String(prompt || "")
  );
}

const WORKSPACE_VIRTUAL_KEY_RE = /^sujith_ws_ntk_[0-9a-f]{32}$/i;

function isWorkspaceVirtualNoTrackKey(apiKey) {
  const clean = String(apiKey || "").trim();
  return Boolean(clean && WORKSPACE_VIRTUAL_KEY_RE.test(clean));
}

function buildPositiveVisualPrompt(rawPrompt) {
  const cleaned = cleanRequestPhrase(rawPrompt) || String(rawPrompt || "").trim();
  if (!cleaned) return "scenic detailed artwork, masterpiece, sharp focus";
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  const anime = isAnimeOrIllustrationIntent(cleaned);
  if (wordCount <= 5) {
    return anime
      ? `${cleaned}, vibrant anime key visual, crisp linework, expressive eyes, balanced natural pose, cel shading, studio lighting, masterpiece, sharp focus`
      : `${cleaned}, ultra detailed studio composition, crisp natural lighting, sharp focus, rich textures, realistic proportions, balanced framing`;
  }
  if (!/\b(quality|detailed|masterpiece|sharp|lighting|focus|4k|studio|cinematic|anime)\b/i.test(cleaned)) {
    return anime
      ? `${cleaned}, vibrant anime illustration, crisp clean linework, balanced proportions, studio lighting, sharp focus`
      : `${cleaned}, crisp detailed lighting, sharp focus, balanced framing`;
  }
  return cleaned;
}

function buildSmartEnhancedPrompt({ rawPrompt, kind, mode, aspectRatio, originalPrompt }) {
  const base = cleanRequestPhrase(rawPrompt) || String(rawPrompt || "").trim();
  if (!base) return rawPrompt;
  const aspectHint =
    aspectRatio === "16:9"
      ? "wide cinematic 16:9 composition"
      : aspectRatio === "9:16"
        ? "vertical 9:16 full-height framing"
        : aspectRatio === "4:3"
          ? "classic 4:3 editorial framing"
          : aspectRatio === "3:4"
            ? "vertical 3:4 portrait framing"
            : "balanced square composition";

  if (mode === "edit" && originalPrompt) {
    return `${originalPrompt} — edited to apply: ${base}, seamless lighting consistency, ${aspectHint}`;
  }
  if (kind === "video") {
    return `${base}, smooth cinematic camera motion, rich atmospheric depth lighting, coherent temporal detail, ${aspectHint}`;
  }
  const hasLogoIntent = /\b(logo|emblem|icon|monogram|badge|brand|mark)\b/i.test(base);
  if (hasLogoIntent) {
    return `${base}, crisp vector-clean iconic silhouette, balanced negative space, refined studio contrast, sharp geometry, ${aspectHint}`;
  }
  const positive = buildPositiveVisualPrompt(base);
  return positive.toLowerCase().includes("framing") || positive.toLowerCase().includes("composition")
    ? positive
    : `${positive}, ${aspectHint}`;
}

function splitPositiveAndNegativePrompt(promptText) {
  const raw = String(promptText || "").trim();
  const idx = raw.indexOf("###");
  if (idx >= 0) {
    return {
      positive: raw.slice(0, idx).trim(),
      negative: raw.slice(idx + 3).trim() || QUALITY_NEGATIVE_PROMPT,
    };
  }
  return {
    positive: raw,
    negative: QUALITY_NEGATIVE_PROMPT,
  };
}

function attachHordeNegativePrompt(promptText) {
  const { positive, negative } = splitPositiveAndNegativePrompt(promptText);
  return `${positive.slice(0, 680)} ### ${negative.slice(0, 210)}`;
}

async function refinePromptWithNoTrack({ apiKey, prompt, kind, mode, sourceImage, signal }) {
  try {
    const timeoutSig = AbortSignal.timeout(8000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;

    let instruction = "";
    if (kind === "image" && mode === "edit") {
      instruction = sourceImage?.originalPrompt
        ? `Previous image description: "${sourceImage.originalPrompt}". User edit instruction: "${prompt}". Combine these into one single, concise English visual image generation prompt preserving the original character/subject and applying the exact requested change. Output ONLY the final image prompt, max 60 words.`
        : `User wants to edit or reimagine an image with instruction: "${prompt}". Write one crisp, vivid English visual image prompt incorporating this edit. Output ONLY the final image prompt, max 60 words.`;
    } else if (kind === "video") {
      instruction = `Turn this user request into a JSON array of exactly 3 short cinematic keyframe image prompts describing Scene 1 (opening), Scene 2 (middle action), and Scene 3 (dramatic close) in coherent anime/cinematic visual detail. User request: "${prompt}". Output ONLY raw JSON array of 3 strings.`;
    } else {
      instruction = `Expand the user request into one crisp, studio-quality English Stable Diffusion / FLUX image prompt (exact subject traits, iconic outfit/colors if named character, clean natural face & hands, lighting, composition, art style such as anime cel-shaded key visual or photorealistic studio shot). User request: "${prompt}". Output ONLY the prompt text, max 55 words, no quotes or intro.`;
    }

    const messages =
      sourceImage && mode === "edit" && !sourceImage.originalPrompt
        ? [
            {
              role: "user",
              content: [
                { type: "text", text: instruction },
                { type: "image_url", image_url: { url: `data:${sourceImage.mimeType};base64,${sourceImage.base64}` } },
              ],
            },
          ]
        : [{ role: "user", content: instruction }];

    const res = await fetch(`${NOTRACK_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "notrack-uncensored",
        messages,
        max_tokens: 260,
        temperature: 0.55,
        stream: false,
      }),
      signal: combinedSignal,
    });

    if (!res.ok) return null;
    const json = await res.json();
    const content = String(json?.choices?.[0]?.message?.content || "").trim();
    if (!content) return null;

    if (kind === "video") {
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length >= 2) {
          return parsed.slice(0, 3).map((s) => String(s).trim()).filter(Boolean);
        }
      }
      return null;
    }
    return content
      .replace(/^(?:prompt|image prompt|final prompt)\s*:\s*/i, "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .slice(0, 500);
  } catch {
    return null;
  }
}

// ---------- Real Google Gemini Image Generation & Editing ----------

async function tryGeminiImageGeneration({ apiKey, job, sourceImage, signal }) {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key || typeof key !== "string" || !key.trim()) return null;

  try {
    const ai = new GoogleGenAI({
      apiKey: key.trim(),
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const validAspectRatios = ["1:1", "3:4", "4:3", "9:16", "16:9"];
    const aspect = validAspectRatios.includes(job.aspectRatio) ? job.aspectRatio : "1:1";

    const activePrompt = job.enhancedPrompt || job.prompt;
    let response;
    if (job.mode === "edit" && sourceImage?.base64) {
      updateJob(job, {
        status: "generating",
        stage: "Editing image with Gemini...",
        provider: "Google Gemini",
        model: "gemini-3.1-flash-lite-image",
        progress: 35,
      });

      response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: {
          parts: [
            {
              inlineData: {
                data: sourceImage.base64,
                mimeType: sourceImage.mimeType || "image/png",
              },
            },
            {
              text: activePrompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspect,
          },
        },
      });
    } else {
      updateJob(job, {
        status: "generating",
        stage: "Generating image with Gemini...",
        provider: "Google Gemini",
        model: "gemini-3.1-flash-lite-image",
        progress: 35,
      });

      response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-image",
        contents: {
          parts: [{ text: activePrompt }],
        },
        config: {
          imageConfig: {
            aspectRatio: aspect,
          },
        },
      });
    }

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const buf = Buffer.from(part.inlineData.data, "base64");
        const mime = part.inlineData.mimeType || detectImageMime(buf) || "image/png";
        return saveMediaBuffer({
          buffer: buf,
          mimeType: mime,
          kind: "image",
          prompt: job.prompt,
          enhancedPrompt: job.enhancedPrompt,
          provider: "Google Gemini",
          model: "gemini-3.1-flash-lite-image",
          aspectRatio: aspect,
        });
      }
    }
  } catch (err) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    // If Gemini fails or key not permitted, log warning and let fallback providers execute
    console.warn("Gemini image generation attempt notice:", err?.message || err);
  }
  return null;
}

// ---------- Direct NoTrack Native Media Attempt ----------

async function tryNoTrackDirectImage({ apiKey, job, sourceImage, signal }) {
  const activePrompt = job.enhancedPrompt || job.prompt;
  try {
    const timeoutSig = AbortSignal.timeout(14000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    const dims = imageDimensions(job.aspectRatio);

    let res;
    if (job.mode === "edit" && sourceImage) {
      const form = new FormData();
      form.append("prompt", activePrompt);
      form.append("image", new Blob([sourceImage.buffer], { type: sourceImage.mimeType }), "source.png");
      form.append("response_format", "b64_json");
      res = await fetch(`${NOTRACK_API_BASE}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: combinedSignal,
      });
    } else {
      res = await fetch(`${NOTRACK_API_BASE}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: activePrompt,
          n: 1,
          size: dims.openai,
          response_format: "b64_json",
        }),
        signal: combinedSignal,
      });
      if (!res.ok && (res.status === 400 || res.status === 422)) {
        res = await fetch(`${NOTRACK_API_BASE}/images/generations`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prompt: activePrompt, n: 1 }),
          signal: combinedSignal,
        });
      }
    }

    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const first = json?.data?.[0];
    if (first?.b64_json) {
      const buf = Buffer.from(first.b64_json, "base64");
      const mime = detectImageMime(buf) || "image/png";
      return saveMediaBuffer({
        buffer: buf,
        mimeType: mime,
        kind: "image",
        prompt: job.prompt,
        enhancedPrompt: job.enhancedPrompt,
        provider: "NoTrack.ai",
        model: json?.model || "notrack-image",
        aspectRatio: job.aspectRatio,
      });
    }
    if (first?.url) {
      const dl = await downloadRemoteMedia(first.url, combinedSignal, "image/png");
      const mime = detectImageMime(dl.buffer);
      if (mime) {
        return saveMediaBuffer({
          buffer: dl.buffer,
          mimeType: mime,
          kind: "image",
          prompt: job.prompt,
          enhancedPrompt: job.enhancedPrompt,
          provider: "NoTrack.ai",
          model: json?.model || "notrack-image",
          aspectRatio: job.aspectRatio,
        });
      }
    }
  } catch {
    // Fall through cleanly to NoTrack Vision / GPU pipeline
  }
  return null;
}

async function tryNoTrackDirectVideo({ apiKey, job, signal }) {
  const activePrompt = job.enhancedPrompt || job.prompt;
  try {
    const timeoutSig = AbortSignal.timeout(15000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    const res = await fetch(`${NOTRACK_API_BASE}/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: activePrompt }),
      signal: combinedSignal,
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    const vidUrl = json?.data?.[0]?.url || json?.url || json?.video_url;
    if (vidUrl) {
      const dl = await downloadRemoteMedia(vidUrl, combinedSignal, "video/mp4");
      const mime = detectVideoMime(dl.buffer);
      if (mime) {
        return saveMediaBuffer({
          buffer: dl.buffer,
          mimeType: mime,
          kind: "video",
          prompt: job.prompt,
          enhancedPrompt: job.enhancedPrompt,
          provider: "NoTrack.ai",
          model: json?.model || "notrack-video",
          aspectRatio: job.aspectRatio,
        });
      }
    }
  } catch {
    // Fall through cleanly
  }
  return null;
}

// ---------- Keyless GPU Studio Image Renderers ----------

const HORDE_AGENT = "SujithIDE:2.0:app";
const HORDE_ANIME_MODELS = [
  "MeinaMix",
  "Flat-2D Animerge",
  "Counterfeit",
  "Rev Animated",
  "GhostMix",
  "Nova Anime XL",
  "Nova Flat XL",
  "Cetus-Mix",
  "CamelliaMix 2.5D",
  "Dreamshaper",
];
const HORDE_GENERAL_MODELS = [
  "Juggernaut XL",
  "AlbedoBase XL 3.1",
  "AlbedoBase XL (SDXL)",
  "Deliberate 3.0",
  "Deliberate",
  "AbsoluteReality",
  "Realistic Vision",
  "Dreamshaper",
  "Rev Animated",
  "Edge Of Realism",
  "Analog Madness",
  "ICBINP - I Can't Believe It's Not Photography",
];

let cachedHordeModels = { fetchedAt: 0, onlineNames: new Set() };

async function getOnlineHordeModelNames(signal) {
  if (Date.now() - cachedHordeModels.fetchedAt < 60_000 && cachedHordeModels.onlineNames.size > 0) {
    return cachedHordeModels.onlineNames;
  }
  try {
    const timeoutSig = AbortSignal.timeout(4000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    const res = await fetch("https://aihorde.net/api/v2/status/models?type=image", {
      headers: { "Client-Agent": HORDE_AGENT },
      signal: combinedSignal,
    });
    if (!res.ok) return cachedHordeModels.onlineNames;
    const list = await res.json().catch(() => null);
    if (!Array.isArray(list)) return cachedHordeModels.onlineNames;
    const online = new Set(
      list
        .filter((m) => m && m.count >= 1 && !/nsfw|hentai|inpaint|furry|pixel|stable_diffusion$/i.test(String(m.name || "")))
        .map((m) => m.name)
    );
    cachedHordeModels = { fetchedAt: Date.now(), onlineNames: online };
  } catch {
    // Keep last cache or empty set
  }
  return cachedHordeModels.onlineNames;
}

function extractGradioImageUrl(sseText) {
  const lines = String(sseText || "").split(/\r?\n/);
  let currentEvent = "";
  for (const line of lines) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:") && currentEvent === "complete") {
      try {
        const parsed = JSON.parse(line.slice(5).trim());
        const item = Array.isArray(parsed) ? parsed[0] : parsed;
        const url = item?.url || (Array.isArray(item) ? item[0]?.url : null);
        if (typeof url === "string" && url.startsWith("https://")) {
          return url;
        }
      } catch {
        // Ignore malformed SSE payload
      }
    }
  }
  return null;
}

async function tryGradioStudioImage(visualPrompt, { width, height, seed, signal, onProgress }) {
  const { positive, negative } = splitPositiveAndNegativePrompt(visualPrompt);
  const targetW = Math.max(512, Math.min(1024, Math.round(width / 64) * 64));
  const targetH = Math.max(512, Math.min(1024, Math.round(height / 64) * 64));

  const spaces = [
    {
      model: "notrack-sd3.5",
      endpoint: "https://stabilityai-stable-diffusion-3-5-large-turbo.hf.space/gradio_api/call/infer",
      data: [positive, seed, true, targetW, targetH, 4],
    },
    {
      model: "notrack-sd3",
      endpoint: "https://stabilityai-stable-diffusion-3-medium.hf.space/gradio_api/call/infer",
      data: [positive, negative, seed, true, targetW, targetH, 5, 22],
    },
    {
      model: "notrack-flux",
      endpoint: "https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/call/infer",
      data: [positive, seed, true, targetW, targetH, 4],
    },
  ];

  const attemptSpace = async (space, localAbort) => {
    const combined = signal ? AbortSignal.any([signal, localAbort.signal]) : localAbort.signal;
    const postSig = AbortSignal.any([combined, AbortSignal.timeout(4500)]);
    const postRes = await fetch(space.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: space.data }),
      signal: postSig,
    });
    if (!postRes.ok) throw new Error(`HTTP ${postRes.status}`);
    const postJson = await postRes.json().catch(() => null);
    const eventId = postJson?.event_id;
    if (!eventId || !/^[A-Za-z0-9_-]{8,80}$/.test(String(eventId))) {
      throw new Error("No event ID");
    }

    const sseSig = AbortSignal.any([combined, AbortSignal.timeout(15000)]);
    const sseRes = await fetch(`${space.endpoint}/${encodeURIComponent(eventId)}`, { signal: sseSig });
    if (!sseRes.ok) throw new Error(`SSE ${sseRes.status}`);
    const sseText = await sseRes.text();
    if (!sseText.includes("event: complete")) throw new Error("Quota exhausted");

    const remoteUrl = extractGradioImageUrl(sseText);
    if (!remoteUrl) throw new Error("Missing image URL");

    onProgress?.({ stage: "Polishing details", progress: 88 });
    const dl = await downloadRemoteMedia(remoteUrl, sseSig, "image/webp");
    const verifiedMime = detectImageMime(dl.buffer);
    if (!verifiedMime || dl.buffer.byteLength < 4096) throw new Error("Invalid bytes");
    localAbort.abort();
    return { buffer: dl.buffer, mimeType: verifiedMime, model: space.model, provider: "Hugging Face Spaces" };
  };

  const localAbort = new AbortController();
  try {
    return await Promise.any(spaces.map((s) => attemptSpace(s, localAbort)));
  } catch {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    return null;
  } finally {
    localAbort.abort();
  }
}

function sleepWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Cancelled", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    };
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function cancelAiHordeJob(hordeId) {
  if (!hordeId) return;
  try {
    await fetch(`https://aihorde.net/api/v2/generate/status/${encodeURIComponent(hordeId)}`, {
      method: "DELETE",
      headers: {
        apikey: "0000000000",
        "Client-Agent": HORDE_AGENT,
      },
      signal: AbortSignal.timeout(4000),
    });
  } catch {
    // Ignore cleanup errors
  }
}

async function renderWithAiHorde(visualPrompt, { width, height, seed, job, signal, onProgress }) {
  const hordePrompt = attachHordeNegativePrompt(visualPrompt);
  const w = Math.max(384, Math.min(576, Math.round(width / 64) * 64));
  const h = Math.max(384, Math.min(576, Math.round(height / 64) * 64));

  const onlineModels = await getOnlineHordeModelNames(signal);
  const preferredPool = isAnimeOrIllustrationIntent(visualPrompt) ? HORDE_ANIME_MODELS : HORDE_GENERAL_MODELS;
  const curatedModels = preferredPool.filter((m) => onlineModels.has(m));

  const submitJob = async (reqW, reqH, steps, models) => {
    const timeoutSig = AbortSignal.timeout(12000);
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    return fetch("https://aihorde.net/api/v2/generate/async", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: "0000000000",
        "Client-Agent": HORDE_AGENT,
      },
      body: JSON.stringify({
        prompt: hordePrompt,
        ...(Array.isArray(models) && models.length > 0 ? { models } : {}),
        params: {
          width: reqW,
          height: reqH,
          steps,
          n: 1,
          sampler_name: "k_euler_a",
          cfg_scale: 7,
          seed: String(seed),
        },
        nsfw: false,
        censor_nsfw: true,
        r2: true,
      }),
      signal: combinedSignal,
    });
  };

  let usingCurated = curatedModels.length > 0;
  let res = await submitJob(usingCurated ? 512 : w, usingCurated ? 512 : h, usingCurated ? 16 : 18, usingCurated ? curatedModels : undefined);
  if (res.status === 403 || res.status === 400) {
    usingCurated = false;
    res = await submitJob(512, 512, 16, undefined);
  }
  if (!res.ok) {
    throw new Error(`Image cluster queue busy (HTTP ${res.status}).`);
  }

  let created = await res.json().catch(() => null);
  let hordeId = created?.id;
  if (!hordeId) {
    throw new Error("Image cluster did not assign a job ID.");
  }

  if (job) {
    job.onCancel = () => cancelAiHordeJob(hordeId);
  }

  const startedAt = Date.now();
  let initialWait = 0;
  let processingStartedAt = 0;
  let maxPct = 24;
  let switchedToUniversal = !usingCurated && w === 512 && h === 512;

  try {
    for (let poll = 0; poll < 12; poll += 1) {
      if (signal?.aborted) {
        await cancelAiHordeJob(hordeId);
        throw new DOMException("Cancelled", "AbortError");
      }

      await sleepWithAbort(poll === 0 ? 1200 : 1500, signal);

      const chkTimeout = AbortSignal.timeout(6000);
      const chkSig = signal ? AbortSignal.any([signal, chkTimeout]) : chkTimeout;
      const chkRes = await fetch(`https://aihorde.net/api/v2/generate/check/${encodeURIComponent(hordeId)}`, {
        headers: { "Client-Agent": HORDE_AGENT },
        signal: chkSig,
      });
      if (!chkRes.ok) continue;

      const chk = await chkRes.json().catch(() => null);
      if (!chk) continue;
      if (chk.faulted || chk.is_possible === false) {
        if (usingCurated && !switchedToUniversal) {
          usingCurated = false;
          switchedToUniversal = true;
          await cancelAiHordeJob(hordeId);
          const fallbackRes = await submitJob(512, 512, 18, undefined);
          if (fallbackRes.ok) {
            const fallbackJson = await fallbackRes.json().catch(() => null);
            if (fallbackJson?.id) {
              hordeId = fallbackJson.id;
              if (job) job.onCancel = () => cancelAiHordeJob(hordeId);
              continue;
            }
          }
        }
        throw new Error("Image cluster worker unavailable for this request.");
      }

      if (typeof chk.wait_time === "number" && chk.wait_time > initialWait) {
        initialWait = chk.wait_time;
      }

      // If curated pool sits in deep anonymous queue at poll >= 2 or custom aspect stalls, switch seamlessly to fast 512x512 worker
      const curatedBacklogged = usingCurated && poll >= 2 && !chk.done && !chk.processing && (chk.queue_position || 0) > 35;
      const customStalled = !switchedToUniversal && poll >= 5 && !chk.done && !chk.processing;
      if (curatedBacklogged || customStalled) {
        usingCurated = false;
        switchedToUniversal = true;
        await cancelAiHordeJob(hordeId);
        const fallbackRes = await submitJob(512, 512, 18, undefined);
        if (fallbackRes.ok) {
          const fallbackJson = await fallbackRes.json().catch(() => null);
          if (fallbackJson?.id) {
            hordeId = fallbackJson.id;
            if (job) job.onCancel = () => cancelAiHordeJob(hordeId);
            continue;
          }
        }
      }

      if (chk.done) {
        maxPct = Math.max(maxPct, 95);
        onProgress?.({ stage: "Polishing details", progress: maxPct });
        const stTimeout = AbortSignal.timeout(10000);
        const stSig = signal ? AbortSignal.any([signal, stTimeout]) : stTimeout;
        const stRes = await fetch(`https://aihorde.net/api/v2/generate/status/${encodeURIComponent(hordeId)}`, {
          headers: { "Client-Agent": HORDE_AGENT },
          signal: stSig,
        });
        if (!stRes.ok) {
          throw new Error(`Failed to fetch generated image status (HTTP ${stRes.status}).`);
        }
        const statusJson = await stRes.json().catch(() => null);
        const gen = statusJson?.generations?.[0];
        if (!gen?.img) {
          throw new Error("Image cluster returned no output image.");
        }
        if (gen.censored) {
          throw new Error("Generated frame tripped worker safety filter; please rephrase or retry.");
        }

        let buffer;
        let mimeType;
        if (typeof gen.img === "string" && gen.img.startsWith("https://")) {
          const dl = await downloadRemoteMedia(gen.img, signal, "image/webp");
          buffer = dl.buffer;
          mimeType = detectImageMime(buffer) || dl.mimeType;
        } else {
          buffer = Buffer.from(String(gen.img), "base64");
          mimeType = detectImageMime(buffer) || "image/webp";
        }
        const verifiedMime = detectImageMime(buffer);
        if (!verifiedMime || buffer.byteLength < 2048) {
          throw new Error("Image cluster returned invalid image bytes.");
        }
        return { buffer, mimeType: verifiedMime, model: gen.model || "Stable Diffusion", provider: "AI Horde" };
      }

      if (chk.processing > 0) {
        if (!processingStartedAt) processingStartedAt = Date.now();
        const procSec = (Date.now() - processingStartedAt) / 1000;
        maxPct = Math.max(maxPct, Math.min(92, Math.max(58, Math.round(58 + procSec * 4.5))));
        onProgress?.({ stage: "Polishing details", progress: maxPct });
      } else {
        const elapsedSec = (Date.now() - startedAt) / 1000;
        const estTotal = Math.max(10, Math.min(25, initialWait || 14));
        maxPct = Math.max(maxPct, Math.min(54, Math.max(26, Math.round(26 + (elapsedSec / estTotal) * 26))));
        onProgress?.({ stage: maxPct >= 42 ? "Polishing details" : "Creating image...", progress: maxPct });
      }
    }
    throw new Error("Image generation timed out waiting for GPU worker.");
  } catch (err) {
    await cancelAiHordeJob(hordeId);
    throw err;
  } finally {
    if (job) job.onCancel = null;
  }
}

function chooseStudioPalette(promptText, seed = 0) {
  const lower = String(promptText || "").toLowerCase();
  if (/\b(sunset|sunrise|orange|gold|fire|autumn|warm|desert|solar)\b/.test(lower)) {
    return { r1: 24, g1: 16, b1: 42, r2: 234, g2: 88, b2: 12, accR: 251, accG: 191, accB: 36 };
  }
  if (/\b(ocean|sea|water|aqua|ice|arctic|cyber|neon|cyan|sky|night|space|galaxy|cosmos)\b/.test(lower)) {
    return { r1: 10, g1: 22, b1: 52, r2: 14, g2: 116, b2: 196, accR: 56, accG: 189, accB: 248 };
  }
  if (/\b(forest|nature|emerald|green|jungle|leaf|aurora|mountain|meadow)\b/.test(lower)) {
    return { r1: 8, g1: 32, b1: 28, r2: 16, g2: 128, b2: 96, accR: 110, accG: 231, accB: 183 };
  }
  if (/\b(violet|purple|anime|sakura|magenta|pink|dream|magic|fantasy)\b/.test(lower)) {
    return { r1: 26, g1: 14, b1: 52, r2: 147, g2: 51, b2: 234, accR: 244, accG: 114, accB: 182 };
  }
  const palettes = [
    { r1: 15, g1: 23, b1: 42, r2: 37, g2: 99, b2: 235, accR: 96, accG: 165, accB: 250 },
    { r1: 17, g1: 24, b1: 39, r2: 79, g2: 70, b2: 229, accR: 129, accG: 140, accB: 248 },
    { r1: 12, g1: 28, b1: 46, r2: 13, g2: 148, b2: 136, accR: 45, accG: 212, accB: 191 },
  ];
  return palettes[Math.abs(seed) % palettes.length];
}

async function renderLocalStudioFallbackImage(visualPrompt, { width, height, seed, sourceImage, signal, onProgress }) {
  const workDir = fs.mkdtempSync(path.join(MEDIA_DIR, "ffimg-"));
  const outPath = path.join(workDir, "fallback.png");
  const targetW = Math.max(384, Math.min(1280, Math.round(width / 2) * 2));
  const targetH = Math.max(384, Math.min(1280, Math.round(height / 2) * 2));

  try {
    onProgress?.({ stage: "Rendering studio fallback frame...", progress: 76 });
    if (sourceImage?.buffer) {
      const srcExt = extFromMime(sourceImage.mimeType);
      const srcPath = path.join(workDir, `source.${srcExt}`);
      fs.writeFileSync(srcPath, sourceImage.buffer);
      const lower = String(visualPrompt || "").toLowerCase();
      const bright = /\b(bright|light|glow|day)\b/.test(lower) ? "0.06" : /\b(dark|night|noir|moody)\b/.test(lower) ? "-0.08" : "0.02";
      const sat = /\b(monochrome|black and white|grayscale|bw)\b/.test(lower) ? "0.1" : "1.22";
      const hueShift = /\b(blue|cool|cyan|night)\b/.test(lower) ? "-18" : /\b(warm|sunset|gold|red)\b/.test(lower) ? "14" : "6";
      await runFfmpeg(
        [
          "-i", srcPath,
          "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=increase,crop=${targetW}:${targetH},eq=brightness=${bright}:contrast=1.08:saturation=${sat},hue=h=${hueShift},vignette=PI/5,format=rgb24`,
          "-frames:v", "1",
          outPath,
        ],
        { totalDurationSec: 1, signal }
      );
    } else {
      const p = chooseStudioPalette(visualPrompt, seed);
      const phase = ((Math.abs(seed) % 360) / 180) * Math.PI;
      const cx = (0.35 + ((Math.abs(seed) % 30) / 100)).toFixed(2);
      const cy = (0.35 + ((Math.abs(seed >> 4) % 30) / 100)).toFixed(2);
      const geqExpr =
        `r='clip(${p.r1}+(${p.r2}-${p.r1})*(0.55*X/W+0.45*Y/H)+(${p.accR}-${p.r2})*exp(-14*pow(X/W-${cx},2)-14*pow(Y/H-${cy},2))+16*sin(6*X/W+${phase.toFixed(2)}),0,255)'` +
        `:g='clip(${p.g1}+(${p.g2}-${p.g1})*(0.45*X/W+0.55*Y/H)+(${p.accG}-${p.g2})*exp(-14*pow(X/W-${cx},2)-14*pow(Y/H-${cy},2))+14*cos(5*Y/H+${phase.toFixed(2)}),0,255)'` +
        `:b='clip(${p.b1}+(${p.b2}-${p.b1})*(0.4*X/W+0.6*Y/H)+(${p.accB}-${p.b2})*exp(-14*pow(X/W-${cx},2)-14*pow(Y/H-${cy},2))+18*sin(4*(X/W+Y/H)),0,255)'`;

      await runFfmpeg(
        [
          "-f", "lavfi",
          "-i", `color=c=black:s=${targetW}x${targetH}:d=1`,
          "-vf",
          `format=rgb24,geq=${geqExpr},drawbox=x=iw*0.07:y=ih*0.07:w=iw*0.86:h=ih*0.86:color=white@0.12:t=2,drawbox=x=iw*0.14:y=ih*0.5-1:w=iw*0.72:h=2:color=white@0.14:t=fill`,
          "-frames:v", "1",
          outPath,
        ],
        { totalDurationSec: 1, signal }
      );
    }

    const buffer = fs.readFileSync(outPath);
    if (!buffer || buffer.byteLength < 1024) {
      throw new Error("Local studio fallback produced empty image.");
    }
    onProgress?.({ stage: "Polishing details", progress: 94 });
    return {
      buffer,
      mimeType: "image/png",
      model: sourceImage?.buffer ? "ffmpeg-studio-edit" : "ffmpeg-studio-raster",
      provider: "SUJITH Studio Fallback",
    };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

async function tryPollinationsStudioImage(visualPrompt, { width, height, seed, signal, onProgress }) {
  const { positive } = splitPositiveAndNegativePrompt(visualPrompt);
  const targetW = Math.max(512, Math.min(1280, Math.round(width / 32) * 32));
  const targetH = Math.max(512, Math.min(1280, Math.round(height / 32) * 32));
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(
    positive.slice(0, 600)
  )}?width=${targetW}&height=${targetH}&seed=${Math.abs(seed || 1)}&nologo=true&enhance=false`;
  try {
    const timeoutSig = AbortSignal.timeout(18000);
    const combined = signal ? AbortSignal.any([signal, timeoutSig]) : timeoutSig;
    const dl = await downloadRemoteMedia(url, combined, "image/jpeg");
    const verifiedMime = detectImageMime(dl.buffer);
    if (!verifiedMime || dl.buffer.byteLength < 4096) return null;
    onProgress?.({ stage: "Polishing details", progress: 90 });
    return {
      buffer: dl.buffer,
      mimeType: verifiedMime,
      model: "flux-diffusion",
      provider: "NoTrack Studio Diffusion",
    };
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") throw err;
    return null;
  }
}

async function fetchRenderedImage(visualPrompt, { width, height, hordeWidth, hordeHeight, seed, job, sourceImage, signal, onProgress }) {
  const studioPrompt = buildPositiveVisualPrompt(visualPrompt);
  const errors = [];

  // Tier 1: Race fast Studio Diffusion (Pollinations FLUX) & HF Gradio Spaces (SD3.5/SD3/FLUX) concurrently
  try {
    const fastDiffPromise = tryPollinationsStudioImage(studioPrompt, { width, height, seed, signal, onProgress }).then((r) => {
      if (!r) throw new Error("Diffusion unavailable");
      return r;
    });
    const gradioPromise = tryGradioStudioImage(studioPrompt, { width, height, seed, signal, onProgress }).then((r) => {
      if (!r) throw new Error("Gradio quota busy");
      return r;
    });
    const studioResult = await Promise.any([fastDiffPromise, gradioPromise]);
    if (studioResult) return studioResult;
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") throw err;
    errors.push(err?.message || "Studio GPU queue busy");
  }

  // Tier 2: AI Horde curated SFW router + fast fallback with negative-prompt anatomy protection
  try {
    return await renderWithAiHorde(studioPrompt, {
      width: hordeWidth || width,
      height: hordeHeight || height,
      seed,
      job,
      signal,
      onProgress,
    });
  } catch (err) {
    if (signal?.aborted || err?.name === "AbortError") throw err;
    errors.push(err?.message || "Primary GPU cluster busy");
  }

  // Tier 3: Deterministic Local FFmpeg Studio Fallback (reliable aspect-accurate output when upstream GPU clusters fail)
  try {
    return await renderLocalStudioFallbackImage(studioPrompt, {
      width,
      height,
      seed,
      sourceImage,
      signal,
      onProgress,
    });
  } catch (fallbackErr) {
    if (signal?.aborted || fallbackErr?.name === "AbortError") throw fallbackErr;
    throw new Error(errors[errors.length - 1] || fallbackErr?.message || "Image generation service is temporarily busy. Please try again.");
  }
}

function runFfmpeg(args, { totalDurationSec, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-y", ...args, "-progress", "pipe:1", "-nostats"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";

    const abortHandler = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // Ignore
      }
      reject(new DOMException("Cancelled", "AbortError"));
    };
    if (signal) {
      if (signal.aborted) {
        abortHandler();
        return;
      }
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      const match = text.match(/out_time_us=(\d+)/);
      if (match && typeof onProgress === "function" && totalDurationSec > 0) {
        const currentSec = Number(match[1]) / 1_000_000;
        const ratio = Math.min(1, Math.max(0, currentSec / totalDurationSec));
        onProgress(ratio);
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    child.on("error", (err) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      reject(new Error(`Video encoder unavailable: ${err.message}`));
    });

    child.on("close", (code) => {
      if (signal) signal.removeEventListener("abort", abortHandler);
      if (code === 0) resolve();
      else reject(new Error(`Video encoding failed (exit ${code}).`));
    });
  });
}

async function renderMotionMp4FromKeyframes({ keyframes, width, height, job, signal }) {
  const workDir = fs.mkdtempSync(path.join(MEDIA_DIR, "ffwork-"));
  const outPath = path.join(workDir, "output.mp4");
  const fps = 24;

  try {
    const filePaths = keyframes.map((kf, idx) => {
      const ext = extFromMime(kf.mimeType);
      const p = path.join(workDir, `frame_${idx}.${ext}`);
      fs.writeFileSync(p, kf.buffer);
      return p;
    });

    let args = [];
    let totalDurationSec = 5;

    if (filePaths.length === 1) {
      totalDurationSec = 5;
      const frames = totalDurationSec * fps;
      args = [
        "-i", filePaths[0],
        "-vf",
        `scale=${Math.round(width * 1.4)}:${Math.round(height * 1.4)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.4)}:${Math.round(height * 1.4)},zoompan=z='min(zoom+0.0014,1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${width}x${height}:fps=${fps},format=yuv420p`,
        "-t", String(totalDurationSec),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart",
        outPath,
      ];
    } else if (filePaths.length === 2) {
      totalDurationSec = 5;
      const clipSec = 2.8;
      const clipFrames = Math.round(clipSec * fps);
      args = [
        "-i", filePaths[0],
        "-i", filePaths[1],
        "-filter_complex",
        `[0:v]scale=${Math.round(width * 1.35)}:${Math.round(height * 1.35)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.35)}:${Math.round(height * 1.35)},zoompan=z='min(zoom+0.0016,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${clipFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[v0];` +
        `[1:v]scale=${Math.round(width * 1.35)}:${Math.round(height * 1.35)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.35)}:${Math.round(height * 1.35)},zoompan=z='1.15-0.0016*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${clipFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[v1];` +
        `[v0][v1]xfade=transition=fade:duration=0.6:offset=2.2,format=yuv420p[v]`,
        "-map", "[v]",
        "-t", String(totalDurationSec),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart",
        outPath,
      ];
    } else {
      totalDurationSec = 6;
      const clipSec = 2.4;
      const clipFrames = Math.round(clipSec * fps);
      args = [
        "-i", filePaths[0],
        "-i", filePaths[1],
        "-i", filePaths[2],
        "-filter_complex",
        `[0:v]scale=${Math.round(width * 1.35)}:${Math.round(height * 1.35)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.35)}:${Math.round(height * 1.35)},zoompan=z='min(zoom+0.0018,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${clipFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[v0];` +
        `[1:v]scale=${Math.round(width * 1.35)}:${Math.round(height * 1.35)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.35)}:${Math.round(height * 1.35)},zoompan=z='1.15-0.0018*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${clipFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[v1];` +
        `[2:v]scale=${Math.round(width * 1.35)}:${Math.round(height * 1.35)}:force_original_aspect_ratio=increase,crop=${Math.round(width * 1.35)}:${Math.round(height * 1.35)},zoompan=z='min(zoom+0.0018,1.16)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${clipFrames}:s=${width}x${height}:fps=${fps},format=yuv420p[v2];` +
        `[v0][v1]xfade=transition=fade:duration=0.6:offset=1.8[v01];` +
        `[v01][v2]xfade=transition=fade:duration=0.6:offset=3.6,format=yuv420p[v]`,
        "-map", "[v]",
        "-t", String(totalDurationSec),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "22", "-movflags", "+faststart",
        outPath,
      ];
    }

    await runFfmpeg(args, {
      totalDurationSec,
      signal,
      onProgress: (ratio) => {
        const pct = Math.min(98, Math.round(70 + ratio * 28));
        updateJob(job, {
          status: pct >= 85 ? "polishing" : "generating",
          stage: pct >= 85 ? "Polishing video details" : "Rendering video frames...",
          progress: pct,
        });
      },
    });

    const mp4Buf = fs.readFileSync(outPath);
    return { buffer: mp4Buf, mimeType: "video/mp4", durationSec: totalDurationSec };
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

// ---------- Main Orchestrator (Gemini & Multi-Provider Pipeline) ----------

async function runUnifiedNoTrackMedia({ job, apiKey, geminiKey, sourceImage, signal, isWorkspaceVirtual = false }) {
  const skipExternalNoTrack = !apiKey || Boolean(isWorkspaceVirtual) || isWorkspaceVirtualNoTrackKey(apiKey);
  const smartPrompt =
    job.enhancePrompt !== false
      ? buildSmartEnhancedPrompt({
          rawPrompt: job.prompt,
          kind: job.kind,
          mode: job.mode,
          aspectRatio: job.aspectRatio,
          originalPrompt: sourceImage?.originalPrompt,
        })
      : job.prompt;

  if (smartPrompt && smartPrompt !== job.prompt) {
    updateJob(job, { enhancedPrompt: smartPrompt });
  }

  if (job.kind === "image") {
    // 1. Primary Engine: Google Gemini image generation & conversational editing when GEMINI_API_KEY is available
    const gemini = await tryGeminiImageGeneration({ apiKey: geminiKey, job, sourceImage, signal });
    if (gemini) return gemini;

    updateJob(job, {
      status: "generating",
      stage: job.mode === "edit" ? "Editing image..." : "Creating image...",
      provider: skipExternalNoTrack ? "AI Studio Renderers" : "NoTrack.ai",
      progress: 14,
    });

    if (!skipExternalNoTrack) {
      const direct = await tryNoTrackDirectImage({ apiKey, job, sourceImage, signal });
      if (direct) return direct;
    }

    updateJob(job, { status: "generating", stage: "Enhancing prompt & rendering...", progress: 24 });
    const refined = !skipExternalNoTrack
      ? await refinePromptWithNoTrack({
          apiKey,
          prompt: job.prompt,
          kind: "image",
          mode: job.mode,
          sourceImage,
          signal,
        })
      : null;
    const finalPrompt =
      (typeof refined === "string" && refined.trim()) ||
      smartPrompt ||
      (sourceImage?.originalPrompt && job.mode === "edit" ? `${sourceImage.originalPrompt}, ${job.prompt}` : job.prompt);

    if (finalPrompt && finalPrompt !== job.prompt && finalPrompt !== job.enhancedPrompt) {
      updateJob(job, { enhancedPrompt: finalPrompt });
    }

    const dims = imageDimensions(job.aspectRatio);
    const seed = Math.floor(Math.random() * 2_000_000_000);
    const rendered = await fetchRenderedImage(finalPrompt, {
      width: dims.width,
      height: dims.height,
      hordeWidth: dims.hordeWidth,
      hordeHeight: dims.hordeHeight,
      seed,
      job,
      sourceImage: job.mode === "edit" ? sourceImage : null,
      signal,
      onProgress: ({ stage, progress }) => {
        updateJob(job, {
          status: stage === "Polishing details" ? "polishing" : "generating",
          stage,
          progress,
        });
      },
    });

    return saveMediaBuffer({
      buffer: rendered.buffer,
      mimeType: rendered.mimeType,
      kind: "image",
      prompt: job.prompt,
      enhancedPrompt: job.enhancedPrompt,
      provider: rendered.provider || "NoTrack Studio Diffusion",
      model: rendered.model || "flux-diffusion",
      aspectRatio: job.aspectRatio,
    });
  }

  // Video Generation & Image-to-Video
  updateJob(job, {
    status: "generating",
    stage: job.mode === "image-to-video" ? "Animating image..." : "Creating video...",
    provider: skipExternalNoTrack ? "AI Studio Motion" : "NoTrack.ai",
    progress: 10,
  });

  const dims = videoDimensions(job.aspectRatio);
  const seed = Math.floor(Math.random() * 2_000_000_000);

  if (sourceImage && (job.mode === "image-to-video" || job.mode === "edit")) {
    updateJob(job, {
      status: "generating",
      stage: "Rendering motion frames...",
      progress: 45,
    });
    const encoded = await renderMotionMp4FromKeyframes({
      keyframes: [{ buffer: sourceImage.buffer, mimeType: sourceImage.mimeType }],
      width: dims.width,
      height: dims.height,
      job,
      signal,
    });
    return saveMediaBuffer({
      buffer: encoded.buffer,
      mimeType: encoded.mimeType,
      kind: "video",
      prompt: job.prompt,
      enhancedPrompt: job.enhancedPrompt,
      provider: "FFmpeg Motion Animator",
      model: "ffmpeg-zoompan-h264",
      aspectRatio: job.aspectRatio,
      durationSec: encoded.durationSec,
    });
  }

  if (!skipExternalNoTrack) {
    const directVid = await tryNoTrackDirectVideo({ apiKey, job, signal });
    if (directVid) return directVid;
  }

  updateJob(job, { status: "generating", stage: "Storyboarding 3 scenes...", progress: 18 });
  const scenes = !skipExternalNoTrack
    ? await refinePromptWithNoTrack({
        apiKey,
        prompt: job.prompt,
        kind: "video",
        mode: job.mode,
        sourceImage: null,
        signal,
      })
    : null;

  const sceneBase = smartPrompt || job.prompt;
  const scenePrompts =
    Array.isArray(scenes) && scenes.length >= 2
      ? scenes.slice(0, 3)
      : [
          `${sceneBase}, wide establishing shot, cinematic atmospheric lighting`,
          `${sceneBase}, dynamic mid-action shot, vibrant motion blur, crisp detail`,
          `${sceneBase}, dramatic hero close-up finale, rich depth of field`,
        ];

  updateJob(job, {
    status: "generating",
    stage: `Rendering ${scenePrompts.length} storyboard scenes...`,
    progress: 26,
  });

  let completedScenes = 0;
  let emittedPreview = false;
  const sceneResults = await Promise.allSettled(
    scenePrompts.map(async (scenePrompt, idx) => {
      if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
      const kf = await fetchRenderedImage(scenePrompt, {
        width: dims.width,
        height: dims.height,
        hordeWidth: dims.hordeWidth,
        hordeHeight: dims.hordeHeight,
        seed: seed + idx * 137,
        job,
        signal,
      });
      completedScenes += 1;
      const pct = Math.min(68, 26 + Math.round((completedScenes / scenePrompts.length) * 40));
      if (!emittedPreview) {
        emittedPreview = true;
        const preview = saveMediaBuffer({
          buffer: kf.buffer,
          mimeType: kf.mimeType,
          kind: "image",
          prompt: scenePrompt,
          provider: kf.provider || "NoTrack Studio Diffusion",
          model: kf.model || "keyframe",
          aspectRatio: job.aspectRatio,
        });
        updateJob(job, {
          status: "generating",
          stage: `Rendered scene ${completedScenes} of ${scenePrompts.length}...`,
          progress: pct,
          partialUrl: preview.url,
        });
      } else {
        updateJob(job, {
          status: "generating",
          stage: `Rendered scene ${completedScenes} of ${scenePrompts.length}...`,
          progress: pct,
        });
      }
      return kf;
    })
  );

  const keyframes = sceneResults
    .filter((r) => r.status === "fulfilled" && r.value?.buffer)
    .map((r) => r.value);

  if (keyframes.length === 0) {
    const firstErr = sceneResults.find((r) => r.status === "rejected")?.reason;
    throw firstErr || new Error("Video storyboard keyframe generation failed.");
  }

  const encoded = await renderMotionMp4FromKeyframes({
    keyframes,
    width: dims.width,
    height: dims.height,
    job,
    signal,
  });
  const kfProvider = keyframes[0]?.provider || "GPU Renderers";
  return saveMediaBuffer({
    buffer: encoded.buffer,
    mimeType: encoded.mimeType,
    kind: "video",
    prompt: job.prompt,
    enhancedPrompt: job.enhancedPrompt,
    provider: kfProvider === "SUJITH Studio Fallback" ? "SUJITH Studio Fallback" : `${kfProvider} + FFmpeg`,
    model: "keyframe-storyboard-h264",
    aspectRatio: job.aspectRatio,
    durationSec: encoded.durationSec,
  });
}

// ---------- Public Job Control API ----------

export function createMediaJob({
  userId,
  kind,
  mode,
  prompt,
  aspectRatio,
  durationSec,
  sourceImageDataUrl,
  sourceMediaId,
  enhancePrompt = true,
  noTrackKey,
  geminiKey,
  isWorkspaceVirtual = false,
}) {
  const jobId = makeJobId();
  const abortController = new AbortController();
  const cleanNoTrackKey = typeof noTrackKey === "string" ? noTrackKey.trim() : "";
  const cleanGeminiKey =
    typeof geminiKey === "string" && geminiKey.trim()
      ? geminiKey.trim()
      : (process.env.GEMINI_API_KEY || "").trim();

  const isGeminiAvailable = Boolean(cleanGeminiKey);
  const resolvedAspect = aspectRatio || (kind === "video" ? "16:9" : "1:1");
  const initialEnhanced =
    enhancePrompt !== false
      ? buildSmartEnhancedPrompt({
          rawPrompt: prompt,
          kind: kind === "video" ? "video" : "image",
          mode: mode || "generate",
          aspectRatio: resolvedAspect,
        })
      : undefined;

  const job = {
    jobId,
    userId,
    kind: kind === "video" ? "video" : "image",
    mode: mode || "generate",
    status: "queued",
    stage: kind === "video" ? "Generating video..." : "Creating image...",
    progress: null,
    prompt,
    enhancePrompt: enhancePrompt !== false,
    ...(initialEnhanced && initialEnhanced !== prompt ? { enhancedPrompt: initialEnhanced } : {}),
    aspectRatio: resolvedAspect,
    durationSec: durationSec || 5,
    provider: isGeminiAvailable && kind === "image" ? "Google Gemini" : "NoTrack.ai",
    model: isGeminiAvailable && kind === "image" ? "gemini-3.1-flash-lite-image" : undefined,
    partialUrl: undefined,
    media: undefined,
    error: undefined,
    errorHint: undefined,
    startedAt: Date.now(),
    finishedAt: undefined,
    abortController,
    onCancel: null,
  };
  mediaJobs.set(jobId, job);

  (async () => {
    try {
      if (!cleanNoTrackKey && !cleanGeminiKey) {
        updateJob(job, {
          status: "failed",
          stage: "API Key Required",
          error: "API key is required for image and video generation.",
          errorHint: "Open Settings to enter and verify your API key.",
          finishedAt: Date.now(),
        });
        return;
      }

      const sourceImage = resolveSourceImage(sourceImageDataUrl, sourceMediaId);
      const generated = await runUnifiedNoTrackMedia({
        job,
        apiKey: cleanNoTrackKey,
        geminiKey: cleanGeminiKey,
        sourceImage,
        signal: abortController.signal,
        isWorkspaceVirtual,
      });

      updateJob(job, {
        status: "completed",
        stage: job.kind === "video" ? "Video ready" : "Image ready",
        progress: 100,
        media: generated,
        provider: generated.provider,
        model: generated.model,
        finishedAt: Date.now(),
      });
    } catch (err) {
      const cancelled = abortController.signal.aborted || err?.name === "AbortError";
      updateJob(job, {
        status: cancelled ? "cancelled" : "failed",
        stage: cancelled ? "Stopped" : "Generation failed",
        error: cancelled
          ? "Generation stopped."
          : err?.message || `Could not complete ${job.kind} generation.`,
        errorHint: cancelled
          ? undefined
          : "Verify your API key in Settings and check network connectivity.",
        finishedAt: Date.now(),
      });
    }
  })();

  return serializeJob(job);
}

export function getMediaJob(jobId, userId) {
  if (!jobId || !ID_RE.test(jobId)) return null;
  const job = mediaJobs.get(jobId);
  if (!job || (userId && job.userId !== userId)) return null;
  return serializeJob(job);
}

export async function cancelMediaJob(jobId, userId) {
  if (!jobId || !ID_RE.test(jobId)) return null;
  const job = mediaJobs.get(jobId);
  if (!job || (userId && job.userId !== userId)) return null;
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return serializeJob(job);
  }
  job.abortController.abort();
  if (typeof job.onCancel === "function") {
    await job.onCancel().catch(() => null);
  }
  updateJob(job, {
    status: "cancelled",
    stage: "Stopped",
    error: "Generation stopped.",
    finishedAt: Date.now(),
  });
  return serializeJob(job);
}

export function subscribeToMediaJob(jobId, userId, listener) {
  if (!jobId || !ID_RE.test(jobId)) return () => {};
  const job = mediaJobs.get(jobId);
  if (!job || (userId && job.userId !== userId)) return () => {};
  const set = jobSubscribers.get(jobId) || new Set();
  set.add(listener);
  jobSubscribers.set(jobId, set);
  return () => {
    const current = jobSubscribers.get(jobId);
    if (!current) return;
    current.delete(listener);
    if (!current.size) jobSubscribers.delete(jobId);
  };
}

export function serveMediaAsset(assetId, req, res, allowedOrigin = "") {
  if (!assetId || !ID_RE.test(assetId)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid media asset ID." }));
    return true;
  }
  const asset = mediaAssets.get(assetId) || findDiskAssetById(assetId);
  if (!asset) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Media asset not found or expired." }));
    return true;
  }

  let filePath;
  try {
    filePath = safeAssetFilePath(asset.fileName);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid media path." }));
    return true;
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Media file no longer available." }));
    return true;
  }

  const stat = fs.statSync(filePath);
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const isDownload = url.searchParams.get("download") === "1";
  const ext = extFromMime(asset.mimeType);
  const headers = {
    "Content-Type": asset.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
    ...(isDownload ? { "Content-Disposition": `attachment; filename="sujith-ai-${asset.id}.${ext}"` } : {}),
  };

  const rangeHeader = req.headers.range;
  if (rangeHeader && /^bytes=\d*-\d*$/.test(rangeHeader)) {
    const [startStr, endStr] = rangeHeader.replace("bytes=", "").split("-");
    const start = startStr ? Number(startStr) : 0;
    const end = endStr ? Math.min(stat.size - 1, Number(endStr)) : stat.size - 1;
    if (Number.isFinite(start) && Number.isFinite(end) && start <= end && start < stat.size) {
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Length": end - start + 1,
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return true;
    }
  }

  res.writeHead(200, {
    ...headers,
    "Content-Length": stat.size,
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}
