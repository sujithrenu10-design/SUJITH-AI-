import { DEFAULT_SETTINGS, makeId, type AppSettings, type Chat, type WorkspaceFile } from "./types";
import { ALL_VOICE_PRESETS, VOICE_LANGUAGE_OPTIONS, type DictationHistoryItem } from "./voiceCatalog";

export const CHAT_KEY = "sujith-ai.chats.v3";
export const ACTIVE_KEY = "sujith-ai.active.v3";
export const HOME_CHAT_KEY = "sujith-ai.home-chats.v1";
export const HOME_ACTIVE_KEY = "sujith-ai.home-active.v1";
export const FILES_KEY = "sujith-ai.files.v1";
export const SETTINGS_KEY = "sujith-ai.settings.v3";
export const DICTATION_HISTORY_KEY = "sujith-ai.dictation-history.v1";
const LEGACY_SETTINGS_KEY = "sujith-ai.settings.v2";

export function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) ?? fallback : fallback; } catch { return fallback; }
}

export function loadSpecificChats(storageKey: string, fallback: Chat[]): Chat[] {
  const chats = readStored<Chat[]>(storageKey, fallback);
  if (!Array.isArray(chats) || !chats.length) return fallback;
  const normalized = chats
    .filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages))
    .map((chat) => ({
      ...chat,
      title: typeof chat.title === "string" ? chat.title : "Restored chat",
      messages: chat.messages.filter(
        (message) => message && typeof message.content === "string" && ["user", "assistant"].includes(message.role)
      ),
    }));
  return normalized.length ? normalized : fallback;
}

export function loadChats(fallback: Chat[]) {
  const chats = readStored<Chat[]>(CHAT_KEY, fallback);
  if (!Array.isArray(chats) || !chats.length) return fallback;
  const normalized = chats.filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.messages)).map((chat) => ({ ...chat, title: typeof chat.title === "string" ? chat.title : "Restored chat", messages: chat.messages.filter((message) => message && typeof message.content === "string" && ["user", "assistant"].includes(message.role)).map((message, index) => {
    if (message.run?.status === "running") return { ...message, content: "This build was interrupted when the page closed. Retry to start a new checked build.", run: { ...message.run, status: "stopped" as const, finishedAt: Date.now(), steps: message.run.steps.map((step) => step.status === "running" ? { ...step, status: "failed" as const, detail: "Interrupted when the page closed.", finishedAt: Date.now() } : step) } };
    if (message.role === "assistant" && /Request could not be completed|free model could not be reached|could not run:/i.test(message.content) && !message.run) {
      const prompt = chat.messages.slice(0, index).reverse().find((item) => item.role === "user")?.content;
      return { ...message, content: "This earlier request used the retired remote connection. Retry with the local builder; your existing files are preserved.", run: { id: makeId("migrated"), engine: "local" as const, status: "failed" as const, startedAt: message.createdAt, finishedAt: message.createdAt, steps: [], files: [], checks: [], retryPrompt: prompt } };
    }
    return message;
  }) }));
  return normalized.length ? normalized : fallback;
}

export function loadProjects() {
  const stored = readStored<Record<string, WorkspaceFile[]>>(FILES_KEY, {});
  if (typeof stored !== "object" || Array.isArray(stored)) return {};
  const result: Record<string, WorkspaceFile[]> = {};
  for (const [id, files] of Object.entries(stored)) {
    if (["__proto__", "constructor", "prototype"].includes(id) || !Array.isArray(files)) continue;
    result[id] = files.filter((file) => file && typeof file.path === "string" && typeof file.content === "string").map((file) => ({ ...file, language: typeof file.language === "string" ? file.language : "text", updatedAt: typeof file.updatedAt === "number" ? file.updatedAt : Date.now() }));
  }
  return result;
}

export function loadSettings(): AppSettings {
  const hasV3 = Boolean(readStored<Partial<AppSettings> | null>(SETTINGS_KEY, null));
  const stored = hasV3
    ? readStored<Partial<AppSettings>>(SETTINGS_KEY, {})
    : readStored<Partial<AppSettings>>(LEGACY_SETTINGS_KEY, {});
  const settings = {
    ...DEFAULT_SETTINGS,
    ...stored,
    theme: ["light", "dark", "system"].includes(stored.theme ?? "") ? stored.theme! : DEFAULT_SETTINGS.theme,
    engine: stored.engine === "on-device" ? "on-device" : "local",
    buildTarget: hasV3 && stored.buildTarget === "android" ? "android" : "website",
  } as AppSettings;
  for (const key of ["autoSave", "interactionChecks", "showActivity", "enterToSend", "reduceMotion"] as const) settings[key] = typeof stored[key] === "boolean" ? stored[key]! : DEFAULT_SETTINGS[key];
  const validLangs = new Set(VOICE_LANGUAGE_OPTIONS.map((o) => o.value));
  settings.speechLanguage = validLangs.has(stored.speechLanguage ?? "") && stored.speechLanguage !== "auto"
    ? stored.speechLanguage!
    : DEFAULT_SETTINGS.speechLanguage;
  settings.voiceModel = ["live", "expressive", "standard"].includes(stored.voiceModel ?? "")
    ? stored.voiceModel!
    : DEFAULT_SETTINGS.voiceModel;
  settings.voiceName = ALL_VOICE_PRESETS.some((v) => v.name === stored.voiceName)
    ? stored.voiceName!
    : DEFAULT_SETTINGS.voiceName;
  settings.voiceLanguage = validLangs.has(stored.voiceLanguage ?? "")
    ? stored.voiceLanguage!
    : DEFAULT_SETTINGS.voiceLanguage;
  settings.voiceDictionary = Array.isArray(stored.voiceDictionary)
    ? stored.voiceDictionary
        .filter((e) => e && typeof e.id === "string" && typeof e.term === "string")
        .slice(0, 100)
        .map((e) => ({
          id: e.id,
          term: e.term.slice(0, 80),
          spokenAs: typeof e.spokenAs === "string" ? e.spokenAs.slice(0, 120) : "",
          createdAt: typeof e.createdAt === "number" ? e.createdAt : Date.now(),
        }))
    : [];
  settings.microphoneEnabled = typeof stored.microphoneEnabled === "boolean" ? stored.microphoneEnabled : DEFAULT_SETTINGS.microphoneEnabled;
  settings.voiceBackground = typeof stored.voiceBackground === "boolean" ? stored.voiceBackground : DEFAULT_SETTINGS.voiceBackground;
  settings.voiceDefaultAssistant = typeof stored.voiceDefaultAssistant === "boolean" ? stored.voiceDefaultAssistant : DEFAULT_SETTINGS.voiceDefaultAssistant;
  settings.temperature = typeof stored.temperature === "number" && Number.isFinite(stored.temperature)
    ? Math.min(2, Math.max(0, Number(stored.temperature.toFixed(2))))
    : DEFAULT_SETTINGS.temperature;
  settings.maxTokens = typeof stored.maxTokens === "number" && Number.isFinite(stored.maxTokens)
    ? Math.min(32768, Math.max(128, Math.round(stored.maxTokens)))
    : DEFAULT_SETTINGS.maxTokens;
  settings.systemPrompt = typeof stored.systemPrompt === "string" ? stored.systemPrompt.slice(0, 4000) : DEFAULT_SETTINGS.systemPrompt;
  return settings;
}

export function loadDictationHistory(): DictationHistoryItem[] {
  const list = readStored<DictationHistoryItem[]>(DICTATION_HISTORY_KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && typeof item.id === "string" && typeof item.text === "string" && item.text.trim())
    .slice(0, 80);
}

export function saveDictationHistory(items: DictationHistoryItem[]) {
  try {
    localStorage.setItem(DICTATION_HISTORY_KEY, JSON.stringify(items.slice(0, 80)));
  } catch {
    // Storage optional
  }
}

export function checkBackup(value: unknown): { chats: Chat[]; projects: Record<string, WorkspaceFile[]> } {
  if (!value || typeof value !== "object") throw new Error("Select a SUJITH AI workspace JSON backup.");
  const data = value as Record<string, unknown>;
  if (data.format !== "sujith-workspace-v2" || !Array.isArray(data.chats) || !data.chats.length || !data.projects || typeof data.projects !== "object") throw new Error("This file is not a supported SUJITH workspace backup.");
  const chats = data.chats as Chat[];
  for (const chat of chats) {
    if (typeof chat.id !== "string" || typeof chat.title !== "string" || !Array.isArray(chat.messages)) throw new Error("The backup contains an invalid chat.");
    for (const message of chat.messages) if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") throw new Error("The backup contains an invalid message.");
  }
  const projects = data.projects as Record<string, WorkspaceFile[]>;
  for (const files of Object.values(projects)) {
    if (!Array.isArray(files)) throw new Error("The backup contains invalid project files.");
    for (const file of files) if (!file || typeof file.path !== "string" || typeof file.content !== "string" || /(^|\/)\.\.($|\/)|^[\\/]/.test(file.path)) throw new Error("The backup contains an unsafe project file.");
  }
  return { chats, projects };
}

export function clearRetiredConnections() {
  try {
    sessionStorage.removeItem("sujith-ai.provider-keys.v1");
    sessionStorage.removeItem("sujith-ai.custom-api.v1");
    for (const key of ["sujith-ai.model.v3", "sujith-ai.premium.v1", "sujith-ai.usage.v1", "sujith-ide.gateway-url.v1"]) {
      localStorage.removeItem(key);
    }
  } catch { /* Storage is optional in private browsing. */ }
}
