import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, ArrowLeft, ArrowUp, BarChart3, Check, ChevronDown, ChevronLeft, Code2, Crown, Download, Eye, FileText, FolderOpen, Globe, LoaderCircle, Maximize2, Menu, Mic, MicOff, MoreHorizontal, Play, Plus, RotateCcw, RotateCw, Settings2, Smartphone, Square, Terminal, Trash2, X } from "lucide-react";
import { AppLogo } from "./components/AppLogo";
import { BuildReply } from "./components/BuildReply";
import { ChatHomePage } from "./components/ChatHomePage";
import { NavigationDrawer, type PageMode } from "./components/NavigationDrawer";
import { AppSettingsDialog } from "./components/AppSettings";
import { Dialog } from "./components/Dialog";
import { CompanyLogo } from "./components/CompanyLogo";
import { AttachmentMenu } from "./components/AttachmentMenu";
import { InlineMessageEditor, UserMessageActions } from "./components/UserMessageEditor";
import { ModelSelectorModal } from "./components/ModelSelectorModal";
import { ModelInfoSheet } from "./components/ModelInfoSheet";
import { UsageModal } from "./components/UsageModal";
import { SubscriptionModal } from "./components/SubscriptionModal";
import { FileExplorer } from "./components/FileExplorer";
import { CodeEditor } from "./components/CodeEditor";
import { WorkspaceTerminal } from "./components/WorkspaceTerminal";
import { CloudApkDialog } from "./components/CloudApkDialog";
import { VoiceSettingsModal } from "./components/VoiceSettingsModal";
import { ApiKeyGeneratorModal } from "./components/ApiKeyGeneratorModal";
import { copyToClipboard } from "./components/RichText";
import { useSpeechRecognition } from "./hooks/useSpeech";
import { usePreviewAI } from "./hooks/usePreviewAI";
import { ACTIVE_KEY, CHAT_KEY, FILES_KEY, HOME_ACTIVE_KEY, HOME_CHAT_KEY, SETTINGS_KEY, checkBackup, clearRetiredConnections, loadDictationHistory, loadProjects, loadSettings, loadSpecificChats, readStored, saveDictationHistory } from "./lib/appStorage";
import { applyVoiceDictionary, findVoicePreset, pickSystemVoice, type DictationHistoryItem } from "./lib/voiceCatalog";
import { DEFAULT_CATALOG_MODEL_ID, findCatalogModel, type ModelSpec, type PlanTier } from "./lib/modelCatalog";
import {
  BackendRequestError,
  DEFAULT_SUBSCRIPTION_STATE,
  EMPTY_USAGE_SUMMARY,
  OFFLINE_PROVIDER_STATUS,
  fetchProviderAvailability,
  fetchSubscriptionState,
  fetchUsageSummary,
  manageSubscriptionAction,
  startAndStreamMediaJob,
  startSubscriptionCheckout,
  verifySubscriptionPayment,
  verifyWorkspaceOnServer,
  type ProviderAvailability,
  type SubscriptionState,
  type UsageSummary,
} from "./lib/gatewayClient";
import { detectMediaIntent, type DetectedMediaIntent } from "./lib/mediaIntent";
import { runCompanyModel } from "./lib/gatewayBuild";
import { checkPreview, checkSource, collectDiagnostics } from "./lib/validation";
import { detectAndroidStack } from "./lib/androidPreviewRenderer";
import { exportAndroidProject, exportWebsite, importZipArchive, languageForPath, mergeWorkspaceFiles, normalizeWorkspacePath, previewDocument } from "./lib/workspace";
import { isAndroidPath, isAndroidProject, shouldEnforceReactVite, siteTitle } from "./lib/builder";
import { extractDocxText, extractPdfText } from "./lib/fileText";
import { createChat, makeId, type AppSettings, type Attachment, type BuildCheck, type Chat, type ChatMessage, type GeneratedMediaItem, type MediaGenerationState, type PreviewDeviceSize, type WorkspaceFile } from "./lib/types";
import { cn } from "./utils/cn";
import { cleanTextForSpeech, detectSpeechLang, splitSpeechChunks } from "./utils/voiceSpeech";

type View = "chat" | "preview";
type PreviewTab = "preview" | "files" | "editor" | "terminal";
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Notice = { message: string; error?: boolean };
type ConfirmState = { title: string; description: string; confirmLabel: string; onConfirm: () => void };

function download(content: string, name: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function errorText(error: unknown) { return error instanceof Error ? error.message : "The operation did not finish. Your existing workspace is still available."; }

function EmptyPreview({ onChat }: { onChat: () => void }) {
  return <div className="flex h-full flex-col items-center justify-center px-8 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-[var(--line)] text-[var(--muted)]"><Code2 size={23} /></span><h2 className="mt-4 text-[16px] font-semibold tracking-[-.02em] text-[var(--ink)]">Your build will appear here</h2><p className="mt-2 max-w-[260px] text-[11px] leading-relaxed text-[var(--muted)]">Describe a supported app in Chat. Generated source is checked before it enters your workspace.</p><button type="button" onClick={onChat} className="mt-5 rounded-full bg-[var(--ink)] px-5 py-2.5 text-[11px] font-medium text-[var(--surface)]">Back to chat</button></div>;
}

export default function App() {
  const firstHomeChat = useMemo(() => createChat(1), []);
  const firstBuilderChat = useMemo(() => createChat(1), []);

  const [pageMode, setPageMode] = useState<PageMode>(() => readStored<PageMode>("sujith-ide.page-mode.v1", "chat-page"));

  const [homeChats, setHomeChats] = useState<Chat[]>(() => loadSpecificChats(HOME_CHAT_KEY, [firstHomeChat]));
  const [activeHomeId, setActiveHomeId] = useState(() => readStored<string>(HOME_ACTIVE_KEY, firstHomeChat.id));

  const [builderChats, setBuilderChats] = useState<Chat[]>(() => loadSpecificChats(CHAT_KEY, [firstBuilderChat]));
  const [activeBuilderId, setActiveBuilderId] = useState(() => readStored<string>(ACTIVE_KEY, firstBuilderChat.id));

  const isHome = pageMode === "chat-page";
  const chats = isHome ? homeChats : builderChats;
  const activeHomeChat = homeChats.find((chat) => chat.id === activeHomeId) ?? homeChats[0] ?? firstHomeChat;
  const activeBuilderChat = builderChats.find((chat) => chat.id === activeBuilderId) ?? builderChats[0] ?? firstBuilderChat;
  const active = isHome ? activeHomeChat : activeBuilderChat;

  const [projects, setProjects] = useState<Record<string, WorkspaceFile[]>>(loadProjects);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [view, setView] = useState<View>("chat");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("preview");
  const [homeDraft, setHomeDraft] = useState("");
  const [builderDraft, setBuilderDraft] = useState("");
  const [homeAttachments, setHomeAttachments] = useState<Attachment[]>([]);
  const [builderAttachments, setBuilderAttachments] = useState<Attachment[]>([]);
  const [homeBusyId, setHomeBusyId] = useState<string | null>(null);
  const [builderBusyId, setBuilderBusyId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [androidOpen, setAndroidOpen] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileIssue, setNewFileIssue] = useState("");
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderIssue, setNewFolderIssue] = useState("");
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameIssue, setRenameIssue] = useState("");
  const [chatRenameTarget, setChatRenameTarget] = useState<Chat | null>(null);
  const [chatRenameValue, setChatRenameValue] = useState("");
  const [chatProjectTarget, setChatProjectTarget] = useState<Chat | null>(null);
  const [chatProjectValue, setChatProjectValue] = useState("");
  const [emptyFolders, setEmptyFolders] = useState<Record<string, string[]>>({});
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [deviceSize, setDeviceSize] = useState<PreviewDeviceSize>("full");
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [checkoutLink, setCheckoutLink] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editorPath, setEditorPath] = useState("index.html");
  const [editorDirty, setEditorDirty] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [checking, setChecking] = useState(false);
  const [checks, setChecks] = useState<BuildCheck[]>([]);
  const [checkIssue, setCheckIssue] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [undoFiles, setUndoFiles] = useState<Record<string, WorkspaceFile[]>>({});
  const [homeSelectedModelId, setHomeSelectedModelId] = useState(() => readStored<string>("sujith-ide.home-selected-model.v1", DEFAULT_CATALOG_MODEL_ID));
  const [builderSelectedModelId, setBuilderSelectedModelId] = useState(() => readStored<string>("sujith-ide.selected-model.v1", DEFAULT_CATALOG_MODEL_ID));
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [editingBuilderMessageId, setEditingBuilderMessageId] = useState<string | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [inspectedModel, setInspectedModel] = useState<ModelSpec | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [voiceSettingsOpen, setVoiceSettingsOpen] = useState(false);
  const [apiKeyGeneratorOpen, setApiKeyGeneratorOpen] = useState(false);
  const [dictationHistory, setDictationHistory] = useState<DictationHistoryItem[]>(() => loadDictationHistory());
  const [availability, setAvailability] = useState<ProviderAvailability>(OFFLINE_PROVIDER_STATUS);
  const [usageSummary, setUsageSummary] = useState<UsageSummary>(EMPTY_USAGE_SUMMARY);
  const [subscription, setSubscription] = useState<SubscriptionState>(DEFAULT_SUBSCRIPTION_STATE);
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const [liveVoicePhase, setLiveVoicePhase] = useState<"off" | "listening" | "processing" | "speaking" | "paused">("off");
  const [liveVoiceQuery, setLiveVoiceQuery] = useState("");
  const [liveVoiceSpokenText, setLiveVoiceSpokenText] = useState("");
  const [liveVoiceError, setLiveVoiceError] = useState<string | null>(null);
  const [liveVoiceSpeechPulse, setLiveVoiceSpeechPulse] = useState(0);
  const liveVoiceOpenRef = useRef(false);
  liveVoiceOpenRef.current = liveVoiceOpen;
  const liveVoiceSessionRef = useRef<{ active: boolean; generation: number }>({ active: false, generation: 0 });
  const liveVoiceHandlerRef = useRef<(text: string) => void>(() => undefined);
  const selectedModelId = isHome ? homeSelectedModelId : builderSelectedModelId;
  const setSelectedModelId = isHome ? setHomeSelectedModelId : setBuilderSelectedModelId;
  const selectedModel = useMemo(() => findCatalogModel(selectedModelId, availability.discoveredModels), [selectedModelId, availability.discoveredModels]);

  const draft = isHome ? homeDraft : builderDraft;
  const setDraft = isHome ? setHomeDraft : setBuilderDraft;
  const attachments = isHome ? homeAttachments : builderAttachments;
  const setAttachments = isHome ? setHomeAttachments : setBuilderAttachments;
  const busyId = isHome ? homeBusyId : builderBusyId;

  const homeChatsRef = useRef(homeChats);
  homeChatsRef.current = homeChats;
  const builderChatsRef = useRef(builderChats);
  builderChatsRef.current = builderChats;
  const pageModeRef = useRef(pageMode);
  pageModeRef.current = pageMode;
  const projectsRef = useRef(projects);
  const homeControllerRef = useRef<AbortController | null>(null);
  const builderControllerRef = useRef<AbortController | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const mounted = useRef(true);
  const sourceInput = useRef<HTMLInputElement>(null);
  const workspaceImportInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewRef = useRef<HTMLElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const files = useMemo(() => (isHome ? [] : projects[activeBuilderChat.id] ?? []), [isHome, projects, activeBuilderChat.id]);
  const currentFile = files.find((file) => file.path === editorPath) ?? files[0];
  const busy = busyId !== null;
  const canSend = !busy && Boolean(draft.trim() || attachments.length);
  const isAndroid = useMemo(() => (files.length > 0 ? isAndroidProject(files) : settings.buildTarget === "android"), [files, settings.buildTarget]);
  const androidStack = useMemo(() => detectAndroidStack(files), [files]);
  const diagnostics = useMemo(() => collectDiagnostics(files), [files]);
  const sourceHtml = useMemo(() => previewDocument(files), [files]);
  const projectTitle = sourceHtml ? siteTitle(sourceHtml) : activeBuilderChat.title;
  const previewNonce = useMemo(() => makeId("preview"), [activeBuilderChat.id, previewVersion, sourceHtml]);
  const fullPreview = useMemo(() => {
    if (!sourceHtml) return "";
    const persistedState = readStored<Record<string, Record<string, string>>>("sujith-ai.preview-state.v1", {});
    const seed = JSON.stringify(persistedState[activeBuilderChat.id] ?? {}).replace(/</g, "\\u003c");
    const boot = `<script>window.__SUJITH_PREVIEW_NONCE__=${JSON.stringify(previewNonce)};window.__SUJITH_APP_STATE__=${seed};<\/script>`;
    return sourceHtml.replace(/<head([^>]*)>/i, `<head$1>${boot}`);
  }, [sourceHtml, activeBuilderChat.id, previewNonce]);
  const previewAI = usePreviewAI(iframeRef, previewNonce, !isHome && view === "preview" && previewTab === "preview", builderBusyId !== null, selectedModel);

  const notify = useCallback((message: string, error = false) => {
    if (!mounted.current) return;
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ message, error });
    noticeTimer.current = window.setTimeout(() => setNotice(null), 5500);
  }, []);

  const refreshGatewayState = useCallback(async () => {
    const [avail, usageData, subData] = await Promise.all([
      fetchProviderAvailability(),
      fetchUsageSummary(),
      fetchSubscriptionState(),
    ]);
    if (!mounted.current) return;
    setAvailability(avail);
    setUsageSummary(usageData);
    setSubscription(subData);
  }, []);

  useEffect(() => {
    mounted.current = true;
    clearRetiredConnections();
    void refreshGatewayState();
    return () => {
      mounted.current = false;
      liveVoiceSessionRef.current = { active: false, generation: liveVoiceSessionRef.current.generation + 1 };
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      }
      homeControllerRef.current?.abort();
      builderControllerRef.current?.abort();
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [refreshGatewayState]);

  useEffect(() => {
    try { localStorage.setItem("sujith-ide.home-selected-model.v1", JSON.stringify(homeSelectedModelId)); } catch { /* Optional storage */ }
  }, [homeSelectedModelId]);
  useEffect(() => {
    try { localStorage.setItem("sujith-ide.selected-model.v1", JSON.stringify(builderSelectedModelId)); } catch { /* Optional storage */ }
  }, [builderSelectedModelId]);
  useEffect(() => {
    try { localStorage.setItem("sujith-ide.page-mode.v1", JSON.stringify(pageMode)); } catch { /* Optional storage */ }
  }, [pageMode]);
  useEffect(() => {
    const media = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const applyTheme = () => {
      const dark = settings.theme === "dark" || (settings.theme === "system" && Boolean(media?.matches));
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      document.documentElement.classList.toggle("dark", dark);
      document.body.classList.toggle("dark", dark);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0e1420" : "#ffffff");
    };
    applyTheme();
    media?.addEventListener("change", applyTheme);
    return () => media?.removeEventListener("change", applyTheme);
  }, [settings.theme]);
  useEffect(() => {
    try {
      localStorage.setItem(HOME_CHAT_KEY, JSON.stringify(homeChats));
      localStorage.setItem(HOME_ACTIVE_KEY, JSON.stringify(activeHomeId));
    } catch {
      /* Optional persistence */
    }
  }, [homeChats, activeHomeId]);
  useEffect(() => {
    setEditingBuilderMessageId(null);
  }, [activeBuilderId]);
  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(builderChats));
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(activeBuilderId));
    } catch {
      notify("Chat history could not be saved. Export your workspace before closing this tab.", true);
    }
  }, [builderChats, activeBuilderId, notify]);
  useEffect(() => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { notify("Settings could not be saved in this browser.", true); } }, [settings, notify]);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => document.documentElement.style.setProperty("--app-height", `${Math.round(viewport.height)}px`);
    update(); viewport.addEventListener("resize", update);
    return () => { viewport.removeEventListener("resize", update); document.documentElement.style.removeProperty("--app-height"); };
  }, []);
  useEffect(() => {
    if ((pageMode === "chat-page" || view === "chat") && active.messages.length) endRef.current?.scrollIntoView({ block: "nearest", behavior: settings.reduceMotion ? "instant" : "smooth" });
  }, [pageMode, view, active.id, active.messages.length, active.messages.at(-1)?.run?.steps.length, active.messages.at(-1)?.media?.status, settings.reduceMotion]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false); setDrawerOpen(false);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    const listen = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const done = () => { setInstallPrompt(null); notify("SUJITH AI web app installed."); };
    window.addEventListener("beforeinstallprompt", listen); window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", listen); window.removeEventListener("appinstalled", done); };
  }, [notify]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.nonce !== previewNonce || event.data?.type !== "sujith-project-state") return;
      const { key, value } = event.data;
      if (typeof key !== "string" || key.length > 100 || typeof value !== "string" || value.length > 100000 || !settingsRef.current.autoSave) return;
      try {
        JSON.parse(value);
        const store = readStored<Record<string, Record<string, string>>>("sujith-ai.preview-state.v1", {});
        store[active.id] = { ...(store[active.id] ?? {}), [key]: value };
        localStorage.setItem("sujith-ai.preview-state.v1", JSON.stringify(store));
      } catch { /* The generated app remains usable even when preview state storage is full. */ }
    };
    window.addEventListener("message", receive); return () => window.removeEventListener("message", receive);
  }, [active.id, previewNonce]);

  const updateActiveChats = (next: Chat[], targetHome = isHome) => {
    if (targetHome) {
      homeChatsRef.current = next;
      setHomeChats(next);
    } else {
      builderChatsRef.current = next;
      setBuilderChats(next);
    }
  };
  const updateMessage = (targetHome: boolean, chatId: string, messageId: string, patch: Partial<ChatMessage>) => {
    if (!mounted.current) return;
    if (targetHome) {
      const next = homeChatsRef.current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            }
          : chat
      );
      homeChatsRef.current = next;
      setHomeChats(next);
    } else {
      const next = builderChatsRef.current.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
            }
          : chat
      );
      builderChatsRef.current = next;
      setBuilderChats(next);
    }
  };
  const setProjectMemory = (next: Record<string, WorkspaceFile[]>) => { projectsRef.current = next; setProjects(next); };
  const commitProject = (chatId: string, nextFiles: WorkspaceFile[], checkpoint = false, persist = settingsRef.current.autoSave) => {
    const next = { ...projectsRef.current, [chatId]: nextFiles };
    if (persist) localStorage.setItem(FILES_KEY, JSON.stringify(next));
    if (checkpoint) setUndoFiles((previous) => ({ ...previous, [chatId]: projectsRef.current[chatId] ?? [] }));
    setProjectMemory(next);
  };
  const copyText = async (text: string) => {
    const ok = await copyToClipboard(text);
    if (ok) notify("Copied to clipboard.");
    else notify("Clipboard access is not available. You can export the source instead.", true);
  };

  const cancelTts = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  }, []);

  const effectiveRecognitionLang =
    settings.voiceLanguage && settings.voiceLanguage !== "auto"
      ? settings.voiceLanguage
      : settings.speechLanguage;

  const recordDictation = useCallback((text: string, mode: "live" | "dictation") => {
    const clean = text.trim();
    if (!clean) return;
    const item: DictationHistoryItem = {
      id: makeId("dictation"),
      text: clean,
      lang: settingsRef.current.voiceLanguage === "auto" ? "auto" : settingsRef.current.voiceLanguage,
      mode,
      createdAt: Date.now(),
    };
    setDictationHistory((prev) => {
      const next = [item, ...prev].slice(0, 80);
      saveDictationHistory(next);
      return next;
    });
  }, []);

  const speech = useSpeechRecognition({
    lang: effectiveRecognitionLang,
    onFinal: (text) => {
      if (pageModeRef.current === "chat-page" && liveVoiceSessionRef.current.active) {
        recordDictation(text, "live");
        liveVoiceHandlerRef.current(text);
        return;
      }
      recordDictation(text, "dictation");
      const setter = pageModeRef.current === "chat-page" ? setHomeDraft : setBuilderDraft;
      setter((previous) => (previous.trim() ? `${previous.trim()} ${text}` : text));
    },
    onError: (message) => {
      if (liveVoiceSessionRef.current.active || liveVoiceOpenRef.current) {
        liveVoiceSessionRef.current = { active: false, generation: liveVoiceSessionRef.current.generation + 1 };
        setLiveVoicePhase("paused");
        setLiveVoiceError(message);
        return;
      }
      notify(message, true);
    },
  });

  useEffect(() => {
    if (!liveVoiceOpen) return;
    let wakeLockSentinel: { release?: () => Promise<void> } | null = null;
    if (settings.voiceBackground && typeof navigator !== "undefined" && "wakeLock" in navigator) {
      const navWithWakeLock = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<{ release?: () => Promise<void> }> };
      };
      void navWithWakeLock.wakeLock
        ?.request("screen")
        .then((sentinel) => {
          wakeLockSentinel = sentinel;
        })
        .catch(() => undefined);
    }
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && !settingsRef.current.voiceBackground && liveVoiceSessionRef.current.active) {
        const generation = liveVoiceSessionRef.current.generation + 1;
        liveVoiceSessionRef.current = { active: false, generation };
        cancelTts();
        speech.stop();
        setLiveVoicePhase("paused");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (wakeLockSentinel?.release) {
        void wakeLockSentinel.release().catch(() => undefined);
      }
    };
  }, [liveVoiceOpen, settings.voiceBackground, cancelTts, speech.stop]);

  const speakResponseChunks = useCallback(async (text: string, generation: number) => {
    const adjustedText = applyVoiceDictionary(text, settingsRef.current.voiceDictionary);
    const chunks = splitSpeechChunks(adjustedText);
    if (!chunks.length || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const preset = findVoicePreset(settingsRef.current.voiceName);
    const pinnedLang =
      settingsRef.current.voiceLanguage && settingsRef.current.voiceLanguage !== "auto"
        ? settingsRef.current.voiceLanguage
        : null;
    const detectedLang = detectSpeechLang(adjustedText, pinnedLang ?? preset.lang ?? settingsRef.current.speechLanguage);
    const targetLang = pinnedLang && detectedLang === pinnedLang ? pinnedLang : detectedLang;
    const voices = typeof synth.getVoices === "function" ? synth.getVoices() : [];
    const preferredVoice = pickSystemVoice(voices, targetLang, preset.genderHint);
    const rateMultiplier =
      settingsRef.current.voiceModel === "expressive"
        ? 1.04
        : settingsRef.current.voiceModel === "standard"
          ? 0.96
          : 1.0;

    // Avoid Chrome's same-tick cancel()+speak() silent drop bug
    if (synth.speaking || synth.pending) {
      try { synth.cancel(); } catch { /* ignore */ }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 80));
    }

    for (const chunk of chunks) {
      if (!mounted.current || !liveVoiceSessionRef.current.active || liveVoiceSessionRef.current.generation !== generation) {
        return;
      }
      setLiveVoiceSpokenText(chunk);
      await new Promise<void>((resolve) => {
        let settled = false;
        let pulseTicker: number | null = null;
        let resumeTicker: number | null = null;
        const done = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(failsafe);
          if (pulseTicker) window.clearInterval(pulseTicker);
          if (resumeTicker) window.clearInterval(resumeTicker);
          resolve();
        };
        const failsafe = window.setTimeout(done, Math.max(9500, chunk.length * 145));
        try {
          if (synth.paused) synth.resume();
          const utterance = new SpeechSynthesisUtterance(chunk);
          utterance.lang = targetLang;
          if (preferredVoice) utterance.voice = preferredVoice;
          utterance.pitch = preset.pitch;
          utterance.rate = Number((preset.rate * rateMultiplier).toFixed(2));
          utterance.onboundary = () => {
            if (mounted.current && liveVoiceSessionRef.current.generation === generation) {
              setLiveVoiceSpeechPulse((prev) => prev + 1);
            }
          };
          // Fallback waveform pulse on Android Chrome where onboundary rarely fires
          pulseTicker = window.setInterval(() => {
            if (mounted.current && liveVoiceSessionRef.current.generation === generation) {
              setLiveVoiceSpeechPulse((prev) => prev + 1);
            }
          }, 260);
          // Prevent Chromium's ~15s speechSynthesis pause bug
          resumeTicker = window.setInterval(() => {
            try { if (synth.paused) synth.resume(); } catch { /* ignore */ }
          }, 3500);
          utterance.onend = done;
          utterance.onerror = done;
          synth.speak(utterance);
        } catch {
          done();
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!settings.microphoneEnabled) {
      speech.stop();
      if (liveVoiceSessionRef.current.active || liveVoiceOpenRef.current) {
        liveVoiceSessionRef.current = { active: false, generation: liveVoiceSessionRef.current.generation + 1 };
        setLiveVoicePhase((prev) => (prev === "off" ? "off" : "paused"));
        setLiveVoiceError("Microphone is turned off in Settings.");
      }
    } else {
      setLiveVoiceError((prev) =>
        prev === "Microphone is turned off in Settings." ? null : prev
      );
    }
  }, [settings.microphoneEnabled, speech.stop]);

  const startLiveVoice = useCallback(() => {
    // Synchronously unlock mobile Chrome / iOS speechSynthesis inside the tap gesture
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const synth = window.speechSynthesis;
        const wasSpeaking = synth.speaking || synth.pending;
        if (wasSpeaking) {
          synth.cancel();
        } else {
          if (synth.paused) synth.resume();
          const unlock = new SpeechSynthesisUtterance(" ");
          unlock.volume = 0;
          unlock.rate = 10;
          synth.speak(unlock);
        }
      } catch {
        // Ignore unlock errors
      }
    }
    if (!settingsRef.current.microphoneEnabled) {
      speech.stop();
      const generation = liveVoiceSessionRef.current.generation + 1;
      liveVoiceSessionRef.current = { active: false, generation };
      setLiveVoiceOpen(true);
      setLiveVoiceQuery("");
      setLiveVoiceSpokenText("");
      setLiveVoicePhase("paused");
      setLiveVoiceError("Microphone is turned off in Settings.");
      return;
    }
    const generation = liveVoiceSessionRef.current.generation + 1;
    liveVoiceSessionRef.current = { active: true, generation };
    setLiveVoiceOpen(true);
    setLiveVoiceError(null);
    setLiveVoiceQuery("");
    setLiveVoiceSpokenText("");
    const started = speech.start();
    setLiveVoicePhase(started ? "listening" : "paused");
    if (!started) {
      liveVoiceSessionRef.current = { active: false, generation };
    }
  }, [speech]);

  const stopLiveVoice = useCallback(() => {
    const generation = liveVoiceSessionRef.current.generation + 1;
    liveVoiceSessionRef.current = { active: false, generation };
    cancelTts();
    speech.stop();
    if (liveVoicePhase === "processing") {
      homeControllerRef.current?.abort();
    }
    setLiveVoicePhase("off");
    setLiveVoiceOpen(false);
    setLiveVoiceError(null);
    setLiveVoiceQuery("");
    setLiveVoiceSpokenText("");
  }, [cancelTts, liveVoicePhase, speech]);

  const send = async (
    override?: string,
    forcedMediaIntent?: Exclude<DetectedMediaIntent, { kind: "text" }>,
    editFromMessageId?: string,
    options?: { preserveDraft?: boolean }
  ): Promise<string | null> => {
    const targetHome = pageModeRef.current === "chat-page";
    const activeControllerRef = targetHome ? homeControllerRef : builderControllerRef;
    const setTargetBusyId = targetHome ? setHomeBusyId : setBuilderBusyId;
    const currentDraft = targetHome ? homeDraft : builderDraft;
    const currentAttachments = targetHome ? homeAttachments : builderAttachments;
    const prompt = (override ?? currentDraft).trim();
    if (activeControllerRef.current || (!prompt && !currentAttachments.length && !forcedMediaIntent && !editFromMessageId)) return null;
    if (!targetHome && previewAI.busy) {
      notify("The preview is using the local AI engine. Wait for it to finish before starting another operation.");
      return null;
    }

    const currentActiveChats = targetHome ? homeChatsRef.current : builderChatsRef.current;
    const currentActiveId = targetHome ? activeHomeId : activeBuilderId;
    const currentActiveChat =
      currentActiveChats.find((c) => c.id === currentActiveId) ?? currentActiveChats[0] ?? (targetHome ? firstHomeChat : firstBuilderChat);
    const chatId = currentActiveChat.id;

    const allMessages = currentActiveChat.messages ?? [];
    const editIdx = editFromMessageId
      ? allMessages.findIndex((m) => m.id === editFromMessageId && m.role === "user")
      : -1;
    if (editFromMessageId && editIdx === -1) return null;

    const baseMessages = editIdx >= 0 ? allMessages.slice(0, editIdx) : allMessages;
    const originalMessage = editIdx >= 0 ? allMessages[editIdx] : undefined;
    const attached = editIdx >= 0 ? [...(originalMessage?.attachments ?? [])] : [...currentAttachments];
    const request = prompt || forcedMediaIntent?.prompt || "Import and check the attached source files";

    const controller = new AbortController();
    activeControllerRef.current = controller;
    const buildSettings = { ...settings };
    const model = findCatalogModel(targetHome ? homeSelectedModelId : builderSelectedModelId, availability.discoveredModels);
    const assistantId = makeId("message");
    const oldFiles = targetHome ? [] : projectsRef.current[chatId] ?? [];
    const currentHistory = baseMessages
      .filter((m) => m.content.trim() || m.media?.media?.prompt)
      .map((m) => ({
        role: m.role,
        content: m.content.trim() || (m.media?.media ? `[Generated ${m.media.kind}: ${m.media.media.prompt}]` : ""),
      }));
    const detectedIntent: DetectedMediaIntent =
      targetHome
        ? forcedMediaIntent ??
          detectMediaIntent({
            prompt: request,
            attachments: attached,
            history: baseMessages,
            mode: "chat",
          })
        : { kind: "text" };

    setTargetBusyId(chatId);
    if (!editFromMessageId && !options?.preserveDraft) {
      if (targetHome) {
        setHomeDraft("");
        setHomeAttachments([]);
      } else {
        setBuilderDraft("");
        setBuilderAttachments([]);
        setView("chat");
      }
    } else if (!targetHome) {
      setView("chat");
    }
    setMoreOpen(false);
    setAttachMenuOpen(false);

    const initialMediaState: MediaGenerationState | undefined =
      detectedIntent.kind !== "text"
        ? {
            jobId: "pending",
            kind: detectedIntent.kind,
            mode: detectedIntent.mode,
            status: "queued",
            stage:
              detectedIntent.kind === "video"
                ? detectedIntent.mode === "image-to-video"
                  ? "Animating image..."
                  : "Generating video..."
                : detectedIntent.mode === "edit"
                  ? "Editing image..."
                  : "Creating image...",
            progress: null,
            prompt: detectedIntent.prompt,
            aspectRatio: detectedIntent.aspectRatio,
            startedAt: Date.now(),
          }
        : undefined;

    const user: ChatMessage = { id: makeId("message"), role: "user", content: request, createdAt: Date.now(), attachments: attached.length ? attached : undefined };
    const answer: ChatMessage = {
      id: assistantId,
      role: "assistant",
      model: model.name,
      modelCompany: model.company,
      content: "",
      createdAt: Date.now(),
      media: initialMediaState,
    };

    const nextChatsWithMessages = currentActiveChats.map((chat) =>
      chat.id === chatId
        ? {
            ...chat,
            title: baseMessages.length ? chat.title : request.length > 38 ? `${request.slice(0, 38)}...` : request,
            messages: [...baseMessages, user, answer],
            updatedAt: Date.now(),
          }
        : chat
    );

    if (targetHome) {
      homeChatsRef.current = nextChatsWithMessages;
      setHomeChats(nextChatsWithMessages);
    } else {
      builderChatsRef.current = nextChatsWithMessages;
      setBuilderChats(nextChatsWithMessages);
    }

    if (targetHome && detectedIntent.kind !== "text" && initialMediaState) {
      let latestMediaState = initialMediaState;
      try {
        const finalMedia = await startAndStreamMediaJob({
          kind: detectedIntent.kind,
          mode: detectedIntent.mode,
          prompt: detectedIntent.prompt,
          aspectRatio: detectedIntent.aspectRatio,
          durationSec: detectedIntent.kind === "video" ? detectedIntent.durationSec : undefined,
          enhancePrompt: true,
          sourceImageDataUrl: detectedIntent.sourceImageDataUrl,
          sourceMediaId: detectedIntent.sourceMedia?.id,
          signal: controller.signal,
          onUpdate: (nextMedia) => {
            latestMediaState = nextMedia;
            updateMessage(true, chatId, assistantId, { media: nextMedia });
          },
        });
        updateMessage(true, chatId, assistantId, { media: finalMedia, content: "" });
        void refreshGatewayState();
      } catch (error) {
        const aborted = (error instanceof DOMException && error.name === "AbortError") || controller.signal.aborted;
        updateMessage(true, chatId, assistantId, {
          content: "",
          media: {
            ...latestMediaState,
            status: aborted ? "cancelled" : "failed",
            stage: aborted ? "Cancelled" : "Unavailable",
            error: aborted ? undefined : errorText(error),
            finishedAt: Date.now(),
          },
        });
      } finally {
        activeControllerRef.current = null;
        if (mounted.current) setTargetBusyId(null);
      }
      return null;
    }

    let builtWebPreview = false;
    let committedFileCount = 0;
    let didCheckpoint = false;
    let finalResponseText: string | null = null;
    try {
      const result = await runCompanyModel({
        model,
        availability,
        prompt: request,
        history: currentHistory,
        files: oldFiles,
        attachments: attached,
        settings: buildSettings,
        conversationId: chatId,
        signal: controller.signal,
        mode: targetHome ? "chat" : "builder",
        report: (run, text) => updateMessage(targetHome, chatId, assistantId, { run, content: text }),
        onStreamText: () => { /* Stream updates arrive via report() */ },
        commit: (checkedFiles, commitOptions) => {
          if (targetHome) return;
          if (!mounted.current) throw new DOMException("Build stopped", "AbortError");
          const shouldCheckpoint = !didCheckpoint;
          didCheckpoint = true;
          commitProject(chatId, checkedFiles, shouldCheckpoint, buildSettings.autoSave);
          setPreviewVersion((v) => v + 1);
          committedFileCount = checkedFiles.length;
          if (commitOptions?.isFinal !== false) {
            setEditorDirty(false); setCheckIssue(""); setChecks([]);
          }
          if (checkedFiles.length > 0 && Boolean(previewDocument(checkedFiles))) {
            builtWebPreview = true;
          }
        },
      });
      finalResponseText = result.run.status === "complete" ? result.content : null;
      updateMessage(targetHome, chatId, assistantId, { content: result.content, run: result.run });
      if (!targetHome && result.run.status === "complete" && (builtWebPreview || committedFileCount > 0)) {
        if (pageModeRef.current === "builder") {
          setView("preview");
          setPreviewTab(builtWebPreview ? "preview" : "files");
        }
        notify(
          builtWebPreview
            ? `Built with ${model.name} · Live preview ready.`
            : `Built ${committedFileCount} file(s) with ${model.name} · Open Files or Terminal.`
        );
      }
      void refreshGatewayState();
    } catch (error) {
      const errorDetail = error instanceof BackendRequestError ? error.detail : undefined;
      updateMessage(targetHome, chatId, assistantId, {
        content: errorText(error),
        run: {
          id: makeId("run"),
          engine: "notrack",
          modelName: model.name,
          companyName: model.companyName,
          company: model.company,
          usedProvider: "notrack",
          errorDetail,
          status: "failed",
          startedAt: Date.now(),
          finishedAt: Date.now(),
          steps: [],
          files: [],
          checks: [],
          retryPrompt: request,
        },
      });
    } finally {
      activeControllerRef.current = null;
      if (mounted.current) setTargetBusyId(null);
    }
    return finalResponseText;
  };

  liveVoiceHandlerRef.current = (spokenText: string) => {
    const cleanSpoken = spokenText.trim();
    if (!cleanSpoken || homeControllerRef.current) return;
    const generation = liveVoiceSessionRef.current.generation + 1;
    liveVoiceSessionRef.current = { active: true, generation };
    speech.stop();
    cancelTts();
    setLiveVoiceError(null);
    setLiveVoicePhase("processing");
    setLiveVoiceQuery(cleanSpoken);
    setLiveVoiceSpokenText("");

    void (async () => {
      const replyText = await send(cleanSpoken, undefined, undefined, { preserveDraft: true });
      if (!mounted.current || !liveVoiceSessionRef.current.active || liveVoiceSessionRef.current.generation !== generation) {
        return;
      }
      let toSpeak = "";
      if (replyText && replyText.trim()) {
        toSpeak = cleanTextForSpeech(replyText)
          ? replyText
          : "I generated the code response in your chat.";
      } else {
        const currentChat = homeChatsRef.current.find((c) => c.id === activeHomeId) ?? homeChatsRef.current[0];
        const lastMsg = currentChat?.messages.at(-1);
        const failText =
          lastMsg?.role === "assistant" && lastMsg.run?.status === "failed" && lastMsg.content.trim()
            ? lastMsg.content.trim()
            : "";
        if (failText) {
          setLiveVoiceError(failText);
          toSpeak = failText;
        }
      }

      if (toSpeak) {
        setLiveVoicePhase("speaking");
        await speakResponseChunks(toSpeak, generation);
      }

      if (!mounted.current || !liveVoiceSessionRef.current.active || liveVoiceSessionRef.current.generation !== generation) {
        return;
      }
      setLiveVoiceQuery("");
      setLiveVoiceSpokenText("");
      // Allow mobile audio routing a brief beat to release speaker before opening mic
      await new Promise<void>((resolve) => window.setTimeout(resolve, 160));
      if (!mounted.current || !liveVoiceSessionRef.current.active || liveVoiceSessionRef.current.generation !== generation) {
        return;
      }
      if (!settingsRef.current.microphoneEnabled) {
        setLiveVoicePhase("paused");
        liveVoiceSessionRef.current = { active: false, generation };
        return;
      }
      const resumed = speech.start();
      setLiveVoicePhase(resumed ? "listening" : "paused");
      if (!resumed) {
        liveVoiceSessionRef.current = { active: false, generation };
      }
    })();
  };

  const toggleLiveVoiceMic = () => {
    if (!liveVoiceOpen || liveVoicePhase === "off" || liveVoicePhase === "paused") {
      startLiveVoice();
      return;
    }
    if (liveVoicePhase === "listening") {
      const generation = liveVoiceSessionRef.current.generation + 1;
      liveVoiceSessionRef.current = { active: false, generation };
      speech.stop();
      setLiveVoicePhase("paused");
      return;
    }
    if (liveVoicePhase === "speaking") {
      // Instant barge-in: stop speaking and start listening immediately
      startLiveVoice();
      return;
    }
    if (liveVoicePhase === "processing") {
      homeControllerRef.current?.abort();
      homeControllerRef.current = null;
      startLiveVoice();
    }
  };

  const animateGeneratedImage = (item: GeneratedMediaItem) => {
    void send(`Animate this image into a video: ${item.prompt}`, {
      kind: "video",
      mode: "image-to-video",
      prompt: `Cinematic motion video based on: ${item.prompt}`,
      aspectRatio: item.aspectRatio === "9:16" ? "9:16" : item.aspectRatio === "1:1" ? "1:1" : "16:9",
      sourceMedia: item,
    });
  };

  const regenerateMedia = (mediaState: MediaGenerationState) => {
    if (mediaState.kind === "video") {
      void send(mediaState.prompt, {
        kind: "video",
        mode: mediaState.mode === "edit" ? "edit" : mediaState.mode === "image-to-video" ? "image-to-video" : "generate",
        prompt: mediaState.prompt,
        aspectRatio: (mediaState.aspectRatio as "16:9" | "9:16" | "1:1") || "16:9",
      });
    } else {
      void send(mediaState.prompt, {
        kind: "image",
        mode: mediaState.mode === "edit" ? "edit" : "generate",
        prompt: mediaState.prompt,
        aspectRatio: (mediaState.aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9") || "1:1",
      });
    }
  };

  const editGeneratedImage = (item: GeneratedMediaItem, instruction?: string) => {
    const clean = instruction?.trim();
    if (!clean) return;
    const targetRatio = (
      item.aspectRatio === "1:1" || item.aspectRatio === "3:4" || item.aspectRatio === "4:3" || item.aspectRatio === "9:16" || item.aspectRatio === "16:9"
        ? item.aspectRatio
        : "1:1"
    ) as "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
    void send(clean, {
      kind: "image",
      mode: "edit",
      prompt: clean,
      aspectRatio: targetRatio,
      sourceMedia: item,
    });
  };

  const variationGeneratedImage = (item: GeneratedMediaItem) => {
    const targetRatio = (
      item.aspectRatio === "1:1" || item.aspectRatio === "3:4" || item.aspectRatio === "4:3" || item.aspectRatio === "9:16" || item.aspectRatio === "16:9"
        ? item.aspectRatio
        : "1:1"
    ) as "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
    void send(`Create a fresh variation of: ${item.prompt}`, {
      kind: "image",
      mode: "generate",
      prompt: `Fresh creative variation of: ${item.prompt}`,
      aspectRatio: targetRatio,
    });
  };

  const newChat = () => {
    if (busy) return;
    if (pageMode === "chat-page") {
      const chat = createChat(homeChats.length + 1);
      const next = [chat, ...homeChatsRef.current];
      homeChatsRef.current = next;
      setHomeChats(next);
      setActiveHomeId(chat.id);
    } else {
      const chat = createChat(builderChats.length + 1);
      const next = [chat, ...builderChatsRef.current];
      builderChatsRef.current = next;
      setBuilderChats(next);
      setActiveBuilderId(chat.id);
    }
    setView("chat"); setDrawerOpen(false); setMoreOpen(false); setDraft(""); setAttachments([]); setCheckIssue(""); setEditorDirty(false);
  };
  const selectChat = (chat: Chat) => {
    if (pageMode === "chat-page") {
      setActiveHomeId(chat.id);
    } else {
      setActiveBuilderId(chat.id);
    }
    setView("chat"); setDrawerOpen(false); setMoreOpen(false); setDraft(""); setAttachments([]); setCheckIssue(""); setChecks([]); setEditorDirty(false);
  };
  const deleteChat = (chat: Chat) => {
    if (busy) return;
    if (chat.locked) {
      notify("This chat is locked. Unlock it from the chat menu before deleting.", true);
      return;
    }
    if (pageMode === "chat-page") {
      const nextChats = homeChatsRef.current.filter((item) => item.id !== chat.id);
      if (!nextChats.length) nextChats.push(createChat(1));
      homeChatsRef.current = nextChats;
      setHomeChats(nextChats);
      if (activeHomeId === chat.id) setActiveHomeId(nextChats[0].id);
    } else {
      const nextChats = builderChatsRef.current.filter((item) => item.id !== chat.id);
      if (!nextChats.length) nextChats.push(createChat(1));
      const nextProjects = { ...projectsRef.current };
      delete nextProjects[chat.id];
      try {
        localStorage.setItem(FILES_KEY, JSON.stringify(nextProjects));
        setProjectMemory(nextProjects);
        builderChatsRef.current = nextChats;
        setBuilderChats(nextChats);
        if (activeBuilderId === chat.id) setActiveBuilderId(nextChats[0].id);
      } catch {
        notify("Could not remove this project from device storage.", true);
      }
    }
  };
  const patchChatItem = (chatId: string, patch: Partial<Chat>) => {
    if (pageModeRef.current === "chat-page") {
      const next = homeChatsRef.current.map((item) => (item.id === chatId ? { ...item, ...patch, updatedAt: Date.now() } : item));
      homeChatsRef.current = next;
      setHomeChats(next);
    } else {
      const next = builderChatsRef.current.map((item) => (item.id === chatId ? { ...item, ...patch, updatedAt: Date.now() } : item));
      builderChatsRef.current = next;
      setBuilderChats(next);
    }
  };
  const applyRenameChat = () => {
    if (!chatRenameTarget) return;
    const clean = chatRenameValue.trim();
    if (!clean) return;
    patchChatItem(chatRenameTarget.id, { title: clean });
    setChatRenameTarget(null);
    notify(`Renamed to "${clean}".`);
  };
  const applyProjectTag = () => {
    if (!chatProjectTarget) return;
    const clean = chatProjectValue.trim();
    patchChatItem(chatProjectTarget.id, { projectTag: clean || undefined });
    setChatProjectTarget(null);
    notify(clean ? `Added to project "${clean}".` : "Removed from project.");
  };
  const togglePinChat = (chat: Chat) => {
    const nextPinned = !chat.pinned;
    patchChatItem(chat.id, { pinned: nextPinned });
    notify(nextPinned ? `Pinned "${chat.title}".` : `Unpinned "${chat.title}".`);
  };
  const toggleArchiveChat = (chat: Chat) => {
    const nextArchived = !chat.archived;
    patchChatItem(chat.id, { archived: nextArchived });
    notify(nextArchived ? `Archived "${chat.title}".` : `Restored "${chat.title}" from archive.`);
  };
  const toggleLockChat = (chat: Chat) => {
    const nextLocked = !chat.locked;
    patchChatItem(chat.id, { locked: nextLocked });
    notify(nextLocked ? `Locked "${chat.title}".` : `Unlocked "${chat.title}".`);
  };
  const clearCurrentChat = () => {
    if (busy || !active.messages.length) return;
    if (active.locked) {
      notify("This chat is locked. Unlock it before clearing messages.", true);
      return;
    }
    setConfirmState({
      title: "Clear conversation",
      description: `Clear all messages in "${active.title}"? Your generated workspace files stay intact.`,
      confirmLabel: "Clear messages",
      onConfirm: () => {
        updateActiveChats(
          chats.map((item) =>
            item.id === active.id ? { ...item, messages: [], updatedAt: Date.now() } : item
          )
        );
        notify("Conversation cleared.");
      },
    });
  };
  const toggleBookmark = () => {
    updateActiveChats(
      chats.map((item) =>
        item.id === active.id ? { ...item, bookmarked: !item.bookmarked, updatedAt: Date.now() } : item
      )
    );
  };

  const attachFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []).slice(0, Math.max(0, 5 - attachments.length));
    event.target.value = "";
    const result: Attachment[] = [];
    for (const file of picked) {
      const isImage = file.type.startsWith("image/");
      const limit = isImage ? 8_000_000 : 2_000_000;
      if (file.size > limit) {
        notify(`${file.name} is over the ${isImage ? "8 MB image" : "2 MB file"} limit.`, true);
        continue;
      }
      try {
        if (isImage) {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error("Could not read image"));
            reader.readAsDataURL(file);
          });
          result.push({ id: makeId("attachment"), name: file.name, size: file.size, type: file.type || "image/jpeg", dataUrl });
          continue;
        }
        let text: string | undefined;
        if (/\.pdf$/i.test(file.name)) text = await extractPdfText(await file.arrayBuffer());
        else if (/\.docx$/i.test(file.name)) text = await extractDocxText(await file.arrayBuffer());
        else if (file.type.startsWith("text/") || /\.(html|css|js|json|md|txt|kt|kts|xml|tsx?|jsx|csv|py|yaml|yml)$/i.test(file.name)) text = await file.text();
        if (!text?.trim()) {
          notify(`${file.name} has no extractable text. Attach an image, PDF, DOCX, or plain-text file.`, true);
          continue;
        }
        result.push({ id: makeId("attachment"), name: file.name, size: file.size, type: file.type, text: text.slice(0, 100000) });
      } catch {
        notify(`Could not read ${file.name}. The file was not attached.`, true);
      }
    }
    if (result.length) setAttachments((previous) => [...previous, ...result].slice(0, 5));
  };

  const editorChange = (content: string) => {
    if (!currentFile || busy) return;
    const next = files.map((file) => file.path === currentFile.path ? { ...file, content, updatedAt: Date.now() } : file);
    setEditorDirty(true); setCheckIssue(""); setChecks([]); setPreviewVersion((v) => v + 1);
    try { commitProject(active.id, next); }
    catch { setProjectMemory({ ...projectsRef.current, [active.id]: next }); notify("Editor changes are in memory only. Device storage is full; export your project.", true); }
  };
  const runChecks = async () => {
    if (busy || checking || !files.length) return;
    setChecking(true); setCheckIssue("");
    try {
      const targetMode = isAndroid ? "android" : "website";
      const enforceReactVite = shouldEnforceReactVite("", files, targetMode);
      const source = checkSource(files, { target: targetMode, enforceReactVite });
      const serverCheck = await verifyWorkspaceOnServer(
        files.map((f) => ({ path: f.path, content: f.content })),
        undefined,
        { targetMode, enforceReactVite }
      );
      const compilerChecks: BuildCheck[] = serverCheck.checkedFiles > 0
        ? [
            {
              name: "Compiler verification",
              passed: serverCheck.diagnostics.every((d) => d.severity !== "error"),
              detail: serverCheck.diagnostics.some((d) => d.severity === "error")
                ? serverCheck.diagnostics
                    .filter((d) => d.severity === "error")
                    .slice(0, 4)
                    .map((e) => `${e.path}:${e.line} ${e.message}`)
                    .join(" | ")
                : `Verified ${serverCheck.checkedFiles} file(s) with backend compiler.`,
            },
          ]
        : [];
      const runtime = settings.interactionChecks ? await checkPreview(files, "imported") : [];
      const combined = [...source, ...compilerChecks, ...runtime];
      setChecks(combined);
      const passedCount = combined.filter((check) => check.passed).length;
      const failedCount = combined.length - passedCount;
      if (failedCount > 0) {
        setCheckIssue(`${failedCount} check(s) need attention: ${combined.filter((c) => !c.passed).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`).join(" · ")}`);
      }
      notify(`${passedCount}/${combined.length} checks passed${settings.interactionChecks ? "." : "; interaction checks are off."}`, failedCount > 0);
    } catch (error) { setCheckIssue(errorText(error)); setChecks([]); }
    finally { setChecking(false); }
  };
  const openFile = (path: string) => {
    setEditorPath(path);
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path].slice(-8)));
    setView("preview");
    setPreviewTab("editor");
  };
  const closeTab = (path: string) => {
    setOpenTabs((prev) => {
      const remaining = prev.filter((p) => p !== path);
      if (editorPath === path && remaining.length) setEditorPath(remaining[remaining.length - 1]);
      return remaining;
    });
  };
  const addFile = () => {
    const path = normalizeWorkspacePath(newFileName.trim());
    if (!/^[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+$/.test(path) || /(^|\/)\.\.($|\/)|^\//.test(path)) {
      setNewFileIssue("Use a relative source path, e.g. app/src/main/java/com/sujith/generated/HomeScreen.kt");
      return;
    }
    if (files.some((file) => file.path === path)) { setNewFileIssue("A file with that name already exists."); return; }
    try {
      commitProject(active.id, [...files, { path, content: "", language: languageForPath(path), updatedAt: Date.now() }]);
      setNewFileOpen(false); setNewFileName(""); setNewFileIssue(""); setEditorDirty(true); openFile(path);
    } catch { setNewFileIssue("Device storage is full. Export your work before adding more files."); }
  };
  const addFolder = () => {
    const folder = normalizeWorkspacePath(newFolderName.trim());
    if (!folder || !/^[a-zA-Z0-9_./-]+$/.test(folder)) {
      setNewFolderIssue("Use a valid relative folder path, e.g. app/src/main/java/com/sujith/generated/screens");
      return;
    }
    setEmptyFolders((prev) => {
      const list = prev[active.id] ?? [];
      if (list.includes(folder)) return prev;
      return { ...prev, [active.id]: [...list, folder] };
    });
    setNewFolderOpen(false); setNewFolderName(""); setNewFolderIssue("");
    notify(`Created folder ${folder}`);
  };
  const startRenameFile = (path: string) => {
    setRenameTarget(path);
    setRenameValue(path);
    setRenameIssue("");
  };
  const applyRenameFile = () => {
    if (!renameTarget) return;
    const nextPath = normalizeWorkspacePath(renameValue.trim());
    if (!/^[a-zA-Z0-9_./-]+\.[a-zA-Z0-9]+$/.test(nextPath)) {
      setRenameIssue("Provide a valid relative path with file extension.");
      return;
    }
    if (nextPath !== renameTarget && files.some((f) => f.path === nextPath)) {
      setRenameIssue("A file with that path already exists.");
      return;
    }
    const nextFiles = files.map((f) => (f.path === renameTarget ? { ...f, path: nextPath, language: languageForPath(nextPath), updatedAt: Date.now() } : f));
    commitProject(active.id, nextFiles, true);
    setOpenTabs((prev) => prev.map((p) => (p === renameTarget ? nextPath : p)));
    if (editorPath === renameTarget) setEditorPath(nextPath);
    setRenameTarget(null);
    setEditorDirty(true);
    setPreviewVersion((v) => v + 1);
  };
  const deleteFileByPath = (targetPath: string) => {
    if (busy) return;
    setConfirmState({
      title: "Delete file",
      description: `Delete ${targetPath} from this workspace?`,
      confirmLabel: "Delete file",
      onConfirm: () => {
        try {
          const next = files.filter((file) => file.path !== targetPath);
          commitProject(active.id, next, true);
          closeTab(targetPath);
          setEditorDirty(true); setCheckIssue(""); setPreviewVersion((v) => v + 1);
        } catch (error) {
          notify(errorText(error), true);
        }
      },
    });
  };
  const deleteFile = () => {
    if (currentFile) deleteFileByPath(currentFile.path);
  };
  const importProjectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!picked.length || busy) return;
    try {
      const incoming: WorkspaceFile[] = [];
      for (const file of picked) {
        if (/\.zip$/i.test(file.name)) {
          const extracted = importZipArchive(await file.arrayBuffer());
          incoming.push(...extracted);
        } else if (file.size <= 1_500_000) {
          const clean = normalizeWorkspacePath(file.webkitRelativePath || file.name);
          if (!clean) continue;
          incoming.push({
            path: clean,
            content: await file.text(),
            language: languageForPath(clean),
            updatedAt: Date.now(),
          });
        }
      }
      if (!incoming.length) {
        notify("No supported text or ZIP project files found.", true);
        return;
      }
      const merged = mergeWorkspaceFiles(files, incoming);
      commitProject(active.id, merged, true);
      setPreviewVersion((v) => v + 1);
      notify(`Imported ${incoming.length} file(s) into workspace.`);
    } catch {
      notify("Could not import the selected project files.", true);
    }
  };
  const undo = () => {
    const previous = undoFiles[active.id];
    if (!previous || busy) return;
    try { commitProject(active.id, previous); setUndoFiles((value) => { const next = { ...value }; delete next[active.id]; return next; }); setEditorDirty(false); setChecks([]); setPreviewVersion((v) => v + 1); notify("Previous project restored."); }
    catch (error) { notify(errorText(error), true); }
  };

  const exportBackup = () => { download(JSON.stringify({ format: "sujith-workspace-v2", exportedAt: new Date().toISOString(), chats: builderChatsRef.current, projects: projectsRef.current }, null, 2), "sujith-workspace.json"); };
  const restoreBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file || busy) return;
    try {
      if (file.size > 15_000_000) throw new Error("That backup exceeds the 15 MB restore limit.");
      const imported = checkBackup(JSON.parse(await file.text()));
      setConfirmState({
        title: "Restore workspace backup",
        description: `Restore ${imported.chats.length} chats? This replaces this device's current workspace.`,
        confirmLabel: "Restore",
        onConfirm: () => {
          const oldChats = localStorage.getItem(CHAT_KEY), oldFiles = localStorage.getItem(FILES_KEY);
          try {
            localStorage.setItem(FILES_KEY, JSON.stringify(imported.projects));
            localStorage.setItem(CHAT_KEY, JSON.stringify(imported.chats));
          } catch (error) {
            if (oldFiles !== null) localStorage.setItem(FILES_KEY, oldFiles);
            if (oldChats !== null) localStorage.setItem(CHAT_KEY, oldChats);
            notify(errorText(error), true);
            return;
          }
          const normalized = loadSpecificChats(CHAT_KEY, [firstBuilderChat]);
          builderChatsRef.current = normalized;
          setBuilderChats(normalized);
          setProjectMemory(imported.projects);
          setActiveBuilderId(normalized[0].id);
          setSettingsOpen(false);
          setView("chat");
          setChecks([]);
          setCheckIssue("");
          notify("Workspace restored.");
        },
      });
    } catch (error) { notify(errorText(error), true); }
  };
  const clearWorkspace = () => {
    if (busy) return;
    setConfirmState({
      title: "Delete all workspace data",
      description: "Delete all chats and generated projects from this device? Export a backup first if you need them.",
      confirmLabel: "Delete all",
      onConfirm: () => {
        try {
          const newB = createChat(1);
          const newH = createChat(1);
          localStorage.removeItem(FILES_KEY);
          localStorage.removeItem(CHAT_KEY);
          localStorage.removeItem(HOME_CHAT_KEY);
          localStorage.removeItem("sujith-ai.preview-state.v1");
          builderChatsRef.current = [newB];
          setBuilderChats([newB]);
          setActiveBuilderId(newB.id);
          homeChatsRef.current = [newH];
          setHomeChats([newH]);
          setActiveHomeId(newH.id);
          setProjectMemory({});
          setUndoFiles({});
          setSettingsOpen(false);
          setView("chat");
          setHomeDraft("");
          setBuilderDraft("");
          setHomeAttachments([]);
          setBuilderAttachments([]);
          notify("Workspace data deleted.");
        } catch { notify("The browser could not remove workspace data.", true); }
      },
    });
  };
  const install = async () => {
    if (!installPrompt) { notify("Use your browser menu and choose Install app or Add to Home Screen. This installs a web app, not an APK."); return; }
    try { await installPrompt.prompt(); await installPrompt.userChoice; setInstallPrompt(null); }
    catch { notify("The browser did not offer an install prompt. Try its menu instead.", true); }
  };
  const saveManually = () => {
    try { localStorage.setItem(FILES_KEY, JSON.stringify(projectsRef.current)); notify("Projects saved on this device."); }
    catch { notify("Device storage is full. Export your project to keep a copy.", true); }
  };
  const exportSource = () => { if (files.length) { try { exportWebsite(files, projectTitle); } catch (error) { notify(errorText(error), true); } } };
  const goBack = () => { if (moreOpen) setMoreOpen(false); else if (drawerOpen) setDrawerOpen(false); else if (view === "preview") setView("chat"); else setDrawerOpen(true); };

  const storageBytes = Object.values(projects).flat().reduce((sum, file) => sum + new Blob([file.content]).size, 0);
  const totalFileCount = Object.values(projects).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="app-stage">
      <div className={cn("app-shell", settings.reduceMotion && "reduce-motion")}>
        {pageMode === "chat-page" ? (
          <ChatHomePage
            chats={homeChats}
            active={activeHomeChat}
            files={[]}
            draft={homeDraft}
            onDraftChange={setHomeDraft}
            attachments={homeAttachments}
            onRemoveAttachment={(id) => setHomeAttachments((previous) => previous.filter((item) => item.id !== id))}
            selectedModel={findCatalogModel(homeSelectedModelId, availability.discoveredModels)}
            availability={availability}
            busy={homeBusyId !== null}
            speech={speech}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenUsageOrPlan={() => {
              setUsageOpen(true);
              void refreshGatewayState();
            }}
            onOpenModels={() => setModelsOpen(true)}
            onNewChat={newChat}
            onSelectChat={selectChat}
            onToggleBookmark={toggleBookmark}
            onShareChat={() => {
              const text = activeHomeChat.messages
                .map((message) => `${message.role === "user" ? "You" : "SUJITH IDE"}\n${message.content}`)
                .join("\n\n");
              download(text, `${activeHomeChat.title || "sujith-chat"}.txt`, "text/plain");
            }}
            onCopyChat={() => {
              const latestAssistant = [...activeHomeChat.messages].reverse().find((m) => m.role === "assistant" && m.content.trim());
              const text = latestAssistant
                ? latestAssistant.content
                : activeHomeChat.messages.map((m) => `${m.role === "user" ? "You" : "SUJITH IDE"}: ${m.content}`).join("\n\n");
              if (text) void copyText(text);
            }}
            onSend={(prompt) => void send(prompt)}
            onResendMessage={(messageId, editedText) => void send(editedText, undefined, messageId)}
            onStop={() => homeControllerRef.current?.abort()}
            voiceOpen={liveVoiceOpen}
            voicePhase={liveVoicePhase}
            voiceQuery={liveVoiceQuery}
            voiceSpokenText={liveVoiceSpokenText}
            voiceError={liveVoiceError}
            voiceSpeechPulse={liveVoiceSpeechPulse}
            voiceName={settings.voiceName}
            microphoneEnabled={settings.microphoneEnabled}
            onEnableMicrophone={() => {
              const next = { ...settingsRef.current, microphoneEnabled: true };
              settingsRef.current = next;
              setSettings(next);
              startLiveVoice();
            }}
            onOpenVoiceSettings={() => setVoiceSettingsOpen(true)}
            onStartLiveVoice={startLiveVoice}
            onToggleLiveVoiceMic={toggleLiveVoiceMic}
            onCloseLiveVoice={stopLiveVoice}
            onFileOpen={() => undefined}
            onCopyText={(text) => void copyText(text)}
            onAnimateImage={animateGeneratedImage}
            onEditImage={editGeneratedImage}
            onVariationImage={variationGeneratedImage}
            onRegenerateMedia={regenerateMedia}
            onNotify={notify}
            onCamera={() => cameraInput.current?.click()}
            onPhotos={() => photosInput.current?.click()}
            onFiles={() => filesInput.current?.click()}
            onDocument={() => documentInput.current?.click()}
            endRef={endRef}
            enterToSend={settings.enterToSend}
          />
        ) : (
          <>
            {view === "chat" ? <header className="flex shrink-0 items-center gap-2.5 px-3.5 pb-2 pt-[max(13px,env(safe-area-inset-top))]"><button type="button" className="icon-button" onClick={() => setDrawerOpen(true)} aria-label="Open navigation menu"><Menu size={23} strokeWidth={1.8} /></button><div className="flex min-w-0 items-center gap-2.5"><AppLogo size={25} /><span className="truncate text-[20px] font-normal tracking-[-.015em] text-[var(--ink-soft)]">SUJITH AI</span></div><button type="button" className="icon-button ml-auto" onClick={newChat} disabled={busy} aria-label="New build project"><Plus size={26} strokeWidth={1.55} /></button></header> :
              <header className="flex shrink-0 items-center gap-1 px-2 pb-2 pt-[max(10px,env(safe-area-inset-top))]"><button type="button" className="icon-button" onClick={() => setView("chat")} aria-label="Back to chat"><ChevronLeft size={24} /></button><div className="min-w-0 flex-1 px-1"><p className="truncate text-[14px] font-medium text-[var(--ink)]">{projectTitle}</p><p className="mt-0.5 truncate text-[9px] text-[var(--muted)]">{files.length} files{editorDirty ? " · Edited, run checks" : " · Workspace"}</p></div><button type="button" className="icon-button" disabled={!sourceHtml} onClick={() => { if (previewRef.current?.requestFullscreen) void previewRef.current.requestFullscreen().catch(() => notify("Full screen is unavailable in this browser.", true)); else notify("Use your browser's full screen option."); }} aria-label="Fullscreen preview"><Maximize2 size={16} /></button><button type="button" className="icon-button" disabled={!files.length} onClick={exportSource} aria-label="Download project ZIP"><Download size={17} /></button></header>}

            {view === "chat" ? <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-4" aria-label="Builder Chat">
              {!activeBuilderChat.messages.length ? <h1 className="animate-fade-in px-1 pt-[clamp(56px,13vh,140px)] text-center text-[27px] font-semibold leading-tight tracking-[-.025em] text-[var(--ink)]">What would you like to build?</h1> : <div className="space-y-5 pt-4">{activeBuilderChat.messages.map((message) => message.role === "user" ? (editingBuilderMessageId === message.id ? <div key={message.id} className="flex flex-col items-end gap-1.5">{message.attachments?.length ? <div className="flex max-w-[92%] flex-wrap justify-end gap-2">{message.attachments.map((file) => <span key={file.id} className="inline-flex max-w-full items-center gap-2 rounded-[10px] border border-[#dfe3e8] bg-white px-2.5 py-1.5 text-[12.5px] text-[#374151] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{file.dataUrl ? <img src={file.dataUrl} alt={file.name} className="h-5 w-5 shrink-0 rounded object-cover" /> : <FileText size={13} className="shrink-0 text-[#5f6368]" />}<span className="truncate">{file.name}</span></span>)}</div> : null}<InlineMessageEditor initialValue={message.content} enterToSend={settings.enterToSend} busy={busy} hasAttachments={Boolean(message.attachments?.length)} onCancel={() => setEditingBuilderMessageId(null)} onSend={(editedText) => { setEditingBuilderMessageId(null); void send(editedText, undefined, message.id); }} /></div> : <div key={message.id} className="flex flex-col gap-1"><div className="rounded-[16px] bg-[#f2f4f7] px-4 py-3 text-[15.5px] leading-[1.52] text-[#1f2937] dark:bg-slate-800 dark:text-slate-100"><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.content}</p>{message.attachments?.length ? <div className="mt-2.5 flex flex-wrap gap-2">{message.attachments.map((file) => <span key={file.id} className="inline-flex max-w-full items-center gap-2 rounded-[10px] border border-[#dfe3e8] bg-white px-2.5 py-1.5 text-[12.5px] text-[#374151] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">{file.dataUrl ? <img src={file.dataUrl} alt={file.name} className="h-5 w-5 shrink-0 rounded object-cover" /> : <FileText size={13} className="shrink-0 text-[#5f6368]" />}<span className="truncate">{file.name}</span></span>)}</div> : null}</div><UserMessageActions content={message.content} busy={busy} onCopy={(text) => void copyText(text)} onEdit={() => setEditingBuilderMessageId(message.id)} /></div>) : <BuildReply key={message.id} message={message} showActivity={settings.showActivity} isBusy={builderBusyId !== null} availableFiles={files.map((file) => file.path)} onFile={openFile} onPreview={() => { setView("preview"); setPreviewTab("preview"); }} onRetry={(prompt) => void send(prompt)} onStop={() => builderControllerRef.current?.abort()} onCopy={(text) => void copyText(text)} onNotify={notify} />)}</div>}
              <div ref={endRef} className="h-2" />
            </main> : <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-label="Project workspace">
              <div className="flex shrink-0 items-center gap-2 border-y border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2"><div className="flex min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1" role="tablist" aria-label="Project views">{(["preview", "files", "editor", "terminal"] as const).map((tab) => <button type="button" role="tab" aria-selected={previewTab === tab} key={tab} onClick={() => setPreviewTab(tab)} className={cn("flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 text-[10px] capitalize whitespace-nowrap", previewTab === tab ? "bg-[var(--surface-muted)] font-medium text-[var(--ink)]" : "text-[var(--muted)]")}>{tab === "preview" ? <Eye size={11} /> : tab === "files" ? <FolderOpen size={11} /> : tab === "editor" ? <Code2 size={11} /> : <Terminal size={11} />}{tab}</button>)}</div><button type="button" onClick={() => setPublishOpen(true)} disabled={!files.length || busy} className="h-10 shrink-0 rounded-xl bg-[var(--ink)] px-3 text-[11px] font-medium text-[var(--surface)] disabled:opacity-30">Publish</button></div>
              {files.length ? <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--line)] px-2.5 py-1.5"><button type="button" onClick={() => void runChecks()} disabled={checking || busy} className="toolbar-action">{checking ? <LoaderCircle size={12} className="animate-spin" /> : <Play size={12} />}Run checks</button><button type="button" className="toolbar-action" onClick={undo} disabled={busy || !undoFiles[active.id]}><RotateCcw size={12} />Undo build</button>{isAndroid && <button type="button" className="toolbar-action" disabled={busy} onClick={() => setAndroidOpen(true)}><Code2 size={12} />Android source</button>}{previewTab === "preview" && <button type="button" className="toolbar-action" onClick={() => setDeviceSize((s) => (s === "full" ? "360" : s === "360" ? "412" : "full"))} title="Cycle preview screen width"><Smartphone size={11} />{deviceSize === "full" ? "Fit" : `${deviceSize}dp`}</button>}<button type="button" className="icon-button !h-7 !w-7 ml-auto" onClick={() => setPreviewVersion((version) => version + 1)} aria-label="Refresh preview"><RotateCw size={12} /></button></div> : null}
              {checkIssue && <div className="flex shrink-0 items-start gap-2 border-b border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-[10px] leading-relaxed text-[var(--muted)]"><AlertCircle size={13} className="mt-0.5 shrink-0 text-[#bb3c37]" /><p className="flex-1">{checkIssue}</p><button type="button" onClick={() => setCheckIssue("")} aria-label="Dismiss check result"><X size={12} /></button></div>}
              {checks.length > 0 && <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--line)] px-3 py-1.5 text-[9px] text-[var(--muted)]"><Check size={11} className="text-[#2d9761]" />{checks.filter((check) => check.passed).length}/{checks.length} checks passed{checks.some((check) => !check.passed) ? ", with notes" : ""}.</div>}
              {!files.length && previewTab !== "terminal" ? <EmptyPreview onChat={() => setView("chat")} /> : previewTab === "preview" ? <section ref={previewRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[var(--surface-soft)]">{fullPreview ? <iframe ref={iframeRef} key={`${previewNonce}-${previewVersion}`} title="Live generated application preview" srcDoc={fullPreview} sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" allow="microphone 'none'; camera 'none'" style={deviceSize === "full" ? undefined : { width: `${deviceSize}px` }} className={cn("h-full border-0 bg-white", deviceSize === "full" ? "w-full" : "max-w-full shadow-lg")} /> : <div className="flex h-full flex-col items-center justify-center px-8 text-center"><Code2 size={28} className="text-[var(--muted)]" /><p className="mt-3 text-[13px] font-medium text-[var(--ink)]">Source files are available</p><p className="mt-2 text-[11px] text-[var(--muted)]">No previewable UI entry was found. Open Files or Terminal to inspect your project.</p><button type="button" className="mt-4 rounded-full border border-[var(--line)] px-4 py-2 text-[11px] text-[var(--ink)]" onClick={() => setPreviewTab("files")}>Open files</button></div>}</section> : previewTab === "files" ? <FileExplorer files={files} emptyFolders={emptyFolders[active.id] ?? []} activePath={currentFile?.path ?? ""} diagnostics={diagnostics} busy={busy} onOpenFile={openFile} onNewFile={() => { setNewFileIssue(""); setNewFileOpen(true); }} onNewFolder={() => { setNewFolderIssue(""); setNewFolderOpen(true); }} onRenameFile={startRenameFile} onDeleteFile={deleteFileByPath} onImportFiles={() => workspaceImportInput.current?.click()} onExportZip={exportSource} /> : previewTab === "editor" ? <CodeEditor files={files} openTabs={openTabs} currentFile={currentFile} diagnostics={diagnostics} autoSave={settings.autoSave} busy={busy} onSelectTab={(path) => openFile(path)} onCloseTab={closeTab} onNewFile={() => { setNewFileIssue(""); setNewFileOpen(true); }} onChange={editorChange} onCopy={(text) => void copyText(text)} onDelete={deleteFile} /> : <WorkspaceTerminal projectId={active.id} files={files} />}
            </main>}

            {view === "chat" && <div className="shrink-0 px-3 pb-1 pt-1.5">
              <div className="mb-2 flex items-center">
                <div className="inline-flex rounded-full bg-[var(--track)] p-1" role="tablist" aria-label="Build target">
                  {(["website", "android"] as const).map((target) => {
                    const selected = settings.buildTarget === target;
                    return (
                      <button
                        key={target}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        disabled={busy}
                        onClick={() => {
                          if (settings.buildTarget === target) return;
                          setSettings((prev) => ({ ...prev, buildTarget: target }));
                        }}
                        className={cn(
                          "flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] transition-all disabled:opacity-50",
                          selected
                            ? "bg-[var(--surface)] font-medium text-[var(--ink)] shadow-[0_1px_4px_-1px_rgba(0,0,0,.15)]"
                            : "font-normal text-[var(--muted)] hover:text-[var(--ink-soft)]"
                        )}
                      >
                        {target === "website" ? <Globe size={14} className="shrink-0" /> : <Smartphone size={14} className="shrink-0" />}
                        <span>{target === "website" ? "Website" : "Android"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="message-composer rounded-[27px] border border-[var(--line)] bg-[var(--surface)] px-3.5 pb-2.5 pt-3 shadow-[0_2px_10px_-6px_rgba(0,0,0,.12)]">
                {attachments.length > 0 && <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">{attachments.map((file) => <span key={file.id} className="flex max-w-[190px] shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1.5 text-[10px] text-[var(--ink-soft)]">{file.dataUrl ? <img src={file.dataUrl} alt="" className="h-5 w-5 shrink-0 rounded object-cover" /> : <FileText size={11} className="shrink-0" />}<span className="truncate">{file.name}</span><button type="button" onClick={() => setAttachments((previous) => previous.filter((item) => item.id !== file.id))} aria-label={`Remove ${file.name}`}><X size={11} /></button></span>)}</div>}
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} maxLength={16000} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && settings.enterToSend && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} placeholder={speech.listening ? "Listening..." : settings.buildTarget === "android" ? "Build an Android app (Kotlin, Compose, Flutter, NDK, Java...)" : "Build a website (HTML, React, Next.js, Tailwind, Python...)"} aria-label="Message SUJITH AI" className="placeholder-color thin-scrollbar block max-h-[125px] min-h-[52px] w-full resize-none border-0 bg-transparent p-0 text-[16px] leading-[1.4] text-[var(--ink)] outline-none" />
                <div className="mt-2 flex items-center justify-between gap-1.5">
                  <div className="relative shrink-0">
                    <button type="button" className="composer-button" onClick={() => setAttachMenuOpen((open) => !open)} aria-label="Add an attachment" aria-expanded={attachMenuOpen} aria-haspopup="menu"><Plus size={22} strokeWidth={1.6} /></button>
                    <AttachmentMenu open={attachMenuOpen} onClose={() => setAttachMenuOpen(false)} onCamera={() => cameraInput.current?.click()} onPhotos={() => photosInput.current?.click()} onFiles={() => filesInput.current?.click()} onDocument={() => documentInput.current?.click()} />
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button type="button" onClick={() => setModelsOpen(true)} className="flex h-10 min-w-0 max-w-[165px] items-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[12.5px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] min-[390px]:h-11 min-[390px]:max-w-[195px]" aria-label={`Selected model: ${selectedModel.name}. Open model selector`}><CompanyLogo company={selectedModel.company} size={15} /><span className="truncate">{selectedModel.name}</span><ChevronDown size={13} className="shrink-0 text-[var(--muted)]" /></button>
                    <button type="button" className={cn("composer-button", speech.listening ? "!border-[#e9b4ae] !bg-[#fce8e6] !text-[#bb3c37]" : settings.microphoneEnabled ? "!text-[var(--blue)]" : "text-[var(--muted)]")} onClick={() => { if (!settings.microphoneEnabled && !speech.listening) { notify("Microphone is turned off in Settings. Turn it on to dictate.", true); return; } speech.toggle(); }} aria-pressed={speech.listening} aria-label={!settings.microphoneEnabled ? "Microphone is turned off in Settings" : speech.listening ? "Stop dictation" : "Dictate with microphone"}>{speech.listening || !settings.microphoneEnabled ? <MicOff size={19} /> : <Mic size={19} />}</button>
                    <button type="button" onClick={() => busy ? builderControllerRef.current?.abort() : void send()} disabled={!busy && !canSend} className={cn("composer-button", busy || canSend ? "!border-transparent !bg-[var(--ink)] !text-[var(--surface)]" : "text-[var(--muted)]")} aria-label={busy ? "Stop build" : "Send message"}>{busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={19} />}</button>
                  </div>
                </div>
              </div>
            </div>}

            <nav className="relative z-20 flex shrink-0 items-center gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1.5" aria-label="Chat and preview"><button type="button" onClick={goBack} className="icon-button" aria-label="Go back"><ArrowLeft size={22} strokeWidth={1.7} /></button><div className="flex h-11 min-w-0 flex-1 rounded-full bg-[var(--track)] p-1" role="tablist" aria-label="Workspace views">{(["chat", "preview"] as const).map((tab) => <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => { setView(tab); setMoreOpen(false); }} className={cn("h-full flex-1 rounded-full text-[14px] capitalize transition-all", view === tab ? "bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-[0_2px_8px_-3px_rgba(0,0,0,.2)]" : "font-medium text-[var(--muted)]")}>{tab}</button>)}</div><button type="button" className="icon-button" onClick={() => setMoreOpen((value) => !value)} aria-label="More options" aria-expanded={moreOpen}><MoreHorizontal size={22} /></button></nav>

            {moreOpen && <><button type="button" className="absolute inset-0 z-40 cursor-default" onClick={() => setMoreOpen(false)} aria-label="Dismiss more options" /><div className="animate-menu-in absolute bottom-[76px] right-3 z-50 w-[225px] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[0_20px_55px_-15px_rgba(0,0,0,.3)]"><button type="button" className="menu-action" onClick={() => { setMoreOpen(false); setModelsOpen(true); }}><CompanyLogo company={selectedModel.company} size={14} />AI Models ({selectedModel.name})</button><button type="button" className="menu-action" onClick={() => { setMoreOpen(false); setUsageOpen(true); void refreshGatewayState(); }}><BarChart3 size={14} />Usage &amp; Quotas</button><button type="button" className="menu-action" onClick={() => { setMoreOpen(false); setSubscriptionOpen(true); void refreshGatewayState(); }}><Crown size={14} />Subscriptions ({subscription.plan})</button><button type="button" className="menu-action" onClick={() => { setMoreOpen(false); setSettingsOpen(true); }}><Settings2 size={14} />Settings</button><button type="button" className="menu-action" onClick={() => { exportBackup(); setMoreOpen(false); }}><Download size={14} />Export workspace</button><button type="button" className="menu-action" onClick={() => { saveManually(); setMoreOpen(false); }}><Check size={14} />Save projects now</button><button type="button" className="menu-action" onClick={() => { const text = active.messages.map((message) => `${message.role === "user" ? "You" : "SUJITH AI"}\n${message.content}`).join("\n\n"); download(text, "sujith-chat.txt", "text/plain"); setMoreOpen(false); }} disabled={!active.messages.length}><FileText size={14} />Download conversation</button><button type="button" className="menu-action" disabled={busy || !active.messages.length} onClick={() => { setMoreOpen(false); clearCurrentChat(); }}><RotateCcw size={14} />Clear conversation</button><button type="button" className="menu-action" disabled={busy} onClick={() => { setMoreOpen(false); deleteChat(active); }}><Trash2 size={14} />Delete this chat</button></div></>}
          </>
        )}

        {drawerOpen && <NavigationDrawer chats={chats} activeId={active.id} busy={busy} pageMode={pageMode} onSelectPageMode={(mode) => { if (mode !== "chat-page") stopLiveVoice(); setPageMode(mode); if (mode === "builder") setView("chat"); }} onClose={() => setDrawerOpen(false)} onNew={newChat} onSelect={selectChat} onDelete={deleteChat} onStartRename={(chat) => { setChatRenameTarget(chat); setChatRenameValue(chat.title); }} onTogglePin={togglePinChat} onToggleArchive={toggleArchiveChat} onToggleLock={toggleLockChat} onAssignProject={(chat) => { setChatProjectTarget(chat); setChatProjectValue(chat.projectTag ?? ""); }} onSettings={() => { setDrawerOpen(false); setSettingsOpen(true); }} onOpenApiKeyGenerator={() => { setDrawerOpen(false); setApiKeyGeneratorOpen(true); }} onExport={exportBackup} />}
        {apiKeyGeneratorOpen && <ApiKeyGeneratorModal onClose={() => setApiKeyGeneratorOpen(false)} onSuccess={() => void refreshGatewayState()} onNotify={notify} />}
        {settingsOpen && <AppSettingsDialog settings={settings} onChange={(next) => { if (next.speechLanguage !== settings.speechLanguage) speech.stop(); setSettings(next); }} onClose={() => setSettingsOpen(false)} busy={busy || previewAI.busy} fileCount={totalFileCount} storageBytes={storageBytes} onExport={exportBackup} onImport={() => backupInput.current?.click()} onClear={clearWorkspace} canInstall={Boolean(installPrompt)} onInstall={() => void install()} onOpenModels={() => { setSettingsOpen(false); setModelsOpen(true); }} onOpenUsage={() => { setSettingsOpen(false); setUsageOpen(true); void refreshGatewayState(); }} onOpenSubscriptions={() => { setSettingsOpen(false); setSubscriptionOpen(true); void refreshGatewayState(); }} onOpenVoiceSettings={() => { setSettingsOpen(false); setVoiceSettingsOpen(true); }} onOpenApiKeyGenerator={() => { setSettingsOpen(false); setApiKeyGeneratorOpen(true); }} availability={availability} onRefreshStatus={() => { void refreshGatewayState(); }} />}
        <VoiceSettingsModal
          open={voiceSettingsOpen}
          settings={settings}
          onChange={(next) => {
            if (next.voiceLanguage !== settings.voiceLanguage || next.speechLanguage !== settings.speechLanguage) {
              speech.stop();
            }
            setSettings(next);
          }}
          dictationHistory={dictationHistory}
          onDeleteHistoryItem={(id) => {
            setDictationHistory((prev) => {
              const next = prev.filter((item) => item.id !== id);
              saveDictationHistory(next);
              return next;
            });
          }}
          onClearHistory={() => {
            setDictationHistory([]);
            saveDictationHistory([]);
            notify("Dictation history cleared.");
          }}
          onCopyText={(text) => void copyText(text)}
          onClose={() => setVoiceSettingsOpen(false)}
        />
        {modelsOpen && (
          <ModelSelectorModal
            selected={selectedModel}
            availability={availability}
            usage={usageSummary}
            subscription={subscription}
            onSelect={(model) => {
              setSelectedModelId(model.id);
              notify(`${model.name} (${model.companyName}) selected.`);
            }}
            onInspect={(model) => setInspectedModel(model)}
            onRefreshStatus={() => void refreshGatewayState().then(() => notify("NoTrack.ai status refreshed."))}
            onOpenUsage={() => { setUsageOpen(true); void refreshGatewayState(); }}
            onOpenSubscriptions={() => { setSubscriptionOpen(true); void refreshGatewayState(); }}
            onClose={() => setModelsOpen(false)}
          />
        )}
        {inspectedModel && (
          <ModelInfoSheet
            model={inspectedModel}
            availability={availability}
            usage={usageSummary}
            onSelect={() => {
              setSelectedModelId(inspectedModel.id);
              notify(`${inspectedModel.name} selected.`);
            }}
            onClose={() => setInspectedModel(null)}
          />
        )}
        {usageOpen && (
          <UsageModal
            usage={usageSummary}
            availability={availability}
            subscription={subscription}
            onRefresh={() => void refreshGatewayState().then(() => notify("Usage & quotas refreshed."))}
            onClose={() => setUsageOpen(false)}
          />
        )}
        {subscriptionOpen && (
          <SubscriptionModal
            subscription={subscription}
            onCheckout={async (plan: PlanTier, interval) => {
              const result = await startSubscriptionCheckout(plan, interval);
              if (!result.ok) { notify(result.message, true); return; }
              if (result.state) {
                setSubscription(result.state);
                void refreshGatewayState();
              } else if (result.checkoutUrl) {
                setCheckoutLink(result.checkoutUrl);
              }
              notify(result.message);
            }}
            onVerifySession={async (sessionId) => {
              const result = await verifySubscriptionPayment(sessionId);
              notify(result.message, !result.ok);
              if (result.ok) void refreshGatewayState();
            }}
            onManageAction={async (action) => {
              const result = await manageSubscriptionAction(action);
              notify(result.message, !result.ok);
              if (result.ok) void refreshGatewayState();
            }}
            onRefresh={() => void refreshGatewayState().then(() => notify("Subscription status refreshed."))}
            onClose={() => setSubscriptionOpen(false)}
          />
        )}
        {publishOpen && (
          <CloudApkDialog
            title={projectTitle}
            isAndroid={isAndroid}
            androidStack={androidStack}
            files={files}
            onClose={() => setPublishOpen(false)}
            onDownloadSourceZip={exportSource}
            onDownloadAndroidZip={() => {
              try {
                const rootFiles = files.filter((file) => !isAndroidPath(file.path));
                const nativeFiles = files.filter((file) => isAndroidPath(file.path));
                exportAndroidProject(projectTitle, rootFiles, nativeFiles);
                notify("Android / Gradle project ZIP downloaded.");
              } catch (error) {
                notify(errorText(error), true);
              }
            }}
            onAddWorkflowFile={(path, content) => {
              const merged = mergeWorkspaceFiles(files, [{ path, content, language: languageForPath(path), updatedAt: Date.now() }]);
              commitProject(active.id, merged, true);
              setPreviewVersion((v) => v + 1);
            }}
            onNotify={notify}
          />
        )}
        {androidOpen && (
          <Dialog
            title="Android Source Inspector"
            description="Generated native Kotlin / Java / Flutter / Gradle & Manifest modules."
            onClose={() => setAndroidOpen(false)}
            footer={
              <button
                type="button"
                onClick={() => {
                  try {
                    const rootFiles = files.filter((file) => !isAndroidPath(file.path));
                    const nativeFiles = files.filter((file) => isAndroidPath(file.path));
                    exportAndroidProject(projectTitle, rootFiles, nativeFiles);
                    notify("Android Studio / Gradle ZIP downloaded. No local APK compiled; use Cloud APK in Publish.");
                  } catch (error) {
                    notify(errorText(error), true);
                  }
                }}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] py-2.5 text-[12px] font-medium text-[var(--surface)]"
              >
                <Download size={14} />Download Android Studio / Gradle ZIP
              </button>
            }
          >
            <div className="space-y-2.5 py-4">
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                Detected stack: <strong className="text-[var(--ink)]">{androidStack}</strong> · {files.filter((f) => /\.(kt|kts|java|dart|xml|yaml|properties)$/i.test(f.path)).length} native/config files. Tap any file below to open it in the Code Editor.
              </p>
              <div className="max-h-[45vh] space-y-1.5 overflow-y-auto">
                {files
                  .filter((f) => /\.(kt|kts|java|dart|xml|yaml|properties|gradle)$/i.test(f.path) || f.path.startsWith(".github/"))
                  .map((file) => (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => {
                        setAndroidOpen(false);
                        openFile(file.path);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2 text-left text-[11px] text-[var(--ink-soft)] hover:bg-[var(--surface-muted)]"
                    >
                      <span className="truncate font-mono">{file.path}</span>
                      <span className="shrink-0 text-[9px] text-[var(--muted)]">{file.language}</span>
                    </button>
                  ))}
              </div>
            </div>
          </Dialog>
        )}
        {newFileOpen && <Dialog title="New source file" description="Add a relative path inside this project." onClose={() => setNewFileOpen(false)} footer={<><span className="text-[10px] text-[var(--muted)]">Saved as plain text.</span><button type="button" onClick={addFile} className="rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-medium text-[var(--surface)]">Create file</button></>}><label className="block py-5 text-[11px] text-[var(--muted)]">File path<input value={newFileName} onChange={(event) => setNewFileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addFile(); }} placeholder="app/src/main/java/com/sujith/generated/screens/HomeScreen.kt" className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-[12px] text-[var(--ink)]" aria-label="New file path" /></label>{newFileIssue && <p className="pb-4 text-[11px] text-[#bb3c37]" role="alert">{newFileIssue}</p>}</Dialog>}
        {newFolderOpen && <Dialog title="New folder" description="Create a folder path inside your workspace." onClose={() => setNewFolderOpen(false)} footer={<button type="button" onClick={addFolder} className="ml-auto rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-medium text-[var(--surface)]">Create folder</button>}><label className="block py-5 text-[11px] text-[var(--muted)]">Folder path<input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFolder(); }} placeholder="app/src/main/java/com/sujith/generated/viewmodel" className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-[12px] text-[var(--ink)]" aria-label="New folder path" /></label>{newFolderIssue && <p className="pb-4 text-[11px] text-[#bb3c37]" role="alert">{newFolderIssue}</p>}</Dialog>}
        {renameTarget && <Dialog title="Rename file" description={`Update path for ${renameTarget}.`} onClose={() => setRenameTarget(null)} footer={<button type="button" onClick={applyRenameFile} className="ml-auto rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-medium text-[var(--surface)]">Rename</button>}><label className="block py-5 text-[11px] text-[var(--muted)]">New path<input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyRenameFile(); }} className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-[12px] text-[var(--ink)]" aria-label="Renamed file path" /></label>{renameIssue && <p className="pb-4 text-[11px] text-[#bb3c37]" role="alert">{renameIssue}</p>}</Dialog>}
        {chatRenameTarget && <Dialog title="Rename conversation" description="Choose a new name for this item." onClose={() => setChatRenameTarget(null)} footer={<button type="button" onClick={applyRenameChat} disabled={!chatRenameValue.trim()} className="ml-auto rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-medium text-[var(--surface)] disabled:opacity-40">Save name</button>}><label className="block py-5 text-[11px] text-[var(--muted)]">Title<input value={chatRenameValue} onChange={(e) => setChatRenameValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyRenameChat(); }} maxLength={120} className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-[12px] text-[var(--ink)]" aria-label="Conversation title" /></label></Dialog>}
        {chatProjectTarget && <Dialog title="Add to project" description={`Organize "${chatProjectTarget.title}" under a project label.`} onClose={() => setChatProjectTarget(null)} footer={<><button type="button" onClick={() => { setChatProjectValue(""); patchChatItem(chatProjectTarget.id, { projectTag: undefined }); setChatProjectTarget(null); notify("Removed from project."); }} className="rounded-full border border-[var(--line)] px-4 py-2 text-[11px] text-[var(--ink-soft)]">Clear label</button><button type="button" onClick={applyProjectTag} className="rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-medium text-[var(--surface)]">Save</button></>}><label className="block py-5 text-[11px] text-[var(--muted)]">Project label<input value={chatProjectValue} onChange={(e) => setChatProjectValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") applyProjectTag(); }} placeholder="e.g. Portfolio, Android Store App" maxLength={60} className="mt-2 h-10 w-full rounded-xl border border-[var(--line)] bg-transparent px-3 text-[12px] text-[var(--ink)]" aria-label="Project label" /></label></Dialog>}
        {confirmState && (
          <Dialog
            title={confirmState.title}
            description={confirmState.description}
            onClose={() => setConfirmState(null)}
            footer={
              <>
                <button type="button" onClick={() => setConfirmState(null)} className="rounded-full border border-[var(--line)] px-4 py-2 text-[11px] text-[var(--ink-soft)]">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const action = confirmState.onConfirm;
                    setConfirmState(null);
                    action();
                  }}
                  className="rounded-full bg-[#bb3c37] px-5 py-2 text-[11px] font-medium text-white"
                >
                  {confirmState.confirmLabel}
                </button>
              </>
            }
          >
            <p className="py-4 text-[11px] leading-relaxed text-[var(--muted)]">{confirmState.description}</p>
          </Dialog>
        )}
        {checkoutLink && (
          <Dialog title="Complete Stripe Checkout" description="Open Stripe Checkout in a new tab to complete your subscription." onClose={() => setCheckoutLink(null)}>
            <div className="py-5">
              <a href={checkoutLink} target="_blank" rel="noopener noreferrer" onClick={() => setCheckoutLink(null)} className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--ink)] py-2.5 text-[12px] font-medium text-[var(--surface)]">
                Continue to Stripe Checkout
              </a>
            </div>
          </Dialog>
        )}

        {previewAI.permission && <Dialog title="Load local AI" description="The generated chat is asking to load the on-device code model." onClose={previewAI.decline} footer={<><button type="button" onClick={previewAI.decline} className="rounded-full border border-[var(--line)] px-4 py-2 text-[11px] text-[var(--ink-soft)]">Not now</button><button type="button" onClick={previewAI.approve} className="rounded-full bg-[var(--ink)] px-4 py-2 text-[11px] font-medium text-[var(--surface)]">Download and load</button></>}><div className="space-y-3 py-5 text-[11px] leading-relaxed text-[var(--muted)]"><p>This downloads about 1 GB of open model weights on first use. A WebGPU-compatible GPU and enough device memory are required.</p><p>SUJITH AI runs inference outside the isolated preview, then sends only the requested response back to the generated chat. No prompts go to a cloud model.</p><p>The chat remains disabled until the real model loads successfully. Model download and inference are not part of the project's interface checks.</p></div></Dialog>}

        <input ref={sourceInput} type="file" multiple className="hidden" accept="text/*,.html,.css,.js,.json,.md,.txt,.kt,.kts,.xml,.pdf,.docx,.tsx,.jsx,.py" onChange={attachFiles} aria-label="Choose source attachments" />
        <input ref={workspaceImportInput} type="file" multiple className="hidden" accept=".zip,text/*,.kt,.kts,.java,.dart,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx,.json,.properties,.gradle,.md" onChange={importProjectFiles} aria-label="Import project files or ZIP" />
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={attachFiles} aria-label="Take a photo with the camera" />
        <input ref={photosInput} type="file" multiple accept="image/*" className="hidden" onChange={attachFiles} aria-label="Choose photos from your gallery" />
        <input ref={filesInput} type="file" multiple className="hidden" onChange={attachFiles} aria-label="Choose any files" />
        <input ref={documentInput} type="file" multiple className="hidden" accept=".pdf,.docx,.txt,.md,.csv,.json,application/pdf,text/plain" onChange={attachFiles} aria-label="Choose a document" />
        <input ref={backupInput} type="file" className="hidden" accept="application/json,.json" onChange={restoreBackup} aria-label="Restore workspace backup" />
        {notice && <div role="status" className="animate-fade-up pointer-events-none absolute bottom-[82px] left-3 right-3 z-[100] flex items-start gap-2 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-3.5 py-3 text-[11px] leading-relaxed text-[var(--ink-soft)] shadow-[0_12px_38px_-14px_rgba(0,0,0,.28)]">{notice.error ? <AlertCircle size={14} className="mt-px shrink-0" /> : <Check size={14} className="mt-px shrink-0 text-[#2d9761]" />}<p className="min-w-0 flex-1">{notice.message}</p><button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message" className="pointer-events-auto mt-px shrink-0 text-[var(--muted)]"><X size={13} /></button></div>}
      </div>
    </div>
  );
}
