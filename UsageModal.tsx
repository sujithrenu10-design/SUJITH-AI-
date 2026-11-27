import { Activity, Clock, RefreshCw } from "lucide-react";
import { Dialog } from "./Dialog";
import { CompanyLogo } from "./CompanyLogo";
import type { ProviderAvailability, SubscriptionState, UsageSummary } from "../lib/gatewayClient";
import { formatResetCountdown, readLocalUsage } from "../lib/localUsage";

export function UsageModal({
  usage,
  availability,
  subscription,
  onRefresh,
  onClose,
}: {
  usage: UsageSummary;
  availability: ProviderAvailability;
  subscription: SubscriptionState;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const local = readLocalUsage();
  const backend = usage.source === "backend";
  const dailyRequests = backend ? usage.dailyRequests : Math.max(usage.dailyRequests, local.dailyRequests);
  const monthlyRequests = backend ? usage.monthlyRequests : Math.max(usage.monthlyRequests, local.monthlyRequests);
  const dailyTokens = backend ? usage.dailyTokens : Math.max(usage.dailyTokens, local.dailyTokens);
  const monthlyTokens = backend ? usage.monthlyTokens : Math.max(usage.monthlyTokens, local.monthlyTokens);
  const perModel = backend && Object.keys(usage.perModel).length ? usage.perModel : local.perModel;
  const resetLabel = `Resets at 00:00 UTC · in ${formatResetCountdown()}`;

  return (
    <Dialog
      title="Usage & Quotas"
      description={`${subscription.plan} plan · ${backend ? "Live gateway metrics" : "On-device counters + provider quotas"}`}
      onClose={onClose}
      footer={
        <>
          <span className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
            <Clock size={12} /> {resetLabel}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            className="flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </>
      }
    >
      <div className="space-y-4 py-4">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Daily usage</p>
            <p className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--ink)]">{dailyRequests.toLocaleString()} req</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-[var(--muted)]">{dailyTokens.toLocaleString()} tokens today</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Remaining today</p>
            <p className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--ink)]">
              {usage.remainingDailyRequests !== null ? `${usage.remainingDailyRequests.toLocaleString()} req` : "Unlimited"}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              {usage.remainingMonthlyTokens !== null
                ? `${usage.remainingMonthlyTokens.toLocaleString()} monthly tok left`
                : "No daily request limit"}
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Monthly usage</p>
            <p className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--ink)]">{monthlyRequests.toLocaleString()} req</p>
            <p className="mt-0.5 text-[10px] tabular-nums text-[var(--muted)]">{monthlyTokens.toLocaleString()} tokens this month</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3">
            <p className="text-[9px] font-semibold uppercase tracking-[.12em] text-[var(--muted)]">Daily reset</p>
            <p className="mt-1 text-[17px] font-semibold tabular-nums text-[var(--ink)]">00:00 UTC</p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">{formatResetCountdown()} from now</p>
          </div>
        </div>

        <p className="rounded-xl border border-[var(--line)] px-3 py-2.5 text-[10.5px] leading-relaxed text-[var(--muted)]">
          {usage.note} Live upstream NoTrack.ai quotas, latency, and token telemetry are tracked below.
        </p>

        <div>
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Active inference engines</p>
          <div className="space-y-2">
            {(() => {
              const statusLabel =
                availability.notrackStatus === "connected"
                  ? "NoTrack Live"
                  : availability.notrackStatus === "error"
                    ? "Key Error"
                    : "API Key Required";
              const rate = usage.rateLimits.notrack;
              const officialSpec = usage.officialQuotas?.notrack;
              return (
                <div className="rounded-2xl border border-[var(--line)] p-3">
                  <div className="flex items-center gap-2">
                    <CompanyLogo company="notrack" size={16} />
                    <span className="text-[12px] font-semibold text-[var(--ink)]">
                      NoTrack.ai (api.notrack.ai/v1)
                    </span>
                    <span className="ml-auto text-[10px] font-medium text-[#2d9761]">{statusLabel}</span>
                  </div>
                  {officialSpec && (
                    <p className="mt-1.5 text-[10px] text-[var(--ink-soft)]">{officialSpec}</p>
                  )}
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    {rate
                      ? `Live upstream quota: ${rate.remainingRequests ?? "Unlimited"} requests left · ${rate.remainingTokens ?? "Active"} tokens left · resets ${rate.resetRequests ?? rate.resetTokens ?? "per window"}.`
                      : availability.notrackConfigured
                        ? `Discovered ${availability.discoveredModels.length || 1} model(s)${typeof availability.notrackLatencyMs === "number" ? ` · last check ${availability.notrackLatencyMs}ms` : ""}${availability.notrackMaskedKey ? ` · Key ${availability.notrackMaskedKey}` : ""}.`
                        : "Enter your NoTrack.ai API key in Settings -> NoTrack.ai API key to power all models."}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">Model-specific usage</p>
          {Object.keys(perModel).length ? (
            <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
              {Object.entries(perModel).map(([modelId, entry]) => (
                <div key={modelId} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[11px]">
                  <span className="truncate font-mono text-[10.5px] text-[var(--ink-soft)]">{modelId}</span>
                  <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted)]">
                    {entry.requests} req · {(entry.inputTokens + entry.outputTokens).toLocaleString()} tok
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-[var(--line)] px-3 py-4 text-center text-[11px] text-[var(--muted)]">
              No requests recorded today.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
            <Activity size={11} /> Usage history
          </p>
          {usage.history.length || local.history.length ? (
            <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
              {(usage.history.length ? usage.history.slice(0, 15) : []).map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 text-[10.5px]">
                  <CompanyLogo company={item.company} size={14} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--ink-soft)]">
                      {item.modelName}
                      {item.actualModel ? ` (${item.actualModel})` : ""}
                    </p>
                    <p className="text-[9.5px] text-[var(--muted)]">
                      {new Date(item.timestamp).toLocaleString()}
                      {item.usedProvider ? ` · ${item.usedProvider === "notrack" ? "NoTrack.ai" : item.usedProvider}` : ""}
                      {typeof item.latencyMs === "number" ? ` · ${item.latencyMs}ms` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 tabular-nums text-[10px] text-[var(--muted)]">
                    {item.inputTokens + item.outputTokens} tok · {item.status}
                  </span>
                </div>
              ))}
              {!usage.history.length &&
                local.history.slice(0, 15).map((item) => (
                  <div key={item.id} className="flex items-center gap-2.5 px-3 py-2 text-[10.5px]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--ink-soft)]">{item.engine}</p>
                      <p className="text-[9.5px] text-[var(--muted)]">
                        {new Date(item.at).toLocaleString()} · {item.modelId}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-[var(--muted)]">
                      {item.inputTokens + item.outputTokens} tok
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-[var(--line)] px-3 py-4 text-center text-[11px] text-[var(--muted)]">
              No usage history recorded yet.
            </p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
