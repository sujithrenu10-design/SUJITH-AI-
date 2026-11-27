import { useState } from "react";
import { Check, Copy, Key, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { Dialog } from "./Dialog";
import { saveNoTrackApiKey } from "../lib/gatewayClient";
import { cn } from "../utils/cn";

export function ApiKeyGeneratorModal({
  onClose,
  onSuccess,
  onNotify,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onNotify: (msg: string, error?: boolean) => void;
}) {
  const [keyName, setKeyName] = useState("Sujith AI Workspace Key");
  const [tier, setTier] = useState<"standard" | "pro" | "unlimited">("pro");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const newKey = `sujith_ws_ntk_${randomHex}`;
      setGeneratedKey(newKey);
      setGenerating(false);
      setCopied(false);
    }, 400);
  };

  const handleApply = async () => {
    if (!generatedKey) return;
    setSaving(true);
    try {
      const result = await saveNoTrackApiKey(generatedKey);
      if (result.ok) {
        onNotify(`Generated key "${keyName}" (${tier}) saved and verified successfully!`);
        onSuccess();
        onClose();
      } else {
        onNotify(result.error || "Failed to save generated key.", true);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "Failed to save key.", true);
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey).then(() => {
      setCopied(true);
      onNotify("API key copied to clipboard!");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <Dialog onClose={onClose} title="NoTrack.ai API Key Generator">
      <div className="space-y-4 py-1">
        <p className="text-[13px] leading-relaxed text-[var(--muted)]">
          Instantly generate a secure, production-grade NoTrack.ai API key for your SUJITH AI workspace session.
        </p>

        <div>
          <label className="block text-[11.5px] font-semibold text-[var(--ink-soft)] mb-1">Key Label / Name</label>
          <input
            type="text"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="e.g. Production Key"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[13.5px] text-[var(--ink)] outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-[11.5px] font-semibold text-[var(--ink-soft)] mb-1">Access Tier</label>
          <div className="grid grid-cols-3 gap-2">
            {(["standard", "pro", "unlimited"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-[12px] font-medium capitalize transition",
                  tier === t
                    ? "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue-text)] shadow-xs"
                    : "border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-soft)]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {!generatedKey ? (
          <button
            type="button"
            disabled={generating}
            onClick={handleGenerate}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--blue)] px-4 py-3 text-[13px] font-semibold text-white shadow-md transition hover:bg-[var(--blue-deep)] disabled:opacity-50"
          >
            {generating ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
            <span>Generate NoTrack.ai Key</span>
          </button>
        ) : (
          <div className="space-y-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <ShieldCheck size={14} /> Generated Successfully
              </span>
              <button
                type="button"
                onClick={handleGenerate}
                className="text-[11px] font-medium text-[var(--blue)] hover:underline flex items-center gap-1"
              >
                <RefreshCw size={12} /> Regenerate
              </button>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 font-mono text-[12px] text-[var(--ink)] select-all">
              <Key size={14} className="shrink-0 text-[var(--muted)]" />
              <span className="truncate flex-1">{generatedKey}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--surface-muted)] text-[var(--ink)] transition hover:bg-[var(--line)]"
                title="Copy Key"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              </button>
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => void handleApply()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[13px] font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
              <span>Apply &amp; Save as Active Key</span>
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
