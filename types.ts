import type { CompanyId } from "./companyLogos";
import type { VoiceDictionaryEntry, VoiceModelMode } from "./voiceCatalog";

export type Attachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  text?: string;
  /** Base64 data URL for image/audio attachments routed to capable company models. */
  dataUrl?: string;
};

export type MediaKind = "image" | "video";

export type ComposerAspectRatio = "auto" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export type MediaJobStatus =
  | "queued"
  | "generating"
  | "polishing"
  | "completed"
  | "failed"
  | "cancelled";

export type GeneratedMediaItem = {
  id: string;
  kind: MediaKind;
  url: string;
  previewUrl?: string;
  mimeType: string;
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio?: string;
  durationSec?: number;
  provider?: string;
  model?: string;
  interactionId?: string;
  createdAt: number;
};

export type MediaGenerationState = {
  jobId: string;
  kind: MediaKind;
  mode: "generate" | "edit" | "image-to-video";
  status: MediaJobStatus;
  stage: string;
  /** Actual numeric progress (0-100) only when reported by the backend engine; null otherwise. */
  progress: number | null;
  prompt: string;
  enhancedPrompt?: string;
  aspectRatio?: string;
  provider?: string;
  model?: string;
  partialUrl?: string;
  media?: GeneratedMediaItem;
  error?: string;
  errorHint?: string;
  startedAt: number;
  finishedAt?: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
  model?: string;
  modelCompany?: CompanyId;
  attachments?: Attachment[];
  run?: BuildRun;
  media?: MediaGenerationState;
};

export type Chat = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  bookmarked?: boolean;
  pinned?: boolean;
  archived?: boolean;
  locked?: boolean;
  projectTag?: string;
};

export type AppView = "chat" | "preview";

export type WorkspaceFile = {
  path: string;
  content: string;
  language: string;
  updatedAt: number;
};

export type BuildStep = {
  id: string;
  label: string;
  detail?: string;
  toolName?: string;
  status: "running" | "complete" | "failed";
  startedAt: number;
  finishedAt?: number;
};

export type BuildCheck = { name: string; passed: boolean; detail?: string };

export type BuildDiagnostic = {
  path: string;
  line: number;
  severity: "error" | "warning";
  message: string;
};

export type AndroidStack = "kotlin-compose" | "java-xml" | "flutter-dart" | "unknown";

export type PreviewDeviceSize = "360" | "412" | "full";

export type BuildRunErrorDetail = {
  status?: number;
  code?: string;
  message: string;
  hint?: string;
  recoverable?: boolean;
};

export type SearchSource = {
  id: string;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  excerpt?: string;
  publishedAt?: string;
  provider: string;
  verified?: boolean;
};

export type SearchState = {
  status: "searching" | "complete" | "empty" | "unavailable";
  stage: string;
  queries: string[];
  sources: SearchSource[];
  error?: string;
};

export type BuildFileEntry = {
  path: string;
  action: "created" | "edited" | "deleted";
  status?: "writing" | "saved" | "failed";
};

export type BuildRun = {
  id: string;
  status: "running" | "complete" | "needs-input" | "stopped" | "failed";
  engine: "local" | "on-device" | "notrack" | "gateway";
  modelName?: string;
  companyName?: string;
  company?: CompanyId;
  usedProvider?: string;
  actualModel?: string;
  ttftMs?: number;
  latencyMs?: number;
  streamedTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  errorDetail?: BuildRunErrorDetail;
  warning?: string;
  search?: SearchState;
  startedAt: number;
  finishedAt?: number;
  steps: BuildStep[];
  files: BuildFileEntry[];
  checks: BuildCheck[];
  plan?: string[];
  retryPrompt?: string;
};

export type ProjectKind = "tasks" | "calculator" | "chat" | "portfolio" | "restaurant" | "landing";
export type BuildTarget = "website" | "android";

export type AppSettings = {
  theme: "light" | "dark" | "system";
  engine: "local" | "on-device";
  buildTarget: BuildTarget;
  autoSave: boolean;
  interactionChecks: boolean;
  showActivity: boolean;
  enterToSend: boolean;
  reduceMotion: boolean;
  speechLanguage: string;
  microphoneEnabled: boolean;
  voiceModel: VoiceModelMode;
  voiceName: string;
  voiceLanguage: string;
  voiceDictionary: VoiceDictionaryEntry[];
  voiceBackground: boolean;
  voiceDefaultAssistant: boolean;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "light",
  engine: "local",
  buildTarget: "website",
  autoSave: true,
  interactionChecks: true,
  showActivity: false,
  enterToSend: true,
  reduceMotion: false,
  speechLanguage: "en-IN",
  microphoneEnabled: true,
  voiceModel: "live",
  voiceName: "Sonna",
  voiceLanguage: "auto",
  voiceDictionary: [],
  voiceBackground: true,
  voiceDefaultAssistant: false,
  temperature: 0.7,
  maxTokens: 16384,
  systemPrompt: "",
};

export function makeId(prefix = "id") {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createChat(index: number): Chat {
  const now = Date.now();
  return {
    id: makeId("chat"),
    title: `Chat #${index}`,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
