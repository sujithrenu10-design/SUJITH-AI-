import { useState } from "react";
import { AudioLines, BarChart3, ChevronRight, Crown, Download, Eye, EyeOff, Globe, HardDrive, Key, KeyRound, Laptop, Layers, Link2, LoaderCircle, Moon, ShieldCheck, Smartphone, Sun, Trash2, Upload, X } from "lucide-react";
import { checkNoTrackBackend, clearNoTrackApiKey, saveNoTrackApiKey, type ProviderAvailability } from "../lib/gatewayClient";
import { getVoiceLanguageLabel, getVoiceModelLabel } from "../lib/voiceCatalog";
import { Dialog } from "./Dialog";
import type { AppSettings } from "../lib/types";
import { cn } from "../utils/cn";

function Toggle({ title, description, enabled, onChange }: { title: string; description: string; enabled: boolean; onChange: () => void }) {
  return <div className="flex items-center gap-4 border-b border-[var(--line)] py-3.5 last:border-0"><div className="min-w-0 flex-1"><p className="text-[12px] font-medium text-[var(--ink)]">{title}</p><p className="mt-0.5 text-[10px] leading-relaxed text-[var(--muted)]">{description}</p></div><button type="button" role="switch" aria-checked={enabled} aria-label={title} onClick={onChange} className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors", enabled ? "bg-[var(--ink)]" : "bg-[var(--line)]")}><span className={cn("absolute top-[3px] h-4 w-4 rounded-full bg-[var(--surface)] shadow-sm transition-transform", enabled ? "left-[3px] translate-x-4" : "left-[3px]")} /></button></div>;
}

const sectionTitle = "mb-2 mt-6 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]";

export function AppSettingsDialog({ settings, onChange, onClose, busy, fileCount, storageBytes, onExport, onImport, onClear, onInstall, canInstall, onOpenModels, onOpenUsage, onOpenSubscriptions, onOpenVoiceSettings, onOpenApiKeyGenerator, availability, onRefreshStatus }: {
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
  busy: boolean;
  fileCount: number;
  storageBytes: number;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
  onInstall: () => void;
  canInstall: boolean;
  onOpenModels: () => void;
  onOpenUsage: () => void;
  onOpenSubscriptions: () => void;
  onOpenVoiceSettings: () => void;
  onOpenApiKeyGenerator?: () => void;
  availability: ProviderAvailability;
  onRefreshStatus: () => void;
}) {
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [notrackInfo, setNotrackInfo] = useState<string>("");
  const [notrackError, setNotrackError] = useState<string>("");
  const [savingKey, setSavingKey] = useState(false);
  const [checkingNotrack, setCheckingNotrack] = useState(false);
  const toggle = (key: "autoSave" | "interactionChecks" | "showActivity" | "enterToSend" | "reduceMotion" | "microphoneEnabled") => onChange({ ...settings, [key]: !settings[key] });

  const saveKey = async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setNotrackInfo("");
      setNotrackError("Enter your NoTrack.ai API key first.");
      return;
    }
    setSavingKey(true);
    setNotrackError("");
    setNotrackInfo("Verifying API key against https://api.notrack.ai/v1/models...");
    const result = await saveNoTrackApiKey(trimmed);
    setSavingKey(false);
    onRefreshStatus();
    if (result.ok) {
      setApiKeyInput("");
      const latencyLabel = typeof result.latencyMs === "number" ? ` · ${result.latencyMs}ms` : "";
      const modelsLabel = result.models.length ? ` · Models: ${result.models.join(", ")}` : "";
      setNotrackError("");
      setNotrackInfo(`NoTrack.ai key saved & verified${latencyLabel}${modelsLabel}`);
    } else {
      setNotrackInfo("");
      setNotrackError(result.error || "NoTrack.ai rejected this API key.");
    }
  };

  const removeSavedKey = async () => {
    setSavingKey(true);
    setNotrackError("");
    setNotrackInfo("");
    const result = await clearNoTrackApiKey();
    setSavingKey(false);
    onRefreshStatus();
    if (result.ok) {
      setNotrackInfo(result.configured ? "Removed Settings key. Active Server Secret remains in use." : "Removed NoTrack.ai API key.");
    } else {
      setNotrackError(result.error || "Could not remove saved key.");
    }
  };

  const verifyNoTrack = async () => {
    setCheckingNotrack(true);
    setNotrackError("");
    setNotrackInfo("Checking https://api.notrack.ai/v1/models...");
    const result = await checkNoTrackBackend();
    setCheckingNotrack(false);
    onRefreshStatus();
    if (!result.configured) {
      setNotrackInfo("");
      setNotrackError("NoTrack.ai API key is required. Paste your key above and click Save & Verify.");
      return;
    }
    if (result.ok) {
      const latencyLabel = typeof result.latencyMs === "number" ? ` · ${result.latencyMs}ms` : "";
      setNotrackError("");
      setNotrackInfo(`NoTrack.ai verified${latencyLabel}. Discovered models: ${result.models.join(", ")}`);
    } else {
      setNotrackInfo("");
      setNotrackError(result.error || "Could not verify NoTrack.ai backend.");
    }
  };

  const statusTone =
    availability.notrackStatus === "connected"
      ? "bg-[#e6f4ea] text-[#137333] dark:bg-[#183c28] dark:text-[#81c995]"
      : availability.notrackStatus === "error"
        ? "bg-[#fce8e6] text-[#bb3c37] dark:bg-[#3f1d1b] dark:text-[#f28b82]"
        : "bg-[#fef3c7] text-[#92400e] dark:bg-[#3a2f14] dark:text-[#fcd34d]";

  const statusLabel =
    availability.notrackStatus === "connected"
      ? "NOTRACK LIVE"
      : availability.notrackStatus === "error"
        ? "KEY ERROR"
        : "API KEY REQUIRED";

  const sourceLabel =
    availability.notrackSource === "settings"
      ? "Saved in Settings"
      : availability.notrackSource === "env"
        ? "Server Secret"
        : "";

  return (
    <Dialog title="Settings" description="Build behavior, appearance, NoTrack.ai API key, and your workspace." onClose={onClose} fullScreen>
      <p className={sectionTitle}>Appearance</p>
      <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">{(["light", "dark", "system"] as const).map((theme) => <button type="button" key={theme} onClick={() => onChange({ ...settings, theme })} aria-pressed={settings.theme === theme} className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] capitalize transition", settings.theme === theme ? "bg-[var(--surface)] font-medium text-[var(--ink)] shadow-sm" : "text-[var(--muted)]")}>{theme === "light" ? <Sun size={13} /> : theme === "dark" ? <Moon size={13} /> : <Laptop size={13} />}{theme}</button>)}</div>
      <Toggle title="Reduce motion" description="Keep transitions and build activity animations quiet." enabled={settings.reduceMotion} onChange={() => toggle("reduceMotion")} />

      <p className={sectionTitle}>Build &amp; editor</p>
      <div className="mb-3">
        <p className="mb-1.5 text-[12px] font-medium text-[var(--ink)]">Default build target</p>
        <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          {(["website", "android"] as const).map((target) => (
            <button
              type="button"
              key={target}
              onClick={() => onChange({ ...settings, buildTarget: target })}
              aria-pressed={settings.buildTarget === target}
              className={cn(
                "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] transition",
                settings.buildTarget === target ? "bg-[var(--surface)] font-medium text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
              )}
            >
              {target === "website" ? <Globe size={13} /> : <Smartphone size={13} />}
              {target === "website" ? "Website / React" : "Android App"}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
          Explicit prompts like "website" or "Android/Flutter" also auto-select the right stack automatically.
        </p>
      </div>
      <Toggle title="Auto-save projects" description="Store project source on this device. Off keeps new edits in this session only." enabled={settings.autoSave} onChange={() => toggle("autoSave")} />
      <Toggle title="Run interaction checks" description="Execute supported browser checks in an isolated frame before saving. Source checks always run." enabled={settings.interactionChecks} onChange={() => toggle("interactionChecks")} />
      <Toggle title="Show build activity" description="Expand the real operations, files, and checks inside replies." enabled={settings.showActivity} onChange={() => toggle("showActivity")} />
      <Toggle title="Enter to send" description="Send with Enter. Use Shift+Enter for a new line." enabled={settings.enterToSend} onChange={() => toggle("enterToSend")} />

      <p className={sectionTitle}>Voice assistant</p>
      <button
        type="button"
        onClick={onOpenVoiceSettings}
        className="mb-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] px-3.5 py-3 text-left transition hover:bg-[var(--surface-muted)]"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <AudioLines size={16} className="shrink-0 text-[#2563eb]" />
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-[var(--ink)]">Voice settings</p>
            <p className="truncate text-[10px] text-[var(--muted)]">
              {getVoiceModelLabel(settings.voiceModel)} · {settings.voiceName} · {getVoiceLanguageLabel(settings.voiceLanguage)}
            </p>
          </div>
        </div>
        <ChevronRight size={15} className="shrink-0 text-[var(--muted)]" />
      </button>
      <Toggle
        title="Microphone"
        description={
          settings.microphoneEnabled
            ? "Microphone is ON for Live Voice Assistant and speech dictation."
            : "Microphone is OFF. Voice input and mic capture are muted across SUJITH IDE."
        }
        enabled={settings.microphoneEnabled}
        onChange={() => toggle("microphoneEnabled")}
      />
      <label className="mt-2 flex items-center justify-between gap-3 text-[12px] text-[var(--ink)]">Dictation language<select value={settings.speechLanguage} onChange={(event) => onChange({ ...settings, speechLanguage: event.target.value })} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--ink-soft)]" aria-label="Dictation language"><option value="en-IN">English (India)</option><option value="ta-IN">Tamil</option><option value="hi-IN">Hindi</option><option value="te-IN">Telugu</option><option value="ml-IN">Malayalam</option><option value="kn-IN">Kannada</option></select></label><p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">Dictation uses your browser's speech service and may need internet and microphone permission.</p>

      <p className={sectionTitle}>NoTrack.ai API key</p>
      <div className="rounded-2xl border border-[var(--line)] p-3.5">
        <div className="flex items-center gap-2 text-[11.5px] font-medium text-[var(--ink)]">
          <Link2 size={14} className="shrink-0" />
          <span>NoTrack.ai Backend Engine</span>
          <span className={cn("ml-auto rounded-full px-2 py-0.5 font-mono text-[8.5px] font-semibold tracking-wide", statusTone)}>
            {statusLabel}
          </span>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
          {availability.notrackStatus === "connected"
            ? `All universal models route directly through api.notrack.ai/v1 using your verified key.${typeof availability.notrackLatencyMs === "number" ? ` Last ping: ${availability.notrackLatencyMs}ms.` : ""}`
            : availability.notrackStatus === "error"
              ? availability.notrackError || "Your NoTrack.ai API key returned an authentication error."
              : "Enter your NoTrack.ai API key below to power every model with live NoTrack.ai inference. No demo or fallback responses are used."}
        </p>

        {availability.notrackMaskedKey && (
          <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-2">
            <KeyRound size={12} className="shrink-0 text-[var(--muted)]" />
            <span className="truncate font-mono text-[10px] text-[var(--ink-soft)]">{availability.notrackMaskedKey}</span>
            {sourceLabel && <span className="ml-auto shrink-0 text-[9px] text-[var(--muted)]">{sourceLabel}</span>}
            {availability.notrackSource === "settings" && (
              <button
                type="button"
                onClick={() => { void removeSavedKey(); }}
                disabled={savingKey}
                aria-label="Remove saved NoTrack.ai API key"
                title="Remove saved key"
                className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[#bb3c37] hover:bg-[#fce8e6] dark:hover:bg-[#3f1d1b]"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-1.5">
          <div className="flex h-10 min-w-0 flex-1 items-center rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 focus-within:border-[var(--ink)]/40">
            <input
              type={showKey ? "text" : "password"}
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !savingKey) {
                  event.preventDefault();
                  void saveKey();
                }
              }}
              placeholder={availability.notrackConfigured ? "Enter new NoTrack.ai key to replace" : "Paste your NoTrack.ai API key"}
              aria-label="NoTrack.ai API key"
              autoComplete="off"
              spellCheck={false}
              className="placeholder-color min-w-0 flex-1 bg-transparent font-mono text-[11px] text-[var(--ink)] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowKey((prev) => !prev)}
              aria-label={showKey ? "Hide API key" : "Show API key"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted)] hover:text-[var(--ink)]"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { void saveKey(); }}
            disabled={savingKey || !apiKeyInput.trim()}
            className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[var(--ink)] px-3.5 text-[11px] font-medium text-[var(--surface)] disabled:opacity-50"
          >
            {savingKey && <LoaderCircle size={13} className="animate-spin" />}
            {savingKey ? "Verifying..." : "Save & Verify"}
          </button>
        </div>

        {availability.discoveredModels.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {availability.discoveredModels.slice(0, 6).map((id) => (
              <span key={id} className="rounded-md border border-[var(--line)] bg-[var(--surface-soft)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--ink-soft)]">
                {id}
              </span>
            ))}
          </div>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          {onOpenApiKeyGenerator && (
            <button
              type="button"
              onClick={onOpenApiKeyGenerator}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-50/70 px-3 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100/70 dark:bg-emerald-950/40 dark:text-emerald-300"
            >
              <Key size={13} />
              Generate Key
            </button>
          )}
          <button
            type="button"
            onClick={() => { void verifyNoTrack(); }}
            disabled={checkingNotrack || savingKey}
            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--line)] px-3 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] disabled:opacity-60"
          >
            {checkingNotrack && <LoaderCircle size={13} className="animate-spin" />}
            {checkingNotrack ? "Checking connection..." : "Verify live connection"}
          </button>
        </div>

        {notrackInfo && <p className="mt-2 text-[10px] font-medium text-[#137333] dark:text-[#81c995]">{notrackInfo}</p>}
        {notrackError && <p className="mt-2 text-[10px] font-medium text-[#bb3c37]" role="alert">{notrackError}</p>}
      </div>

      <p className={sectionTitle}>Model parameters</p>
      <div className="space-y-3 rounded-2xl border border-[var(--line)] p-3.5">
        <div>
          <div className="flex items-center justify-between text-[11px] text-[var(--ink)]">
            <label htmlFor="sujith-temp-range" className="font-medium">Temperature</label>
            <span className="font-mono text-[10px] text-[var(--muted)]">{settings.temperature.toFixed(1)}</span>
          </div>
          <input
            id="sujith-temp-range"
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={settings.temperature}
            onChange={(event) => onChange({ ...settings, temperature: Number(event.target.value) })}
            className="mt-1.5 h-1.5 w-full cursor-pointer accent-[var(--blue)]"
          />
          <p className="mt-1 text-[9.5px] text-[var(--muted)]">Lower is more deterministic for coding; higher is more creative.</p>
        </div>

        <label className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--ink)]">
          <span className="font-medium">Max tokens</span>
          <select
            value={settings.maxTokens}
            onChange={(event) => onChange({ ...settings, maxTokens: Number(event.target.value) })}
            className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 font-mono text-[11px] text-[var(--ink-soft)]"
            aria-label="Max tokens"
          >
            {[512, 1024, 2048, 4096, 8192, 16384, 32768].map((val) => (
              <option key={val} value={val}>{val.toLocaleString()}</option>
            ))}
          </select>
        </label>

        <div className="border-t border-[var(--line)] pt-3">
          <label htmlFor="sujith-system-prompt" className="block text-[11px] font-medium text-[var(--ink)]">
            Custom system prompt
          </label>
          <textarea
            id="sujith-system-prompt"
            rows={2}
            maxLength={4000}
            value={settings.systemPrompt}
            onChange={(event) => onChange({ ...settings, systemPrompt: event.target.value })}
            placeholder="Optional instructions appended to chat and build requests..."
            className="placeholder-color mt-1.5 w-full resize-y rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--ink)] outline-none focus:border-[var(--ink)]/40"
          />
        </div>
      </div>

      <p className={sectionTitle}>Models &amp; account</p>
      <button type="button" onClick={onOpenModels} className="settings-action"><Layers size={14} />Browse AI models (OpenAI · Gemini · Claude · NoTrack)</button>
      <button type="button" onClick={onOpenUsage} className="settings-action"><BarChart3 size={14} />Usage &amp; NoTrack telemetry</button>
      <button type="button" onClick={onOpenSubscriptions} className="settings-action"><Crown size={14} />Subscription plans</button>

      <p className={sectionTitle}>Workspace &amp; privacy</p>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] text-[var(--muted)]"><HardDrive size={12} />{fileCount} files · {(storageBytes / 1024).toFixed(1)} KB of project source</p>
      <button type="button" onClick={onExport} className="settings-action"><Download size={14} />Export workspace backup</button>
      <button type="button" onClick={onImport} disabled={busy} className="settings-action"><Upload size={14} />Restore a workspace backup</button>
      <button type="button" onClick={onClear} disabled={busy} className="settings-action text-[#bb3c37]"><Trash2 size={14} />Delete all workspace data</button>

      <div className="mb-2 mt-6 border-t border-[var(--line)] pt-4"><div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--ink)]"><ShieldCheck size={15} />SUJITH AI <span className="ml-auto text-[9px] font-normal text-[var(--muted)]">Version 2.0</span></div><p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">Browser never stores unmasked API keys. Your NoTrack.ai key is verified and saved strictly on the backend server. Android exports are native source projects, with Cloud APK builds via GitHub Actions.</p>{canInstall && <button type="button" onClick={onInstall} className="mt-3 rounded-full bg-[var(--ink)] px-4 py-2 text-[11px] font-medium text-[var(--surface)]">Install SUJITH AI web app</button>}</div>
    </Dialog>
  );
}
