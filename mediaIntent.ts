import type { Attachment, ChatMessage, ComposerAspectRatio, GeneratedMediaItem } from "./types";

export type DetectedMediaIntent =
  | { kind: "text" }
  | {
      kind: "image";
      mode: "generate" | "edit";
      prompt: string;
      aspectRatio: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
      sourceImageDataUrl?: string;
      sourceMedia?: GeneratedMediaItem;
    }
  | {
      kind: "video";
      mode: "generate" | "image-to-video" | "edit";
      prompt: string;
      aspectRatio: "16:9" | "9:16" | "1:1";
      durationSec?: number;
      sourceImageDataUrl?: string;
      sourceMedia?: GeneratedMediaItem;
    };

const INFORMATIONAL_QUESTION_RE =
  /^(?:what(?:'s|\s+is|\s+are)|who(?:'s|\s+is|\s+are)|when\s+(?:is|was|did)|where\s+(?:is|are)|why\s+(?:is|are|do|does|did)|how\s+(?:to|do|does|can|many|much|long)|explain|describe|define|compare|difference\s+between|tell\s+me\s+about|write\s+(?:a|an|the)?\s*(?:code|script|function|component|essay|poem|story|article|email)|build\s+(?:a|an)?\s*(?:website|app|android|react|page|dashboard)|create\s+(?:a|an)?\s*(?:website|web\s*app|android\s*app|app|react|component|api|server|database))\b/i;

const EXPLICIT_VIDEO_VERB_RE =
  /\b(?:create|generate|make|render|produce|animate|convert|turn|build|synthesize|podu|pannu|venum)\b.*\b(?:video|clip|reel|animation|movie|cinematic|motion|trailer|timelapse)\b|\b(?:video|clip|animation|reel)\b\s+(?:of|about|for|showing|with|from)\b|^(?:anime|cinematic|short|ai|3d)?\s*video\b/i;

const EXPLICIT_IMAGE_VERB_RE =
  /\b(?:create|generate|draw|paint|sketch|design|render|illustrate|make|show\s+me|produce|podu|varai|pannu|venum)\b(?:\s+\w+){0,4}\s+(?:an?\s+)?(?:image|images|picture|pic|pics|photo|photos|artwork|illustration|logo|icon|avatar|wallpaper|poster|portrait|drawing|sketch|banner|thumbnail|character|padam)\b/i;

const SHORT_IMAGE_NOUN_RE =
  /^(?:.{1,80}?)\s+(?:image|picture|pic|photo|wallpaper|logo|avatar|portrait|artwork|illustration|sketch|poster|drawing)$/i;

const IMAGE_EDIT_CUE_RE =
  /\b(?:edit|modify|change|replace|remove|erase|add|put|turn\s+it|make\s+it|make\s+(?:him|her|them|this|the)|background|color|colour|style|anime\s+style|cartoon|realistic|darker|brighter|recolor|upscale|crop|resize|outfit|clothes|hair|eyes)\b/i;

const VIDEO_FROM_IMAGE_RE =
  /\b(?:animate|turn\s+(?:this|it|that|the\s+image|the\s+photo|the\s+picture)\s+into\s+(?:a\s+)?video|make\s+(?:a\s+)?video\s+(?:from|of|with)\s+(?:this|it|that)|image[\s-]+to[\s-]+video|bring\s+(?:this|it)\s+to\s+life|move|motion)\b/i;

const CODE_OR_WEB_INTENT_RE =
  /\b(?:html|css|javascript|typescript|react|tailwind|kotlin|compose|flutter|dart|android\s*app|apk|website|web\s*page|webpage|landing\s*page|code|coding|program|python|java|script|sql|json|regex|api\s*endpoint)\b/i;

function detectImageAspectRatio(
  text: string,
  preferredAspectRatio?: ComposerAspectRatio
): "1:1" | "3:4" | "4:3" | "9:16" | "16:9" {
  const lower = text.toLowerCase();
  if (/\b9:16\b/.test(lower)) return "9:16";
  if (/\b16:9\b/.test(lower)) return "16:9";
  if (/\b4:3\b/.test(lower)) return "4:3";
  if (/\b3:4\b/.test(lower)) return "3:4";
  if (/\b1:1\b/.test(lower)) return "1:1";
  if (preferredAspectRatio && preferredAspectRatio !== "auto") return preferredAspectRatio;
  if (/\b(?:vertical|story|reel|phone\s+wallpaper|mobile\s+wallpaper)\b/.test(lower)) return "9:16";
  if (/\b(?:widescreen|desktop\s+wallpaper|youtube\s+thumbnail|banner|cinematic|landscape)\b/.test(lower)) return "16:9";
  if (/\b(?:portrait|poster)\b/.test(lower)) return "3:4";
  if (/\b(?:square)\b/.test(lower)) return "1:1";
  return "1:1";
}

function detectVideoAspectRatio(
  text: string,
  preferredAspectRatio?: ComposerAspectRatio
): "16:9" | "9:16" | "1:1" {
  const lower = text.toLowerCase();
  if (/\b9:16\b/.test(lower)) return "9:16";
  if (/\b1:1\b/.test(lower)) return "1:1";
  if (/\b16:9\b/.test(lower)) return "16:9";
  if (preferredAspectRatio && preferredAspectRatio !== "auto") {
    if (preferredAspectRatio === "9:16" || preferredAspectRatio === "3:4") return "9:16";
    if (preferredAspectRatio === "1:1") return "1:1";
    return "16:9";
  }
  if (/\b(?:vertical|reel|short|tiktok|portrait|mobile)\b/.test(lower)) return "9:16";
  if (/\b(?:square)\b/.test(lower)) return "1:1";
  if (/\b(?:widescreen|landscape|horizontal)\b/.test(lower)) return "16:9";
  return "16:9";
}

function findLatestGeneratedMedia(history: ChatMessage[]): GeneratedMediaItem | undefined {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (msg.media?.status === "completed" && msg.media.media) {
      return msg.media.media;
    }
  }
  return undefined;
}

export function detectMediaIntent({
  prompt,
  attachments = [],
  history = [],
  mode = "chat",
  preferredAspectRatio = "auto",
}: {
  prompt: string;
  attachments?: Attachment[];
  history?: ChatMessage[];
  mode?: "chat" | "builder";
  preferredAspectRatio?: ComposerAspectRatio;
}): DetectedMediaIntent {
  const clean = prompt.trim();
  if (!clean) return { kind: "text" };

  // Builder mode is dedicated strictly to building Websites and Android apps; never detour into standalone media generation.
  if (mode === "builder") {
    return { kind: "text" };
  }

  const imageAttachment = attachments.find((a) => Boolean(a.dataUrl && a.dataUrl.startsWith("data:image/")));
  const latestMedia = findLatestGeneratedMedia(history);
  const lastAssistantMsg = [...history].reverse().find((m) => m.role === "assistant");
  const lastWasImage = Boolean(lastAssistantMsg?.media?.status === "completed" && lastAssistantMsg.media.media?.kind === "image");
  const lastWasVideo = Boolean(lastAssistantMsg?.media?.status === "completed" && lastAssistantMsg.media.media?.kind === "video");

  // 1. Check image-to-video intent (either attached image or immediately after a generated image)
  if (VIDEO_FROM_IMAGE_RE.test(clean) && (imageAttachment?.dataUrl || lastWasImage)) {
    return {
      kind: "video",
      mode: "image-to-video",
      prompt: clean,
      aspectRatio: detectVideoAspectRatio(clean, preferredAspectRatio),
      sourceImageDataUrl: imageAttachment?.dataUrl,
      sourceMedia: !imageAttachment?.dataUrl && lastWasImage ? latestMedia : undefined,
    };
  }

  // 2. Explicit video generation intent
  if (EXPLICIT_VIDEO_VERB_RE.test(clean) && !INFORMATIONAL_QUESTION_RE.test(clean) && !CODE_OR_WEB_INTENT_RE.test(clean)) {
    return {
      kind: "video",
      mode: imageAttachment?.dataUrl ? "image-to-video" : "generate",
      prompt: clean,
      aspectRatio: detectVideoAspectRatio(clean, preferredAspectRatio),
      sourceImageDataUrl: imageAttachment?.dataUrl,
    };
  }

  // 3. Follow-up video edit right after a generated video
  if (lastWasVideo && /\b(?:extend|continue|edit|change|make\s+(?:it|the\s+video)|regenerate|longer|slower|faster)\b/i.test(clean)) {
    return {
      kind: "video",
      mode: "edit",
      prompt: clean,
      aspectRatio: detectVideoAspectRatio(clean, preferredAspectRatio),
      sourceMedia: latestMedia,
    };
  }

  // 4. Image editing when user attaches an image and requests a visual edit
  if (imageAttachment?.dataUrl && IMAGE_EDIT_CUE_RE.test(clean) && !/\b(?:explain|describe|read|ocr|what\s+is\s+in|analyze|debug|fix\s+this\s+code)\b/i.test(clean)) {
    return {
      kind: "image",
      mode: "edit",
      prompt: clean,
      aspectRatio: detectImageAspectRatio(clean, preferredAspectRatio),
      sourceImageDataUrl: imageAttachment.dataUrl,
    };
  }

  // 5. Explicit image generation intent
  const isQuestionAboutImage =
    INFORMATIONAL_QUESTION_RE.test(clean) &&
    !/\b(?:create|generate|draw|paint|sketch|make|show\s+me)\s+(?:an?\s+)?(?:image|picture|photo|logo|drawing|wallpaper|character)\b/i.test(clean);

  const wantsExplicitImageCreation =
    EXPLICIT_IMAGE_VERB_RE.test(clean) &&
    !/\b(?:write|implement|fix|debug)\b.*\b(?:code|script|function|python|javascript|typescript|html|css|android|kotlin|react)\b/i.test(clean);

  if (
    !isQuestionAboutImage &&
    (wantsExplicitImageCreation || (!CODE_OR_WEB_INTENT_RE.test(clean) && SHORT_IMAGE_NOUN_RE.test(clean)))
  ) {
    // Support editing the most recent generated image if explicitly asking to modify it
    const wantsEditPrevious =
      lastWasImage &&
      /\b(?:edit|modify|change|update|redo|make\s+(?:it|him|her|that|the\s+image)|add|remove|replace|background|style)\b/i.test(clean);
    return {
      kind: "image",
      mode: wantsEditPrevious ? "edit" : "generate",
      prompt: clean,
      aspectRatio: detectImageAspectRatio(clean, preferredAspectRatio),
      sourceMedia: wantsEditPrevious ? latestMedia : undefined,
    };
  }

  // 6. Natural follow-up edit immediately after an image generation turn (e.g. "make his eyes red", "change background to night")
  if (
    lastWasImage &&
    !INFORMATIONAL_QUESTION_RE.test(clean) &&
    !CODE_OR_WEB_INTENT_RE.test(clean) &&
    IMAGE_EDIT_CUE_RE.test(clean) &&
    clean.length <= 240
  ) {
    return {
      kind: "image",
      mode: "edit",
      prompt: clean,
      aspectRatio:
        preferredAspectRatio && preferredAspectRatio !== "auto"
          ? preferredAspectRatio
          : (latestMedia?.aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9") || "1:1",
      sourceMedia: latestMedia,
    };
  }

  return { kind: "text" };
}
