import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
  Volume2,
} from "lucide-react";
import { makeId, type AppSettings } from "../lib/types";
import {
  VOICE_GROUPS,
  VOICE_LANGUAGE_OPTIONS,
  VOICE_MODEL_OPTIONS,
  getVoiceLanguageLabel,
  getVoiceModelLabel,
  previewVoicePreset,
  type DictationHistoryItem,
  type VoiceModelMode,
  type VoicePreset,
} from "../lib/voiceCatalog";
import { cn } from "../utils/cn";

type VoiceSettingsView = "main" | "voices" | "dictionary" | "history";

function PillSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative h-[28px] w-[48px] shrink-0 rounded-full transition-colors duration-200",
        checked
          ? "bg-[#111827] dark:bg-white"
          : "bg-[#d5dae2] dark:bg-slate-700"
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-transform duration-200 dark:bg-slate-900",
          checked ? "left-[3px] translate-x-[20px]" : "left-[3px] translate-x-0"
        )}
      />
    </button>
  );
}

export function VoiceSettingsModal({
  open,
  settings,
  onChange,
  dictationHistory,
  onDeleteHistoryItem,
  onClearHistory,
  onCopyText,
  onClose,
}: {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  dictationHistory: DictationHistoryItem[];
  onDeleteHistoryItem: (id: string) => void;
  onClearHistory: () => void;
  onCopyText: (text: string) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<VoiceSettingsView>("main");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  const [backgroundInfoOpen, setBackgroundInfoOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [dictTerm, setDictTerm] = useState("");
  const [dictSpoken, setDictSpoken] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const wasOpenRef = useRef(open);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        setView("main");
        setModelPickerOpen(false);
        setLangPickerOpen(false);
        setPreviewingId(null);
      }
      return;
    }
    wasOpenRef.current = true;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (view !== "main") {
        setView("main");
      } else {
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, view]);

  if (!open) return null;

  const headerTitle =
    view === "voices"
      ? "Choose a voice"
      : view === "dictionary"
        ? "Dictionary"
        : view === "history"
          ? "Dictation history"
          : "Voice";

  const handleBack = () => {
    if (view !== "main") {
      setView("main");
      return;
    }
    onClose();
  };

  const handleSelectModel = (model: VoiceModelMode) => {
    onChange({ ...settings, voiceModel: model });
    setModelPickerOpen(false);
  };

  const handleSelectLanguage = (value: string) => {
    const nextSpeechLang =
      value === "auto" ? settings.speechLanguage : value;
    onChange({
      ...settings,
      voiceLanguage: value,
      speechLanguage: nextSpeechLang,
    });
    setLangPickerOpen(false);
  };

  const handleSelectVoice = (preset: VoicePreset) => {
    onChange({ ...settings, voiceName: preset.name });
    setPreviewingId(preset.id);
    previewVoicePreset(preset, settings.voiceModel);
    window.setTimeout(() => {
      setPreviewingId((prev) => (prev === preset.id ? null : prev));
    }, 2400);
  };

  const handleAddDictionaryEntry = (termOverride?: string, spokenOverride?: string) => {
    const term = (termOverride ?? dictTerm).trim();
    const spokenAs = (spokenOverride ?? dictSpoken).trim() || term;
    if (!term) return;
    if (settings.voiceDictionary.some((e) => e.term.toLowerCase() === term.toLowerCase())) {
      setDictTerm("");
      setDictSpoken("");
      return;
    }
    onChange({
      ...settings,
      voiceDictionary: [
        { id: makeId("dict"), term, spokenAs, createdAt: Date.now() },
        ...settings.voiceDictionary,
      ],
    });
    if (!termOverride) {
      setDictTerm("");
      setDictSpoken("");
    }
  };

  const handleRemoveDictionaryEntry = (id: string) => {
    onChange({
      ...settings,
      voiceDictionary: settings.voiceDictionary.filter((e) => e.id !== id),
    });
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
      className="animate-fade-in absolute inset-0 z-[90] flex flex-col bg-[#f5f6f8] text-[#111827] dark:bg-[#0b111e] dark:text-slate-100"
    >
      {/* Top Header */}
      <header className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[max(14px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={handleBack}
          aria-label={view === "main" ? "Back to chat" : "Back to Voice settings"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e3e7ee] bg-white text-[#111827] shadow-[0_1px_4px_rgba(15,23,42,0.06)] transition hover:bg-slate-50 active:scale-95 dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft size={19} strokeWidth={2} />
        </button>

        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-[#111827] dark:text-white">
          {headerTitle}
        </h2>

        {view === "history" && dictationHistory.length > 0 ? (
          <button
            type="button"
            onClick={onClearHistory}
            className="h-9 rounded-full px-3 text-[13px] font-medium text-[#dc2626] transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            Clear
          </button>
        ) : (
          <span className="h-10 w-10 shrink-0" aria-hidden="true" />
        )}
      </header>

      {/* Scrollable Body */}
      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-2">
        {view === "main" && (
          <div className="space-y-5">
            {/* Card 1: Model */}
            <div className="overflow-hidden rounded-[24px] border border-[#e6e9ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
              <button
                type="button"
                onClick={() => {
                  setModelPickerOpen((v) => !v);
                  setLangPickerOpen(false);
                }}
                aria-expanded={modelPickerOpen}
                className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
              >
                <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                  Model
                </span>
                <span className="flex items-center gap-1.5 text-[15px] text-[#6b7280] dark:text-slate-400">
                  <span>{getVoiceModelLabel(settings.voiceModel)}</span>
                  <ChevronDown
                    size={16}
                    className={cn("transition-transform", modelPickerOpen && "rotate-180")}
                  />
                </span>
              </button>

              {modelPickerOpen && (
                <div className="divide-y divide-[#eef1f5] border-t border-[#eef1f5] bg-[#fafbfc] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/50">
                  {VOICE_MODEL_OPTIONS.map((opt) => {
                    const selected = settings.voiceModel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectModel(opt.id)}
                        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <p className="text-[14.5px] font-medium text-[#111827] dark:text-slate-100">
                            {opt.label}
                          </p>
                          <p className="text-[12px] text-[#6b7280] dark:text-slate-400">
                            {opt.description}
                          </p>
                        </div>
                        {selected && <Check size={17} className="shrink-0 text-[#111827] dark:text-white" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card 2: Voice / Language / Dictionary / Dictation history */}
            <div className="overflow-hidden rounded-[24px] border border-[#e6e9ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
              <div className="divide-y divide-[#eef1f5] dark:divide-slate-800">
                <button
                  type="button"
                  onClick={() => setView("voices")}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                    Voice
                  </span>
                  <span className="flex items-center gap-1.5 text-[15px] text-[#6b7280] dark:text-slate-400">
                    <span>{settings.voiceName}</span>
                    <ChevronRight size={16} />
                  </span>
                </button>

                <div>
                  <button
                    type="button"
                    onClick={() => {
                      setLangPickerOpen((v) => !v);
                      setModelPickerOpen(false);
                    }}
                    aria-expanded={langPickerOpen}
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                      Language
                    </span>
                    <span className="flex items-center gap-1.5 text-[15px] text-[#6b7280] dark:text-slate-400">
                      <span>{getVoiceLanguageLabel(settings.voiceLanguage)}</span>
                      <ChevronDown
                        size={16}
                        className={cn("transition-transform", langPickerOpen && "rotate-180")}
                      />
                    </span>
                  </button>

                  {langPickerOpen && (
                    <div className="thin-scrollbar max-h-[240px] divide-y divide-[#eef1f5] overflow-y-auto border-t border-[#eef1f5] bg-[#fafbfc] dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900/50">
                      {VOICE_LANGUAGE_OPTIONS.map((opt) => {
                        const selected = settings.voiceLanguage === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => handleSelectLanguage(opt.value)}
                            className="flex w-full items-center justify-between px-5 py-2.5 text-left text-[14px] transition hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                          >
                            <span
                              className={cn(
                                selected
                                  ? "font-medium text-[#111827] dark:text-white"
                                  : "text-[#374151] dark:text-slate-300"
                              )}
                            >
                              {opt.label}
                            </span>
                            {selected && <Check size={16} className="text-[#111827] dark:text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setView("dictionary")}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                    Dictionary
                  </span>
                  <span className="flex items-center gap-1.5 text-[14.5px] text-[#6b7280] dark:text-slate-400">
                    {settings.voiceDictionary.length > 0 && (
                      <span>{settings.voiceDictionary.length}</span>
                    )}
                    <ChevronRight size={16} />
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setView("history")}
                  className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                >
                  <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                    Dictation history
                  </span>
                  <span className="flex items-center gap-1.5 text-[14.5px] text-[#6b7280] dark:text-slate-400">
                    {dictationHistory.length > 0 && <span>{dictationHistory.length}</span>}
                    <ChevronRight size={16} />
                  </span>
                </button>
              </div>
            </div>

            {/* Card 3: Microphone On/Off */}
            <div>
              <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[#e6e9ef] bg-white px-5 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
                <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                  Microphone
                </span>
                <PillSwitch
                  checked={settings.microphoneEnabled}
                  label="Microphone"
                  onToggle={() =>
                    onChange({ ...settings, microphoneEnabled: !settings.microphoneEnabled })
                  }
                />
              </div>
              <p className="mt-2 px-3 text-[13px] leading-[1.45] text-[#6b7280] dark:text-slate-400">
                {settings.microphoneEnabled
                  ? "Allow SUJITH IDE to listen when Live Voice or dictation is started."
                  : "Microphone is turned off. Turn on to speak with Live Voice Assistant."}
              </p>
            </div>

            {/* Card 4: Background conversations */}
            <div>
              <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[#e6e9ef] bg-white px-5 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
                <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                  Background conversations
                </span>
                <PillSwitch
                  checked={settings.voiceBackground}
                  label="Background conversations"
                  onToggle={() =>
                    onChange({ ...settings, voiceBackground: !settings.voiceBackground })
                  }
                />
              </div>
              <p className="mt-2 px-3 text-[13px] leading-[1.45] text-[#6b7280] dark:text-slate-400">
                Keep the conversation going in other tabs or while your screen is off.{" "}
                <button
                  type="button"
                  onClick={() => setBackgroundInfoOpen((v) => !v)}
                  className="underline decoration-[#9ca3af] underline-offset-2 hover:text-[#111827] dark:hover:text-slate-200"
                >
                  Learn more
                </button>
              </p>
              {backgroundInfoOpen && (
                <p className="mt-2 rounded-2xl border border-[#e6e9ef] bg-white/80 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#4b5563] dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                  When enabled, SUJITH IDE keeps the live voice loop active across tab switches and requests a screen wake lock where supported by your browser.
                </p>
              )}
            </div>

            {/* Card 4: Use as default assistant */}
            <div>
              <div className="flex items-center justify-between gap-4 rounded-[24px] border border-[#e6e9ef] bg-white px-5 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
                <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                  Use as default assistant
                </span>
                <div className="flex items-center gap-2.5">
                  <PillSwitch
                    checked={settings.voiceDefaultAssistant}
                    label="Use as default assistant"
                    onToggle={() =>
                      onChange({
                        ...settings,
                        voiceDefaultAssistant: !settings.voiceDefaultAssistant,
                      })
                    }
                  />
                  <ChevronRight size={16} className="text-[#9ca3af]" />
                </div>
              </div>
              <p className="mt-2 px-3 text-[13px] leading-[1.45] text-[#6b7280] dark:text-slate-400">
                Enable quick voice launch and hands-free auto-resume in SUJITH IDE.
              </p>
            </div>
          </div>
        )}

        {view === "voices" && (
          <div className="space-y-6">
            {VOICE_GROUPS.map((group) => (
              <section key={group.group}>
                <h3 className="mb-2 px-3 text-[14px] font-medium text-[#7c8491] dark:text-slate-400">
                  {group.group}
                </h3>
                <div className="divide-y divide-[#eef1f5] overflow-hidden rounded-[24px] border border-[#e6e9ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:divide-slate-800 dark:border-slate-800 dark:bg-[#131c2e]">
                  {group.voices.map((voice) => {
                    const selected = settings.voiceName === voice.name;
                    const previewing = previewingId === voice.id;
                    return (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => handleSelectVoice(voice)}
                        className="flex w-full items-center justify-between px-5 py-3.5 text-left transition hover:bg-slate-50/80 active:bg-slate-100/70 dark:hover:bg-slate-800/40"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-[15.5px] font-normal text-[#111827] dark:text-slate-100">
                            {voice.name}
                          </span>
                          {previewing && (
                            <Volume2
                              size={14}
                              className="animate-pulse text-[#2563eb] dark:text-blue-400"
                            />
                          )}
                        </div>
                        {selected && (
                          <Check size={18} strokeWidth={2} className="text-[#4b5563] dark:text-slate-200" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {view === "dictionary" && (
          <div className="space-y-4">
            <div className="rounded-[24px] border border-[#e6e9ef] bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
              <p className="text-[13px] text-[#6b7280] dark:text-slate-400">
                Add custom words, technical names, or pronunciations so voice responses read them the way you prefer.
              </p>
              <div className="mt-3 space-y-2.5">
                <input
                  value={dictTerm}
                  onChange={(e) => setDictTerm(e.target.value)}
                  placeholder="Word or phrase (e.g. SUJITH IDE)"
                  aria-label="Dictionary word or phrase"
                  className="w-full rounded-2xl border border-[#e2e6ee] bg-[#f8f9fb] px-3.5 py-2.5 text-[14px] text-[#111827] outline-none focus:border-[#111827]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <input
                    value={dictSpoken}
                    onChange={(e) => setDictSpoken(e.target.value)}
                    placeholder="Pronounce as (optional)"
                    aria-label="Pronunciation replacement"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddDictionaryEntry();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-2xl border border-[#e2e6ee] bg-[#f8f9fb] px-3.5 py-2.5 text-[14px] text-[#111827] outline-none focus:border-[#111827]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddDictionaryEntry()}
                    disabled={!dictTerm.trim()}
                    className="inline-flex shrink-0 items-center gap-1 rounded-2xl bg-[#111827] px-4 py-2.5 text-[13.5px] font-medium text-white transition disabled:opacity-40 dark:bg-white dark:text-slate-900"
                  >
                    <Plus size={15} />
                    Add
                  </button>
                </div>
              </div>
              {settings.voiceDictionary.length === 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[
                    { term: "SUJITH IDE", spokenAs: "Sujith I D E" },
                    { term: "NoTrack", spokenAs: "No Track" },
                  ].map((preset) => (
                    <button
                      key={preset.term}
                      type="button"
                      onClick={() => handleAddDictionaryEntry(preset.term, preset.spokenAs)}
                      className="rounded-full border border-[#e2e6ee] bg-[#f8f9fb] px-2.5 py-1 text-[11.5px] text-[#4b5563] transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      + {preset.term}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {settings.voiceDictionary.length > 0 && (
              <div className="divide-y divide-[#eef1f5] overflow-hidden rounded-[24px] border border-[#e6e9ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:divide-slate-800 dark:border-slate-800 dark:bg-[#131c2e]">
                {settings.voiceDictionary.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 px-5 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-medium text-[#111827] dark:text-slate-100">
                        {entry.term}
                      </p>
                      {entry.spokenAs && entry.spokenAs !== entry.term && (
                        <p className="truncate text-[12px] text-[#6b7280] dark:text-slate-400">
                          Spoken as: {entry.spokenAs}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDictionaryEntry(entry.id)}
                      aria-label={`Delete ${entry.term}`}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#9ca3af] transition hover:bg-red-50 hover:text-[#dc2626] dark:hover:bg-red-950/50 dark:hover:text-red-400"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {view === "history" && (
          <div>
            {dictationHistory.length === 0 ? (
              <div className="rounded-[24px] border border-[#e6e9ef] bg-white px-5 py-10 text-center shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:border-slate-800 dark:bg-[#131c2e]">
                <p className="text-[15px] font-medium text-[#111827] dark:text-slate-100">
                  No dictation history yet
                </p>
                <p className="mt-1.5 text-[13px] text-[#6b7280] dark:text-slate-400">
                  Your voice transcriptions from Live Voice Assistant and dictation will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#eef1f5] overflow-hidden rounded-[24px] border border-[#e6e9ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.03)] dark:divide-slate-800 dark:border-slate-800 dark:bg-[#131c2e]">
                {dictationHistory.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-[14.5px] leading-snug text-[#111827] dark:text-slate-100">
                        {item.text}
                      </p>
                      <p className="mt-1 text-[11.5px] text-[#6b7280] dark:text-slate-400">
                        {getVoiceLanguageLabel(item.lang)} ·{" "}
                        {new Date(item.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onCopyText(item.text)}
                        aria-label="Copy transcript"
                        className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteHistoryItem(item.id)}
                        aria-label="Delete transcript"
                        className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] transition hover:bg-red-50 hover:text-[#dc2626] dark:hover:bg-red-950/50 dark:hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
