import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  Download,
  Maximize2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Video,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { GeneratedMediaItem, MediaGenerationState } from "../lib/types";

declare global {
  interface Window {
    SujithAndroidMedia?: {
      saveMediaUrl?: (url: string, filename: string, mimeType: string) => boolean;
      saveDataUrl?: (dataUrl: string, filename: string, mimeType: string) => boolean;
    };
  }
}

function buildDownloadFilename(item: GeneratedMediaItem) {
  const ext = item.mimeType?.includes("mp4")
    ? "mp4"
    : item.mimeType?.includes("webm")
      ? "webm"
      : item.mimeType?.includes("jpeg") || item.mimeType?.includes("jpg")
        ? "jpg"
        : item.mimeType?.includes("webp")
          ? "webp"
          : item.kind === "video"
            ? "mp4"
            : "png";
  const slug = (item.prompt || "sujith-ai")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${slug || "sujith-media"}-${item.id.slice(-6)}.${ext}`;
}

async function saveGeneratedMedia(item: GeneratedMediaItem): Promise<{ ok: boolean; message: string }> {
  const filename = buildDownloadFilename(item);
  const url = item.url;

  // Prefer native Android MediaStore bridge when running inside Capacitor Android APK
  if (window.SujithAndroidMedia) {
    try {
      if (url.startsWith("data:") && typeof window.SujithAndroidMedia.saveDataUrl === "function") {
        const saved = window.SujithAndroidMedia.saveDataUrl(url, filename, item.mimeType);
        if (saved) return { ok: true, message: `Saved ${filename} to Downloads.` };
      } else if (typeof window.SujithAndroidMedia.saveMediaUrl === "function") {
        const absUrl = url.startsWith("http") ? url : new URL(url, window.location.origin).toString();
        const saved = window.SujithAndroidMedia.saveMediaUrl(absUrl, filename, item.mimeType);
        if (saved) return { ok: true, message: `Downloading ${filename} to Android Downloads...` };
      }
    } catch {
      // Fall back to standard browser download
    }
  }

  try {
    if (url.startsWith("data:") || url.startsWith("blob:")) {
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return { ok: true, message: `Saved ${filename}.` };
    }

    const downloadHref = url.includes("?") ? `${url}&download=1` : `${url}?download=1`;
    const response = await fetch(downloadHref);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2500);
    return { ok: true, message: `Saved ${filename}.` };
  } catch {
    return { ok: false, message: "Could not download the generated file." };
  }
}

function aspectClass(aspectRatio?: string, kind?: "image" | "video") {
  if (aspectRatio === "9:16") return "w-[74%] max-w-[290px] aspect-[9/16] min-h-[380px]";
  if (aspectRatio === "16:9" || kind === "video") return "w-full max-w-[376px] aspect-video min-h-[205px]";
  if (aspectRatio === "4:3") return "w-[90%] max-w-[356px] aspect-[4/3] min-h-[250px]";
  return "w-[82%] max-w-[332px] aspect-[3/4] min-h-[360px]";
}

export function MediaGenerationCard({
  state,
  isBusy,
  onStop: _onStop,
  onRegenerate,
  onAnimateImage,
  onEditImage,
  onVariationImage,
  onNotify,
}: {
  state: MediaGenerationState;
  isBusy: boolean;
  onStop: () => void;
  onRegenerate: (state: MediaGenerationState) => void;
  onAnimateImage?: (item: GeneratedMediaItem) => void;
  onEditImage?: (item: GeneratedMediaItem, instruction?: string) => void;
  onVariationImage?: (item: GeneratedMediaItem) => void;
  onNotify?: (message: string, error?: boolean) => void;
}) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [promptDetailOpen, setPromptDetailOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const isRunning = state.status === "queued" || state.status === "generating" || state.status === "polishing";
  const isCompleted = state.status === "completed" && Boolean(state.media);
  const isFailed = state.status === "failed";
  const isCancelled = state.status === "cancelled";

  useEffect(() => {
    if (!fullscreenOpen) {
      setZoomLevel(1);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreenOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreenOpen]);

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (!state.media) return;
    const result = await saveGeneratedMedia(state.media);
    if (result.ok) {
      setSavedNotice(true);
      window.setTimeout(() => setSavedNotice(false), 2000);
    }
    onNotify?.(result.message, !result.ok);
  };

  const handleCopy = async () => {
    if (!state.media) return;
    try {
      const res = await fetch(state.media.url);
      const blob = await res.blob();
      if (typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
        setCopiedNotice(true);
        window.setTimeout(() => setCopiedNotice(false), 2000);
        onNotify?.("Image copied to clipboard.");
        return;
      }
      throw new Error("ClipboardItem not supported");
    } catch {
      try {
        const fullUrl = state.media.url.startsWith("http")
          ? state.media.url
          : `${window.location.origin}${state.media.url}`;
        await navigator.clipboard.writeText(fullUrl);
        setCopiedNotice(true);
        window.setTimeout(() => setCopiedNotice(false), 2000);
        onNotify?.("Image link copied to clipboard.");
      } catch {
        onNotify?.("Could not copy image.", true);
      }
    }
  };

  const handleVideoFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.requestFullscreen) {
      void el.requestFullscreen().catch(() => setFullscreenOpen(true));
    } else {
      setFullscreenOpen(true);
    }
  };

  const handleTriggerEdit = () => {
    if (!state.media) return;
    setIsEditing((v) => !v);
    onEditImage?.(state.media);
  };

  const handleSendInlineEdit = () => {
    if (!state.media || !editInstruction.trim() || isBusy) return;
    const instruction = editInstruction.trim();
    setEditInstruction("");
    setIsEditing(false);
    onEditImage?.(state.media, instruction);
  };

  const handleTriggerVariation = () => {
    if (!state.media || isBusy) return;
    onVariationImage?.(state.media);
  };

  if (isRunning) {
    const hasNumericProgress = typeof state.progress === "number" && Number.isFinite(state.progress);
    return (
      <div className="sujith-media-stage" aria-live="polite" aria-busy="true">
        <p className="sujith-media-stage-label">
          {state.stage || (state.kind === "video" ? "Creating video..." : "Creating image...")}
        </p>

        <div className={`sujith-dot-canvas ${aspectClass(state.aspectRatio, state.kind)}`}>
          {state.partialUrl && (
            <img
              src={state.partialUrl}
              alt="Generation preview"
              className="sujith-partial-preview"
            />
          )}
          <div className="sujith-dot-grid" aria-hidden="true" />
          <div className="sujith-dot-glow" aria-hidden="true" />

          {hasNumericProgress && (
            <span className="sujith-progress-pill" aria-label={`Generation progress ${Math.round(state.progress!)} percent`}>
              {Math.round(state.progress!)}%
            </span>
          )}
        </div>
      </div>
    );
  }

  if (isCompleted && state.media) {
    const item = state.media;
    const activeEnhancedPrompt = (item.enhancedPrompt || state.enhancedPrompt || "").trim();
    const hasEnhancedPrompt = Boolean(activeEnhancedPrompt && activeEnhancedPrompt !== item.prompt.trim());
    return (
      <div className="sujith-media-result space-y-2">
        {item.kind === "image" ? (
          <div className="group relative w-[86%] max-w-[348px] overflow-hidden rounded-[22px] border border-[#e5ebf3] bg-[#f8fafc] shadow-xs dark:border-slate-700/80 dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              aria-label="View generated image fullscreen"
              className="block w-full cursor-zoom-in overflow-hidden bg-transparent text-left"
            >
              <img
                src={item.url}
                alt={item.prompt}
                loading="lazy"
                className="max-h-[440px] w-full object-contain transition duration-300 group-hover:scale-[1.01]"
              />
            </button>
            <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFullscreenOpen(true);
                }}
                aria-label="Expand image"
                className="grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white backdrop-blur-xs hover:bg-black/80"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[380px] overflow-hidden rounded-[22px] border border-[#e5ebf3] bg-[#0b1120] shadow-xs dark:border-slate-700">
            <video
              ref={videoRef}
              src={item.url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[420px] w-full bg-black object-contain"
            />
          </div>
        )}

        {/* Action Controls Underneath Image */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={item.kind === "video" ? handleVideoFullscreen : () => setFullscreenOpen(true)}
            className="sujith-media-btn"
            title="Open high resolution view"
          >
            <Maximize2 size={13} />
            Fullscreen
          </button>

          <button
            type="button"
            onClick={() => void handleSave()}
            className="sujith-media-btn"
            title="Download full quality image"
          >
            {savedNotice ? <Check size={13} className="text-[#16a34a]" /> : <Download size={13} />}
            {savedNotice ? "Saved" : "Save"}
          </button>

          {item.kind === "image" && (
            <button
              type="button"
              onClick={handleTriggerEdit}
              className={`sujith-media-btn ${isEditing ? "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300" : ""}`}
              title="Edit this image with natural language"
            >
              <Pencil size={13} />
              Edit
            </button>
          )}

          {item.kind === "image" && (
            <button
              type="button"
              disabled={isBusy}
              onClick={handleTriggerVariation}
              className="sujith-media-btn"
              title="Generate a creative variation of this image"
            >
              <Sparkles size={13} />
              Variations
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleCopy()}
            className="sujith-media-btn"
            title="Copy image to clipboard"
          >
            {copiedNotice ? <Check size={13} className="text-[#16a34a]" /> : <Copy size={13} />}
            {copiedNotice ? "Copied" : "Copy"}
          </button>

          {item.kind === "image" && onAnimateImage && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onAnimateImage(item)}
              className="sujith-media-btn"
              title="Convert this image into a video"
            >
              <Video size={13} />
              Animate
            </button>
          )}

          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRegenerate(state)}
            className="sujith-media-btn"
            title="Regenerate with different seeds"
          >
            <RefreshCw size={13} />
            Regenerate
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5 text-[11px] text-[var(--muted)]">
          <span>{item.provider || "AI Studio"}</span>
          {item.aspectRatio ? <span>· {item.aspectRatio}</span> : null}
          {hasEnhancedPrompt ? (
            <button
              type="button"
              onClick={() => setPromptDetailOpen((prev) => !prev)}
              aria-expanded={promptDetailOpen}
              className="font-medium text-[var(--blue-text)] hover:underline"
            >
              · {promptDetailOpen ? "Hide enhanced prompt" : "Enhanced prompt"}
            </button>
          ) : null}
        </div>

        {hasEnhancedPrompt && promptDetailOpen && (
          <p className="max-w-[376px] rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-2 text-[11.5px] leading-relaxed text-[var(--ink-soft)] [overflow-wrap:anywhere]">
            {activeEnhancedPrompt}
          </p>
        )}

        {/* Natural Language Conversational Image Edit Bar */}
        {isEditing && (
          <div className="animate-fade-in w-[90%] max-w-[360px] rounded-2xl border border-blue-200 bg-white p-2 shadow-md dark:border-blue-900/60 dark:bg-slate-900">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <Pencil size={11} />
                Natural Language Image Editing
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={12} />
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                ref={editInputRef}
                type="text"
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendInlineEdit();
                  }
                }}
                placeholder="Change background, lighting, clothing, add items..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleSendInlineEdit}
                disabled={!editInstruction.trim() || isBusy}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* High-Fidelity Fullscreen Image Viewer Modal with Zoom & Metadata */}
        {fullscreenOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={item.kind === "video" ? "Fullscreen video player" : "Fullscreen image viewer"}
            className="fixed inset-0 z-[150] flex flex-col bg-black/95 backdrop-blur-md"
          >
            {/* Top Toolbar */}
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-white/95">{item.prompt}</p>
                <p className="text-[11px] text-white/60">
                  {item.provider || "AI Engine"} · {item.model || "gemini-3.1-flash-lite-image"}
                  {item.aspectRatio ? ` · ${item.aspectRatio}` : ""}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {item.kind === "image" && (
                  <div className="flex items-center rounded-full bg-white/10 p-0.5">
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.25))}
                      title="Zoom out"
                      className="grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel(1)}
                      title="Reset zoom"
                      className="grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15"
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                      title="Zoom in"
                      className="grid h-7 w-7 place-items-center rounded-full text-white/80 hover:bg-white/15"
                    >
                      <ZoomIn size={13} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleCopy()}
                  title="Copy image"
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-white/25"
                >
                  {copiedNotice ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                  Copy
                </button>

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  title="Download full quality image"
                  className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-blue-700 shadow-sm"
                >
                  <Download size={13} />
                  Download
                </button>

                <button
                  type="button"
                  onClick={() => setFullscreenOpen(false)}
                  aria-label="Close fullscreen preview"
                  className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Main Stage */}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
              onClick={() => setFullscreenOpen(false)}
            >
              {item.kind === "image" ? (
                <img
                  src={item.url}
                  alt={item.prompt}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    transform: `scale(${zoomLevel})`,
                    transition: "transform 0.15s ease-out",
                  }}
                  className="max-h-full max-w-full rounded-xl object-contain shadow-2xl select-none"
                />
              ) : (
                <video
                  src={item.url}
                  controls
                  autoPlay
                  playsInline
                  onClick={(e) => e.stopPropagation()}
                  className="max-h-full max-w-full rounded-xl bg-black object-contain shadow-2xl"
                />
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="flex items-center justify-between border-t border-white/10 bg-black/60 px-4 py-2.5 backdrop-blur-md">
              <div className="flex items-center gap-2 text-[12px] text-white/70">
                <span className="rounded-md bg-white/10 px-2 py-0.5">
                  {item.kind === "video" ? "Video" : "HD Image"}
                </span>
                {item.aspectRatio && (
                  <span className="rounded-md bg-white/10 px-2 py-0.5">{item.aspectRatio}</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {item.kind === "image" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setFullscreenOpen(false);
                        handleTriggerEdit();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] text-white hover:bg-white/25"
                    >
                      <Pencil size={12} />
                      Edit Prompt
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFullscreenOpen(false);
                        handleTriggerVariation();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] text-white hover:bg-white/25"
                    >
                      <Sparkles size={12} />
                      Variations
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isCancelled) {
    return (
      <div className="mt-2 rounded-2xl border border-[#e5ebf3] bg-[#f8fafc] px-3.5 py-3 text-[12.5px] text-[#5f6b7a] dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
        <div className="flex items-center justify-between gap-2">
          <span>{state.kind === "video" ? "Video generation stopped." : "Image generation stopped."}</span>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRegenerate(state)}
            className="sujith-media-btn"
          >
            <RefreshCw size={12} />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="mt-2 rounded-2xl border border-[#fecaca] bg-[#fef2f2] px-3.5 py-3 text-[12.5px] text-[#991b1b] dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300" role="alert">
        <div className="flex items-start gap-2">
          <AlertCircle size={15} className="mt-0.5 shrink-0 text-[#dc2626] dark:text-red-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {state.kind === "video" ? "Video generation unavailable" : "Image generation unavailable"}
            </p>
            <p className="mt-1 leading-relaxed text-[#7f1d1d] dark:text-red-200">
              {state.error || "The image generation engine could not complete this request."}
            </p>
            {state.errorHint && (
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#991b1b]/85 dark:text-red-300/80">{state.errorHint}</p>
            )}
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRegenerate(state)}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#fca5a5] bg-white px-3 py-1.5 text-[11.5px] font-medium text-[#991b1b] transition hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:bg-red-900/50 dark:text-red-200"
          >
            <RefreshCw size={12} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return null;
}
