import { useMemo, useState } from "react";
import { BarChart3, Check, Crown, Info, RefreshCw, Search } from "lucide-react";
import { Dialog } from "./Dialog";
import { CompanyLogo } from "./CompanyLogo";
import { COMPANY_META, type CompanyId } from "../lib/companyLogos";
import { mergeDiscoveredCatalog, type ModelSpec } from "../lib/modelCatalog";
import type { ProviderAvailability, SubscriptionState, UsageSummary } from "../lib/gatewayClient";
import { cn } from "../utils/cn";

type FilterTab = "all" | CompanyId;

function statusBadge(model: ModelSpec, availability: ProviderAvailability) {
  if (availability.notrackStatus === "error") return { label: "Key Error", tone: "warn" as const };
  if (availability.notrackStatus !== "connected") return { label: "API Key Required", tone: "warn" as const };
  const isDirect = Boolean(
    model.officialModelId && availability.discoveredModels.includes(model.officialModelId)
  );
  if (isDirect) return { label: "NoTrack Live", tone: "ok" as const };
  const target = availability.discoveredModels[0] || "notrack-uncensored";
  return { label: `via ${target}`, tone: "routed" as const };
}

export function ModelSelectorModal({
  selected,
  availability,
  usage,
  subscription,
  onSelect,
  onInspect,
  onRefreshStatus,
  onOpenUsage,
  onOpenSubscriptions,
  onClose,
}: {
  selected: ModelSpec;
  availability: ProviderAvailability;
  usage: UsageSummary;
  subscription: SubscriptionState;
  onSelect: (model: ModelSpec) => void;
  onInspect: (model: ModelSpec) => void;
  onRefreshStatus: () => void;
  onOpenUsage: () => void;
  onOpenSubscriptions: () => void;
  onClose: () => void;
}) {
  const [companyFilter, setCompanyFilter] = useState<FilterTab>("all");
  const [query, setQuery] = useState("");

  const catalog = useMemo(
    () => mergeDiscoveredCatalog(availability.discoveredModels),
    [availability.discoveredModels]
  );

  const providerTabs = useMemo(() => {
    const order: CompanyId[] = ["notrack", "openai", "gemini", "anthropic"];
    return order
      .map((id) => ({
        id,
        label: COMPANY_META[id].shortName,
        count: catalog.filter((m) => m.company === id).length,
      }))
      .filter((item) => item.count > 0);
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((model) => {
      if (companyFilter !== "all" && model.company !== companyFilter) return false;
      if (!q) return true;
      return `${model.name} ${model.companyName} ${model.officialModelId ?? ""} ${model.description} ${model.capabilities.join(" ")}`
        .toLowerCase()
        .includes(q);
    });
  }, [catalog, companyFilter, query]);

  return (
    <Dialog
      title="AI Models"
      description={
        availability.notrackStatus === "connected"
          ? `${catalog.length} models · Live on api.notrack.ai/v1 (${availability.discoveredModels.join(", ") || "notrack-uncensored"})`
          : availability.notrackStatus === "error"
            ? `${catalog.length} models · Check NoTrack.ai API key in Settings`
            : `${catalog.length} models · Enter NoTrack.ai API key in Settings`
      }
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenUsage();
            }}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
          >
            <BarChart3 size={13} /> Usage &amp; quotas
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenSubscriptions();
            }}
            className="flex items-center gap-1.5 rounded-full bg-[var(--ink)] px-3.5 py-2 text-[11px] font-medium text-[var(--surface)]"
          >
            <Crown size={13} /> {subscription.plan} plan
          </button>
        </>
      }
    >
      <div className="pt-3">
        <div className="flex items-center gap-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 text-[var(--muted)]">
            <Search size={14} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search models, IDs, or capabilities"
              aria-label="Search models"
              className="placeholder-color min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink)] outline-none"
            />
          </label>
          <button
            type="button"
            onClick={onRefreshStatus}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--line)] text-[var(--muted)] hover:bg-[var(--surface-soft)]"
            aria-label="Refresh model status"
            title="Refresh provider status"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filter models by company">
          <button
            type="button"
            role="tab"
            aria-selected={companyFilter === "all"}
            onClick={() => setCompanyFilter("all")}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition",
              companyFilter === "all"
                ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--surface)]"
                : "border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
            )}
          >
            All ({catalog.length})
          </button>
          {providerTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={companyFilter === tab.id}
              onClick={() => setCompanyFilter(tab.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-medium transition",
                companyFilter === tab.id
                  ? "border-[var(--ink)] bg-[var(--surface-muted)] text-[var(--ink)]"
                  : "border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--surface-soft)]"
              )}
            >
              <CompanyLogo company={tab.id} size={13} />
              <span>{tab.label}</span>
              <span className="text-[10px] text-[var(--muted)]">({tab.count})</span>
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-1.5">
          {filtered.map((model) => {
            const active = model.id === selected.id;
            const badge = statusBadge(model, availability);
            const modelStats = model.officialModelId ? usage.perModel[model.officialModelId] : undefined;
            return (
              <div
                key={model.id}
                className={cn(
                  "flex items-center gap-2 rounded-2xl border p-2 transition",
                  active
                    ? "border-[var(--ink)]/30 bg-[var(--blue-soft)]"
                    : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-soft)]"
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(model);
                    onClose();
                  }}
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  aria-pressed={active}
                >
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                    <CompanyLogo company={model.company} size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[12px] font-semibold text-[var(--ink)]">{model.name}</span>
                      {active && <Check size={13} className="shrink-0 text-[var(--blue)]" />}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[9.5px] text-[var(--muted)]">
                      {model.officialModelId ?? model.id} · {model.inputs.join("/")} → {model.outputs.join("/")}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[8.5px] font-semibold",
                          badge.tone === "ok"
                            ? "bg-[#e6f4ea] text-[#137333] dark:bg-[#183c28] dark:text-[#81c995]"
                            : badge.tone === "routed"
                              ? "bg-[var(--blue-soft)] text-[var(--blue-text)]"
                              : "bg-[#fef3c7] text-[#92400e] dark:bg-[#3a2f14] dark:text-[#fcd34d]"
                        )}
                      >
                        {badge.label}
                      </span>
                      <span className="text-[9px] text-[var(--muted)]">
                        {availability.notrackStatus === "connected" ? "Included" : `${model.eligiblePlans[0]}+`}
                      </span>
                      {modelStats ? <span className="text-[9px] text-[var(--muted)]">· {modelStats.requests} req</span> : null}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onInspect(model)}
                  aria-label={`Model info for ${model.name}`}
                  title="Model specifications"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
                >
                  <Info size={15} />
                </button>
              </div>
            );
          })}
          {!filtered.length && (
            <p className="py-8 text-center text-[12px] text-[var(--muted)]">No models match "{query}".</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}
