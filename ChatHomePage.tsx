import { useEffect, useRef, useState, type RefObject } from "react";
import {
  AlertCircle,
  Bookmark,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Maximize2,
  Menu,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Square,
  User,
  Wrench,
  X,
} from "lucide-react";
import sujithMedallion from "../sujith-medallion.png";
import { AttachmentMenu } from "./AttachmentMenu";
import { BuildReply } from "./BuildReply";
import { CompanyLogo } from "./CompanyLogo";
import { LiveVoiceOrb, LiveVoiceWaveform } from "./LiveVoiceOrb";
import { InlineMessageEditor, UserMessageActions } from "./UserMessageEditor";
import { useVoiceAudioLevel, type VoicePhase } from "../hooks/useVoiceAudioLevel";
import type { ProviderAvailability } from "../lib/gatewayClient";
import type { ModelSpec } from "../lib/modelCatalog";
import type { Attachment, Chat, GeneratedMediaItem, MediaGenerationState } from "../lib/types";
import { cn } from "../utils/cn";

type SpeechController = {
  supported: boolean;
  listening: boolean;
  interim: string;
  error?: string | null;
  errorCode?: string | null;
  clearError?: () => void;
  toggle: () => void;
  start: () => void;
  stop: () => void;
};

export function ChatHomePage({
  chats,
  active,
  files: _files,
  draft,
  onDraftChange,
  attachments,
  onRemoveAttachment,
  selectedModel,
  availability,
  busy,
  speech,
  onOpenDrawer,
  onOpenSettings,
  onOpenUsageOrPlan,
  onOpenModels,
  onNewChat,
  onSelectChat,
  onToggleBookmark,
  onShareChat,
  onCopyChat,
  onSend,
  onResendMessage,
  onStop,
  voiceOpen = false,
  voicePhase = "off",
  voiceQuery = "",
  voiceSpokenText = "",
  voiceError = null,
  voiceSpeechPulse = 0,
  voiceName = "Sonna",
  microphoneEnabled = true,
  onEnableMicrophone,
  onOpenVoiceSettings,
  onStartLiveVoice,
  onToggleLiveVoiceMic,
  onCloseLiveVoice,
  onFileOpen: _onFileOpen,
  onCopyText,
  onAnimateImage: _onAnimateImage,
  onEditImage: _onEditImage,
  onVariationImage: _onVariationImage,
  editingImage: _editingImage,
  onClearEditingImage: _onClearEditingImage,
  selectedAspectRatio: _selectedAspectRatio = "1:1",
  onSelectAspectRatio: _onSelectAspectRatio,
  onRegenerateMedia: _onRegenerateMedia,
  onNotify: _onNotify,
  onCamera,
  onPhotos,
  onFiles,
  onDocument,
  endRef,
  enterToSend,
}: {
  chats: Chat[];
  active: Chat;
  files: { path: string }[];
  draft: string;
  onDraftChange: (value: string) => void;
  attachments: Attachment[];
  onRemoveAttachment: (id: string) => void;
  selectedModel: ModelSpec;
  availability: ProviderAvailability;
  busy: boolean;
  speech: SpeechController;
  onOpenDrawer: () => void;
  onOpenSettings: () => void;
  onOpenUsageOrPlan: () => void;
  onOpenModels: () => void;
  onNewChat: () => void;
  onSelectChat: (chat: Chat) => void;
  onToggleBookmark: () => void;
  onShareChat: () => void;
  onCopyChat: () => void;
  onSend: (override?: string) => void;
  onResendMessage?: (messageId: string, editedText: string) => void;
  onStop: () => void;
  voiceOpen?: boolean;
  voicePhase?: VoicePhase;
  voiceQuery?: string;
  voiceSpokenText?: string;
  voiceError?: string | null;
  voiceSpeechPulse?: number;
  voiceName?: string;
  microphoneEnabled?: boolean;
  onEnableMicrophone?: () => void;
  onOpenVoiceSettings?: () => void;
  onStartLiveVoice?: () => void;
  onToggleLiveVoiceMic?: () => void;
  onCloseLiveVoice?: () => void;
  onFileOpen: (path: string) => void;
  onCopyText: (text: string) => void;
  onAnimateImage?: (item: GeneratedMediaItem) => void;
  onEditImage?: (item: GeneratedMediaItem, instruction?: string) => void;
  onVariationImage?: (item: GeneratedMediaItem) => void;
  editingImage?: GeneratedMediaItem | null;
  onClearEditingImage?: () => void;
  selectedAspectRatio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4";
  onSelectAspectRatio?: (ratio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4") => void;
  onRegenerateMedia?: (mediaState: MediaGenerationState) => void;
  onNotify?: (message: string, error?: boolean) => void;
  onCamera: () => void;
  onPhotos: () => void;
  onFiles: () => void;
  onDocument: () => void;
  endRef: RefObject<HTMLDivElement | null>;
  enterToSend: boolean;
}) {
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [voiceExpanded, setVoiceExpanded] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setEditingMessageId(null);
  }, [active.id]);

  useEffect(() => {
    if (!voiceOpen) setVoiceExpanded(false);
  }, [voiceOpen]);

  const canSend = !busy && Boolean(draft.trim() || attachments.length);
  const activeIndex = Math.max(1, chats.findIndex((c) => c.id === active.id) + 1);

  const readyBadge = (() => {
    if (busy) {
      return {
        label: "LIVE",
        dotClass: "bg-[#2563eb]",
        pillClass:
          "border-[#93c5fd] bg-[#eff6ff] text-[#1d4ed8] dark:border-blue-500/40 dark:bg-blue-950/50 dark:text-blue-300",
      };
    }
    if (availability.notrackStatus === "connected") {
      return {
        label: "READY",
        dotClass: "bg-[#16a34a]",
        pillClass:
          "border-[#93e6b8] bg-[#e9f9f0] text-[#15803d] dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-300",
      };
    }
    if (availability.notrackStatus === "error") {
      return {
        label: "ERROR",
        dotClass: "bg-[#dc2626]",
        pillClass:
          "border-[#fca5a5] bg-[#fef2f2] text-[#b91c1c] dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-300",
      };
    }
    return {
      label: "KEY REQ",
      dotClass: "bg-[#d97706]",
      pillClass:
        "border-[#fcd34d] bg-[#fffbeb] text-[#b45309] dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-300",
    };
  })();

  const visibleMessages = searchQuery.trim()
    ? active.messages.filter((m) => m.content.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : active.messages;

  const effectivePhase: VoicePhase =
    voicePhase !== "off" ? voicePhase : speech.listening ? "listening" : "paused";

  const activeVoiceError = voiceError || speech.error || null;

  const { level: voiceAudioLevel, bands: voiceBands } = useVoiceAudioLevel({
    open: voiceOpen,
    phase: effectivePhase,
    interim: speech.interim,
    spokenText: voiceSpokenText,
    speechPulse: voiceSpeechPulse,
  });

  const handleVoiceToggle = () => {
    if (!microphoneEnabled) {
      onEnableMicrophone?.();
      return;
    }
    if (activeVoiceError) {
      speech.clearError?.();
      onStartLiveVoice?.();
      return;
    }
    if (voiceOpen) {
      onToggleLiveVoiceMic?.();
    } else {
      onStartLiveVoice?.();
    }
  };

  const voiceStatusLabel =
    effectivePhase === "processing"
      ? "THINKING"
      : effectivePhase === "speaking"
        ? "SPEAKING"
        : effectivePhase === "listening"
          ? "LISTENING"
          : "VOICE READY";

  const voiceStatusCode =
    effectivePhase === "processing"
      ? "PROCESSING"
      : effectivePhase === "speaking"
        ? "SPEAKING"
        : effectivePhase === "listening"
          ? "LISTENING..."
          : "VOICE READY";

  const voiceSubtitle = !microphoneEnabled
    ? "Microphone is off in Settings"
    : activeVoiceError
      ? "Microphone permission needed"
      : effectivePhase === "processing"
        ? voiceQuery || "Thinking about your request..."
        : effectivePhase === "speaking"
          ? voiceSpokenText || "Speaking response..."
          : effectivePhase === "listening"
            ? speech.interim || "Listening..."
            : speech.supported
              ? "Tap mic to start speaking..."
              : "Voice dictation unavailable in this browser";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-gradient-to-b from-[#f2f6fc] via-[#fbfdff] to-[#f1f6fd] text-[#151b26] dark:from-[#0e1420] dark:via-[#121826] dark:to-[#0d131f] dark:text-slate-100">
      {/* Row 1: Top Header */}
      <header className="flex h-[54px] shrink-0 items-center gap-2 px-3 pt-[max(8px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10"
        >
          <Menu size={21} strokeWidth={1.9} />
        </button>

        <div className="flex min-w-0 items-center gap-2">
          <img
            src={sujithMedallion}
            alt="SUJITH IDE"
            className="h-[30px] w-[30px] shrink-0 rounded-full object-cover shadow-xs"
          />
          <span className="truncate text-[16.5px] font-bold tracking-[-0.015em] text-[#141923] dark:text-white">
            SUJITH IDE
          </span>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings & NoTrack.ai Key"
            className="grid h-9 w-9 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <Wrench size={18} strokeWidth={1.85} />
          </button>
          <button
            type="button"
            onClick={onOpenUsageOrPlan}
            aria-label="Usage and plans"
            title="Usage & Subscriptions"
            className="grid h-9 w-9 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <User size={18} strokeWidth={1.85} />
          </button>
        </div>
      </header>

      {/* Row 2: Sub-Toolbar Pills & Actions */}
      <div className="relative z-20 flex shrink-0 items-center gap-1.5 border-b border-[#e5ebf3] px-3 py-2 dark:border-slate-800/80">
        <div className="relative flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setChatPickerOpen((v) => !v)}
            aria-expanded={chatPickerOpen}
            className="flex h-[34px] max-w-[110px] shrink-0 items-center gap-1.5 rounded-full border border-[#d6deea] bg-white px-2.5 text-[12.5px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100"
          >
            <MessageSquare size={14} className="shrink-0 text-[#2563eb] dark:text-blue-400" strokeWidth={2} />
            <span className="truncate">{active.title || `Chat #${activeIndex}`}</span>
          </button>

          {chatPickerOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-30 cursor-default"
                onClick={() => setChatPickerOpen(false)}
                aria-label="Close chat switcher"
              />
              <div className="animate-menu-in absolute left-0 top-[40px] z-40 w-[230px] rounded-2xl border border-[#d6deea] bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                <p className="px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                  Switch chat
                </p>
                <div className="max-h-[220px] space-y-0.5 overflow-y-auto">
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      type="button"
                      onClick={() => {
                        onSelectChat(chat);
                        setChatPickerOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[12px] transition",
                        chat.id === active.id
                          ? "bg-[#eef4ff] font-semibold text-[#1d4ed8] dark:bg-blue-950/60 dark:text-blue-300"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                      )}
                    >
                      <MessageSquare size={13} className="shrink-0 opacity-70" />
                      <span className="truncate">{chat.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            title="Check NoTrack.ai API connection"
            className={cn(
              "flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-bold tracking-[0.03em] transition",
              readyBadge.pillClass
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", readyBadge.dotClass)} />
            <span>{readyBadge.label}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={onNewChat}
            className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[#bfd6fe] bg-[#eef4ff] px-2.5 text-[12.5px] font-semibold text-[#2563eb] transition hover:bg-blue-100/70 disabled:opacity-50 dark:border-blue-500/40 dark:bg-blue-950/60 dark:text-blue-300"
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#2563eb] dark:bg-blue-400" />
            <span>New</span>
          </button>
        </div>

        <div className="ml-auto flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            aria-label="Search conversation"
            title="Search messages"
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10",
              searchOpen ? "text-[#2563eb]" : "text-[#7c8696] dark:text-slate-400"
            )}
          >
            <Search size={17} strokeWidth={1.85} />
          </button>
          <button
            type="button"
            onClick={onShareChat}
            disabled={!active.messages.length}
            aria-label="Share or export chat"
            title="Export conversation"
            className="grid h-8 w-8 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 disabled:opacity-35 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <Share2 size={17} strokeWidth={1.85} />
          </button>
          <button
            type="button"
            onClick={onCopyChat}
            disabled={!active.messages.length}
            aria-label="Copy conversation"
            title="Copy latest response"
            className="grid h-8 w-8 place-items-center rounded-full text-[#7c8696] transition hover:bg-black/5 disabled:opacity-35 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <Copy size={16.5} strokeWidth={1.85} />
          </button>
          <button
            type="button"
            onClick={onToggleBookmark}
            aria-label={active.bookmarked ? "Remove bookmark" : "Bookmark chat"}
            title={active.bookmarked ? "Bookmarked" : "Bookmark chat"}
            className={cn(
              "grid h-8 w-8 place-items-center rounded-full transition hover:bg-black/5 dark:hover:bg-white/10",
              active.bookmarked ? "text-[#2563eb] dark:text-blue-400" : "text-[#7c8696] dark:text-slate-400"
            )}
          >
            <Bookmark size={17} strokeWidth={1.85} fill={active.bookmarked ? "currentColor" : "none"} />
          </button>
        </div>
      </div>

      {/* Inline search bar */}
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#e5ebf3] bg-white/80 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-900/70">
          <Search size={14} className="shrink-0 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter messages in this chat..."
            aria-label="Filter messages"
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="text-[11px] font-medium text-[#2563eb]"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false);
              setSearchQuery("");
            }}
            aria-label="Close search"
            className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-200/60"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Center Content */}
      <main className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4" aria-label="Normal Chat conversation">
        {!active.messages.length ? (
          <div className="flex min-h-full flex-col items-center justify-center py-8">
            <h1 className="animate-fade-in max-w-[330px] text-balance text-center text-[25px] font-bold leading-[1.24] tracking-[-0.025em] text-[#151b26] dark:text-slate-100">
              How can I help you today?
            </h1>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {visibleMessages.map((message) =>
              message.role === "user" ? (
                <div key={message.id} className="flex flex-col items-end gap-1.5">
                  {message.attachments?.length ? (
                    <div className="flex max-w-[92%] flex-wrap justify-end gap-1.5">
                      {message.attachments.map((file) =>
                        file.dataUrl ? (
                          <img
                            key={file.id}
                            src={file.dataUrl}
                            alt={file.name}
                            className="h-24 w-24 rounded-xl border border-[var(--line)] object-cover"
                          />
                        ) : (
                          <span
                            key={file.id}
                            className="flex max-w-[190px] items-center gap-1 rounded-lg border border-[var(--line)] px-2 py-1.5 text-[10px] text-[var(--muted)]"
                          >
                            <FileText size={11} className="shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </span>
                        )
                      )}
                    </div>
                  ) : null}
                  {editingMessageId === message.id ? (
                    <InlineMessageEditor
                      initialValue={message.content}
                      enterToSend={enterToSend}
                      busy={busy}
                      hasAttachments={Boolean(message.attachments?.length)}
                      onCancel={() => setEditingMessageId(null)}
                      onSend={(editedText) => {
                        setEditingMessageId(null);
                        onResendMessage?.(message.id, editedText);
                      }}
                    />
                  ) : (
                    <>
                      <p className="max-w-[88%] whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-[24px] bg-[#eaf1fb] px-4 py-3 text-[15.5px] font-normal leading-[1.52] text-[#151b26] dark:bg-slate-800 dark:text-slate-100">
                        {message.content}
                      </p>
                      <UserMessageActions
                        content={message.content}
                        busy={busy}
                        onCopy={onCopyText}
                        onEdit={() => setEditingMessageId(message.id)}
                      />
                    </>
                  )}
                </div>
              ) : (
                <BuildReply
                  key={message.id}
                  message={message}
                  showActivity
                  isBusy={busy}
                  availableFiles={_files.map((f) => f.path)}
                  onFile={_onFileOpen}
                  onPreview={() => undefined}
                  onRetry={(prompt) => onSend(prompt)}
                  onStop={onStop}
                  onCopy={onCopyText}
                  onAnimateImage={_onAnimateImage}
                  onEditImage={_onEditImage}
                  onVariationImage={_onVariationImage}
                  onRegenerateMedia={_onRegenerateMedia}
                  onNotify={_onNotify}
                  hideAnalysis
                />
              )
            )}
            {searchQuery.trim() && !visibleMessages.length && (
              <p className="py-12 text-center text-[13px] text-slate-400">
                No messages match "{searchQuery}".
              </p>
            )}
          </div>
        )}
        <div ref={endRef} className="h-2" />
      </main>

      {/* Expanded ChatGPT Advanced Voice Mode Overlay */}
      {voiceOpen && voiceExpanded && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live Voice Assistant"
          aria-live="polite"
          className="animate-fade-in absolute inset-0 z-40 flex flex-col justify-between bg-gradient-to-b from-[#f7faff] via-[#ffffff] to-[#eef4fc] px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] text-[#151b26] dark:from-[#0b111e] dark:via-[#101829] dark:to-[#090e1a] dark:text-slate-100"
        >
          {/* Top bar */}
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#dce4f0] bg-white/90 px-3 py-1.5 shadow-[0_2px_10px_rgba(15,23,42,0.05)] backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/85">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full transition-colors",
                  effectivePhase === "processing"
                    ? "animate-pulse bg-[#9333ea]"
                    : effectivePhase === "speaking"
                      ? "animate-pulse bg-[#2563eb]"
                      : effectivePhase === "listening"
                        ? "animate-pulse bg-[#0ea5e9]"
                        : "bg-[#64748b]"
                )}
              />
              <span
                data-voice-state={voiceStatusCode}
                className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#334155] dark:text-slate-200"
              >
                {voiceStatusLabel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {onOpenVoiceSettings && (
                <button
                  type="button"
                  onClick={onOpenVoiceSettings}
                  aria-label={`Voice settings (${voiceName})`}
                  title={`Voice settings (${voiceName})`}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#dce4f0] bg-white/90 text-[#334155] shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <SlidersHorizontal size={17} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setVoiceExpanded(false)}
                aria-label="Minimize voice assistant"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#dce4f0] bg-white/90 text-[#334155] shadow-[0_2px_10px_rgba(15,23,42,0.06)] transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Minimize2 size={18} />
              </button>
            </div>
          </div>

          {/* Center Orb + Live Waveform Stage */}
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-2 text-center">
            <div className="relative flex items-center justify-center py-4">
              <div
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute h-56 w-56 rounded-full blur-2xl transition-all duration-300",
                  effectivePhase === "processing"
                    ? "bg-purple-400/25 dark:bg-purple-500/20"
                    : effectivePhase === "speaking"
                      ? "bg-blue-400/30 dark:bg-blue-500/25"
                      : effectivePhase === "listening"
                        ? "bg-sky-400/30 dark:bg-sky-500/25"
                        : "bg-slate-300/25 dark:bg-slate-700/20"
                )}
                style={{
                  transform: `scale(${1 + voiceAudioLevel * 0.25})`,
                }}
              />
              <button
                type="button"
                onClick={handleVoiceToggle}
                aria-label={
                  effectivePhase === "listening"
                    ? "Mute microphone"
                    : effectivePhase === "speaking" || effectivePhase === "processing"
                      ? "Interrupt assistant and speak"
                      : "Unmute microphone"
                }
                className="relative rounded-full transition-transform active:scale-95 focus-visible:outline-none"
              >
                <LiveVoiceOrb
                  phase={effectivePhase}
                  level={voiceAudioLevel}
                  size={172}
                  orbTextureSrc="/assets/aistudio/IMG_20261030_162513_5a36d74b.jpg"
                />
              </button>
            </div>

            <LiveVoiceWaveform phase={effectivePhase} level={voiceAudioLevel} className="mt-2" />

            <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.12em] text-[#2563eb] dark:text-blue-400">
              {voiceStatusLabel}
            </p>
            <p className="mt-2 line-clamp-3 max-w-[310px] text-[15px] font-medium leading-[1.45] text-[#334155] dark:text-slate-200">
              {voiceSubtitle}
            </p>

            {(activeVoiceError || !microphoneEnabled) && (
              <div className="mt-4 flex w-full max-w-[330px] items-center gap-2.5 rounded-2xl border border-red-200 bg-red-50/95 px-3.5 py-2.5 text-left text-[12.5px] text-red-700 shadow-xs dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-200">
                <AlertCircle size={16} className="shrink-0 text-red-500 dark:text-red-400" />
                <span className="min-w-0 flex-1 leading-snug">
                  {activeVoiceError || "Microphone is turned off in Settings."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!microphoneEnabled) {
                      onEnableMicrophone?.();
                    } else {
                      speech.clearError?.();
                      onStartLiveVoice?.();
                    }
                  }}
                  className="shrink-0 rounded-full bg-red-600 px-3 py-1 text-[11.5px] font-semibold text-white transition hover:bg-red-700 active:scale-95"
                >
                  {!microphoneEnabled ? "Turn on" : "Retry"}
                </button>
              </div>
            )}
          </div>

          {/* Bottom Controls Dock */}
          <div className="flex items-center justify-center gap-5 pt-2">
            <button
              type="button"
              onClick={handleVoiceToggle}
              aria-pressed={effectivePhase === "listening"}
              aria-label={
                effectivePhase === "listening"
                  ? "Mute microphone"
                  : effectivePhase === "speaking" || effectivePhase === "processing"
                    ? "Interrupt and listen"
                    : "Unmute microphone"
              }
              className={cn(
                "grid h-14 w-14 place-items-center rounded-full border shadow-[0_6px_18px_-4px_rgba(15,23,42,0.14)] transition active:scale-95",
                effectivePhase === "listening"
                  ? "border-[#93c5fd] bg-[#eff6ff] text-[#2563eb] dark:border-blue-500/60 dark:bg-blue-950/70 dark:text-blue-300"
                  : effectivePhase === "paused"
                    ? "border-[#d8e0ec] bg-white text-[#475569] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    : "border-[#93c5fd] bg-white text-[#2563eb] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
              )}
            >
              {effectivePhase === "paused" ? <MicOff size={22} /> : <Mic size={22} />}
            </button>

            <button
              type="button"
              onClick={() => setVoiceExpanded(false)}
              aria-label="Collapse to compact voice bar"
              className="grid h-12 w-12 place-items-center rounded-full border border-[#d8e0ec] bg-white text-[#334155] shadow-[0_6px_18px_-4px_rgba(15,23,42,0.12)] transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <Minimize2 size={18} />
            </button>

            <button
              type="button"
              onClick={() => {
                setVoiceExpanded(false);
                onCloseLiveVoice?.();
              }}
              aria-label="End live voice session"
              className="grid h-14 w-14 place-items-center rounded-full bg-[#ef4444] text-white shadow-[0_10px_24px_-4px_rgba(239,68,68,0.52)] transition hover:bg-[#dc2626] active:scale-95"
            >
              <Phone size={22} className="rotate-[135deg]" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Dock: Floating Live Voice Assistant Bar + Composer */}
      <div className="shrink-0 space-y-1.5 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-1">
        {voiceOpen && !voiceExpanded && (
          <div
            aria-live="polite"
            className={cn(
              "animate-fade-in border border-[#d8e0ec] bg-white/95 shadow-[0_6px_24px_-6px_rgba(15,23,42,0.15)] backdrop-blur-md transition-all dark:border-slate-700/80 dark:bg-slate-900/95",
              activeVoiceError ? "rounded-[24px] px-3 py-2.5" : "rounded-full px-2.5 py-2"
            )}
          >
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleVoiceToggle}
                aria-label={
                  effectivePhase === "listening"
                    ? "Mute microphone"
                    : effectivePhase === "speaking" || effectivePhase === "processing"
                      ? "Interrupt assistant and listen"
                      : "Unmute microphone"
                }
                className="relative h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full border border-[#d0d9e6] bg-white p-[1px] shadow-[0_2px_8px_rgba(37,99,235,0.18)] transition active:scale-95 dark:border-slate-700 dark:bg-slate-950"
              >
                <LiveVoiceOrb
                  phase={effectivePhase}
                  level={voiceAudioLevel}
                  size={30}
                  orbTextureSrc="/assets/aistudio/IMG_20261030_162513_5a36d74b.jpg"
                  className="block h-full w-full"
                />
              </button>

              <div className="min-w-0 flex-1 pl-0.5 pr-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full transition-colors",
                      effectivePhase === "processing"
                        ? "animate-pulse bg-[#9333ea]"
                        : effectivePhase === "speaking"
                          ? "animate-pulse bg-[#2563eb]"
                          : effectivePhase === "listening"
                            ? "animate-pulse bg-[#0ea5e9]"
                            : "bg-[#64748b]"
                    )}
                  />
                  <span
                    data-voice-state={voiceStatusCode}
                    className={cn(
                      "text-[11.5px] font-bold uppercase leading-none tracking-[0.045em]",
                      effectivePhase === "processing"
                        ? "text-[#9333ea] dark:text-fuchsia-400"
                        : effectivePhase === "speaking"
                          ? "text-[#111827] dark:text-slate-100"
                          : effectivePhase === "listening"
                            ? "text-[#1d4ed8] dark:text-blue-400"
                            : "text-[#475569] dark:text-slate-400"
                    )}
                  >
                    {voiceStatusLabel}
                  </span>

                  {(effectivePhase === "listening" ||
                    effectivePhase === "speaking" ||
                    effectivePhase === "processing") && (
                    <span className="inline-flex h-3.5 items-center gap-[2.5px]" aria-hidden="true">
                      {voiceBands.map((band, idx) => (
                        <span
                          key={idx}
                          className={cn(
                            "w-[2.5px] rounded-full transition-[height] duration-75",
                            effectivePhase === "processing"
                              ? "bg-[#9333ea]/80 dark:bg-fuchsia-400"
                              : effectivePhase === "speaking"
                                ? "bg-[#2563eb] dark:bg-blue-400"
                                : "bg-[#0ea5e9] dark:bg-sky-400"
                          )}
                          style={{
                            height: `${Math.max(4, Math.min(14, Math.round(4 + band * 10)))}px`,
                          }}
                        />
                      ))}
                    </span>
                  )}
                </div>

                <p className="mt-1 truncate text-[12.5px] font-normal leading-[1.3] text-[#334155] dark:text-slate-300">
                  {voiceSubtitle}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1.5 pr-0.5 sm:gap-2">
                <button
                  type="button"
                  onClick={handleVoiceToggle}
                  aria-pressed={effectivePhase === "listening"}
                  aria-label={
                    effectivePhase === "listening"
                      ? "Mute microphone"
                      : effectivePhase === "speaking" || effectivePhase === "processing"
                        ? "Interrupt and speak"
                        : "Activate microphone"
                  }
                  className={cn(
                    "grid h-[30px] w-[30px] place-items-center rounded-full border transition active:scale-95",
                    effectivePhase === "listening"
                      ? "border-[#93c5fd] bg-[#f0f6ff] text-[#2563eb] dark:border-blue-500/60 dark:bg-blue-950/70 dark:text-blue-300"
                      : effectivePhase === "paused"
                        ? "border-[#d6deea] bg-white text-[#64748b] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        : "border-[#d6deea] bg-white text-[#2563eb] hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-blue-400"
                  )}
                >
                  {effectivePhase === "paused" ? <MicOff size={14} /> : <Mic size={14} />}
                </button>
                {onOpenVoiceSettings && (
                  <button
                    type="button"
                    onClick={onOpenVoiceSettings}
                    aria-label={`Voice settings (${voiceName})`}
                    title={`Voice settings · ${voiceName}`}
                    className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[#d6deea] bg-white text-[#1e293b] transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <SlidersHorizontal size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setVoiceExpanded(true)}
                  aria-expanded={voiceExpanded}
                  aria-label="Expand voice assistant"
                  className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[#d6deea] bg-white text-[#1e293b] transition hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Maximize2 size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVoiceExpanded(false);
                    onCloseLiveVoice?.();
                  }}
                  aria-label="End voice call"
                  className="grid h-[30px] w-[30px] place-items-center rounded-full border border-[#f5b7b1] bg-[#fff5f5] text-[#dc2626] transition hover:bg-red-100 active:scale-95 dark:border-red-500/40 dark:bg-red-950/60 dark:text-red-400"
                >
                  <Phone size={13} className="rotate-[135deg]" />
                </button>
              </div>
            </div>

            {(activeVoiceError || !microphoneEnabled) && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl border border-red-200/90 bg-red-50/90 px-2.5 py-1.5 text-[11.5px] text-red-700 dark:border-red-500/40 dark:bg-red-950/50 dark:text-red-200">
                <AlertCircle size={14} className="shrink-0 text-red-500 dark:text-red-400" />
                <span className="min-w-0 flex-1 leading-snug">
                  {activeVoiceError || "Microphone is turned off in Settings."}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!microphoneEnabled) {
                      onEnableMicrophone?.();
                    } else {
                      speech.clearError?.();
                      onStartLiveVoice?.();
                    }
                  }}
                  className="shrink-0 rounded-full bg-red-600 px-2.5 py-0.5 text-[11px] font-semibold text-white transition hover:bg-red-700 active:scale-95"
                >
                  {!microphoneEnabled ? "Turn on" : "Retry"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Bottom Composer Card */}
        <div className="message-composer rounded-[26px] border border-[#d8e1ee] bg-white px-3 pb-2.5 pt-2.5 shadow-[0_8px_26px_-10px_rgba(30,64,175,0.14)] dark:border-slate-700/80 dark:bg-[#1a2232]">
          {attachments.length > 0 && (
            <div className="no-scrollbar mb-2 flex gap-1.5 overflow-x-auto">
              {attachments.map((file) => (
                <span
                  key={file.id}
                  className="flex max-w-[190px] shrink-0 items-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-2 py-1.5 text-[10px] text-[var(--ink-soft)]"
                >
                  {file.dataUrl ? (
                    <img src={file.dataUrl} alt="" className="h-5 w-5 shrink-0 rounded object-cover" />
                  ) : (
                    <FileText size={11} className="shrink-0" />
                  )}
                  <span className="truncate">{file.name}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(file.id)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
              <div className="flex items-start gap-2.5">
                <div className="relative mt-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setAttachMenuOpen((open) => !open)}
                    aria-label="Add an attachment"
                    aria-expanded={attachMenuOpen}
                    aria-haspopup="menu"
                    className="grid h-9 w-9 place-items-center rounded-full bg-[#eef4ff] text-[#2563eb] transition hover:bg-blue-100 dark:bg-blue-950/70 dark:text-blue-300"
                  >
                    <Plus size={20} strokeWidth={2} />
                  </button>
                  <AttachmentMenu
                    open={attachMenuOpen}
                    onClose={() => setAttachMenuOpen(false)}
                    onCamera={onCamera}
                    onPhotos={onPhotos}
                    onFiles={onFiles}
                    onDocument={onDocument}
                  />
                </div>

                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  rows={2}
                  maxLength={16000}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      enterToSend &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      void onSend();
                    }
                  }}
                  placeholder={speech.listening ? "Listening..." : "Ask anything, create images or videos..."}
                  aria-label="Message SUJITH IDE"
                  className="thin-scrollbar block max-h-[120px] min-h-[46px] flex-1 resize-none border-0 bg-transparent pt-1 text-[15px] leading-[1.35] text-[#151b26] outline-none placeholder:text-[#64748b] dark:text-slate-100 dark:placeholder:text-slate-400"
                />
              </div>

              <div className="flex items-center">
                <button
                  type="button"
                  onClick={onOpenModels}
                  aria-label={`Selected model: ${selectedModel.name}. Open model selector`}
                  className="flex h-[36px] max-w-[235px] items-center gap-1.5 rounded-full border border-[#d6deea] bg-white px-3 text-[13px] font-semibold text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100"
                >
                  <CompanyLogo company={selectedModel.company} size={15} />
                  <span className="truncate">{selectedModel.name}</span>
                  <ChevronDown size={14} className="shrink-0 text-[#64748b] dark:text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  if (voiceOpen) onToggleLiveVoiceMic?.();
                  else onStartLiveVoice?.();
                }}
                aria-pressed={voiceOpen}
                aria-label={voiceOpen ? "Stop live voice assistant" : "Start live voice assistant"}
                className={cn(
                  "grid h-[44px] w-[44px] place-items-center rounded-full shadow-sm transition active:scale-95",
                  voiceOpen
                    ? "bg-[#dc2626] text-white"
                    : microphoneEnabled
                      ? "bg-[#1a73e8] text-white hover:bg-[#155ec2]"
                      : "bg-[#94a3b8] text-white hover:bg-[#64748b]"
                )}
              >
                {voiceOpen || !microphoneEnabled ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <button
                type="button"
                onClick={() => (busy ? onStop() : onSend())}
                disabled={!busy && !canSend}
                aria-label={busy ? "Stop generation" : "Send message"}
                className={cn(
                  "grid h-[34px] w-[34px] place-items-center rounded-full transition active:scale-95",
                  busy
                    ? "bg-[#111827] text-white dark:bg-white dark:text-slate-900"
                    : canSend
                      ? "bg-[#1a73e8] text-white hover:bg-[#155ec2]"
                      : "bg-[#eef2f6] text-[#7c8696] dark:bg-slate-800 dark:text-slate-500"
                )}
              >
                {busy ? <Square size={12} fill="currentColor" /> : <ChevronRight size={18} strokeWidth={2.2} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
