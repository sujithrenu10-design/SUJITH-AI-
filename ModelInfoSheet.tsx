import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { Dialog } from "./Dialog";
import { CompanyLogo } from "./CompanyLogo";
import type { ModelSpec } from "../lib/modelCatalog";
import type { ProviderAvailability, UsageSummary } from "../lib/gatewayClient";

export function ModelInfoSheet({
  model,
  availability,
  usage,
  onSelect,
  onClose,
}: {
  model: ModelSpec;
  availability: ProviderAvailability;
  usage: UsageSummary;
  onSelect: () => void;
  onClose: () => void;
}) {
  const isVerifiedConnected = availability.notrackStatus === "connected";
  const modelUsage = model.officialModelId ? usage.perModel[model.officialModelId] : undefined;

  const isDirectNoTrack = Boolean(
    model.officialModelId && availability.discoveredModels.includes(model.officialModelId)
  );
  const availabilityLabel =
    availability.notrackStatus === "connected"
      ? isDirectNoTrack
        ? "NoTrack Live · Official api.notrack.ai/v1"
        : `Routed via NoTrack.ai (${availability.discoveredModels[0] || "notrack-uncensored"})`
      : availability.notrackStatus === "error"
        ? `NoTrack Key Error · ${availability.notrackError || "Verify your NoTrack.ai API key in Settings"}`
        : "API Key Required · Enter your NoTrack.ai API key in Settings";

  return (
    <Dialog
      title={model.name}
      description={`${model.companyName} · ${model.officialModelId ?? model.id}`}
      onClose={onClose}
      footer={
        <>
          <span className="text-[10px] text-[var(--muted)]">{model.statusNote}</span>
          <button
            type="button"
            onClick={() => {
              onSelect();
              onClose();
            }}
            className="rounded-full bg-[var(--ink)] px-5 py-2 text-[11px] font-medium text-[var(--surface)]"
          >
            Select model
          </button>
        </>
      }
    >
      <div className="space-y-4 py-4">
        <div className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]">
            <CompanyLogo company={model.company} size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-[var(--ink)]">{model.companyName}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{model.description}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2.5 text-[11px]">
          {isVerifiedConnected ? (
            <CheckCircle2 size={14} className="shrink-0 text-[#2d9761]" />
          ) : (
            <AlertCircle size={14} className="shrink-0 text-[var(--muted)]" />
          )}
          <span className="font-medium text-[var(--ink-soft)]">{availabilityLabel}</span>
        </div>

        <dl className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] text-[11px]">
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Official model ID</dt>
            <dd className="text-right font-mono text-[10.5px] text-[var(--ink)]">{model.officialModelId ?? model.id}</dd>
          </div>
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Input capabilities</dt>
            <dd className="text-right text-[var(--ink-soft)]">{model.inputs.join(", ")}</dd>
          </div>
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Output capabilities</dt>
            <dd className="text-right text-[var(--ink-soft)]">{model.outputs.join(", ")}</dd>
          </div>
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Context window</dt>
            <dd className="text-right text-[var(--ink-soft)]">{model.contextWindow}</dd>
          </div>
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Max output</dt>
            <dd className="text-right text-[var(--ink-soft)]">{model.maxOutput}</dd>
          </div>
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Subscription plans</dt>
            <dd className="text-right text-[var(--ink-soft)]">{model.eligiblePlans.join(", ")}</dd>
          </div>
          <div className="flex justify-between gap-4 px-3.5 py-2.5">
            <dt className="text-[var(--muted)]">Session / tracked usage</dt>
            <dd className="text-right tabular-nums text-[var(--ink-soft)]">
              {modelUsage
                ? `${modelUsage.requests} req · ${(modelUsage.inputTokens + modelUsage.outputTokens).toLocaleString()} tok`
                : "0 requests"}
            </dd>
          </div>
        </dl>

        <div>
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Supported capabilities</p>
          <div className="flex flex-wrap gap-1.5">
            {model.capabilities.map((cap) => (
              <span key={cap} className="rounded-full border border-[var(--line)] bg-[var(--surface-soft)] px-2.5 py-1 text-[10px] text-[var(--ink-soft)]">
                {cap}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--muted)]">
          <Info size={13} className="mt-0.5 shrink-0" />
          <span>Unlimited daily requests · {model.allowanceNote}</span>
        </div>
      </div>
    </Dialog>
  );
}
