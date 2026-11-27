import type { MLCEngineInterface } from "@mlc-ai/web-llm";

const MODEL_ID = "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC";
let engine: MLCEngineInterface | null = null;
let initialization: Promise<MLCEngineInterface> | null = null;
let progressListener: ((text: string) => void) | null = null;

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(new DOMException("Build stopped", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

export function supportsOnDeviceAI() {
  return typeof navigator !== "undefined" && "gpu" in navigator && Boolean((navigator as Navigator & { gpu?: unknown }).gpu);
}

export function isOnDeviceAIReady() { return engine !== null; }

export async function prepareOnDeviceAI(signal: AbortSignal, onProgress: (text: string) => void) {
  signal.throwIfAborted();
  if (!supportsOnDeviceAI()) throw new Error("On-device AI needs WebGPU. Use a supported browser or keep using Local builder without AI inference.");
  progressListener = onProgress;
  try {
    if (!engine) {
      if (!initialization) {
        initialization = (async () => {
          const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
          const loaded = await CreateMLCEngine(MODEL_ID, { initProgressCallback: (progress) => progressListener?.(progress.text) });
          engine = loaded;
          return loaded;
        })();
        initialization.then(() => { initialization = null; }, () => { initialization = null; });
      }
      await abortable(initialization, signal);
    }
    signal.throwIfAborted();
    if (!engine) throw new Error("The local model did not load. No project files were changed.");
    return engine;
  } finally { progressListener = null; }
}

export async function generateOnDevice({
  prompt,
  system,
  signal,
  onProgress,
  onText,
  maxTokens = 4096,
}: {
  prompt: string;
  system: string;
  signal: AbortSignal;
  onProgress: (text: string) => void;
  onText: (text: string) => void;
  maxTokens?: number;
}) {
  signal.throwIfAborted();
  if (!supportsOnDeviceAI()) throw new Error("On-device AI needs WebGPU. Choose Local builder in Settings to build supported apps without a model download.");
  const activeEngine = await prepareOnDeviceAI(signal, onProgress);
  const abort = () => engine?.interruptGenerate();
  signal.addEventListener("abort", abort, { once: true });

  try {
    signal.throwIfAborted();
    onProgress("Model loaded. Generating on this device.");
    const stream = await activeEngine.chat.completions.create({
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      stream: true,
      max_tokens: maxTokens,
      temperature: 0.4,
    });
    let text = "";
    for await (const chunk of stream) {
      signal.throwIfAborted();
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) { text += delta; onText(text); }
    }
    signal.throwIfAborted();
    if (!text.trim()) throw new Error("The on-device model returned no text. No project files were changed.");
    return text.trim();
  } finally {
    progressListener = null;
    signal.removeEventListener("abort", abort);
  }
}

export async function releaseOnDeviceAI() {
  if (engine) {
    engine.interruptGenerate();
    await engine.unload();
    engine = null;
    return true;
  }
  return false;
}
