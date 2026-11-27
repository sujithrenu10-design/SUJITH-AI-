import { useState } from "react";
import { Check, Crown, ReceiptText, RefreshCw, ShieldAlert } from "lucide-react";
import { Dialog } from "./Dialog";
import { SUBSCRIPTION_PLANS, type PlanTier } from "../lib/modelCatalog";
import type { SubscriptionState } from "../lib/gatewayClient";
import { cn } from "../utils/cn";

export function SubscriptionModal({
  subscription,
  onCheckout,
  onVerifySession,
  onManageAction,
  onRefresh,
  onClose,
}: {
  subscription: SubscriptionState;
  onCheckout: (plan: PlanTier, interval: "monthly" | "yearly") => Promise<void>;
  onVerifySession: (sessionId: string) => Promise<void>;
  onManageAction: (action: "cancel" | "restore" | "downgrade-free") => Promise<void>;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [sessionId, setSessionId] = useState("");
  const [working, setWorking] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setWorking(true);
    try {
      await fn();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Dialog
      title="Subscriptions"
      description={`Current plan: ${subscription.plan} · ${subscription.status}`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            disabled={working}
            onClick={() => void run(() => onManageAction("restore"))}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] px-3 py-2 text-[11px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
          >
            <RefreshCw size={12} /> Restore purchase
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="rounded-full bg-[var(--ink)] px-4 py-2 text-[11px] font-medium text-[var(--surface)]"
          >
            Refresh status
          </button>
        </>
      }
    >
      <div className="space-y-4 py-4">
        <div className="flex gap-1 rounded-xl bg-[var(--surface-soft)] p-1">
          {(["monthly", "yearly"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInterval(mode)}
              aria-pressed={interval === mode}
              className={cn(
                "h-9 flex-1 rounded-lg text-[11px] capitalize transition",
                interval === mode ? "bg-[var(--surface)] font-semibold text-[var(--ink)] shadow-sm" : "text-[var(--muted)]"
              )}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-soft)] p-3 text-[11px]">
          <div className="flex items-center gap-2 font-semibold text-[var(--ink)]">
            <Crown size={14} className="text-[#b5871a]" />
            <span>Status: {subscription.plan} ({subscription.status})</span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            {subscription.renewalDate ? `Renewal: ${new Date(subscription.renewalDate).toLocaleDateString()}` : "Renewal: None"} ·{" "}
            {subscription.expirationDate ? `Expires: ${new Date(subscription.expirationDate).toLocaleDateString()}` : "No expiration"}
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">{subscription.note}</p>
        </div>

        <div className="space-y-2.5">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const current = subscription.plan === plan.id && subscription.status === "active";
            const serverPlan = subscription.planConfigs[plan.id];
            const rawPrice =
              interval === "monthly"
                ? serverPlan?.monthlyPriceUsd ?? plan.monthlyPriceUsd
                : serverPlan?.yearlyPriceUsd ?? plan.yearlyPriceUsd;
            const priceLabel =
              rawPrice !== null ? `$${rawPrice}${interval === "monthly" ? "/mo" : "/yr"}` : plan.pricingNote;
            const allowance = serverPlan?.allowanceNote ?? plan.allowanceSummary;

            return (
              <article
                key={plan.id}
                className={cn(
                  "rounded-2xl border p-3.5",
                  current ? "border-[var(--ink)]/40 bg-[var(--blue-soft)]" : "border-[var(--line)] bg-[var(--surface)]"
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div>
                    <h3 className="text-[14px] font-semibold text-[var(--ink)]">{plan.name}</h3>
                    <p className="text-[10px] text-[var(--muted)]">{plan.tagline}</p>
                  </div>
                  <span className="shrink-0 text-[12px] font-semibold text-[var(--ink)]">{priceLabel}</span>
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--muted)]">{allowance}</p>
                <ul className="mt-2.5 space-y-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5 text-[10.5px] text-[var(--ink-soft)]">
                      <Check size={12} className="mt-0.5 shrink-0 text-[#2d9761]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex gap-2">
                  {plan.id === "FREE" ? (
                    <button
                      type="button"
                      disabled={working || subscription.plan === "FREE"}
                      onClick={() => void run(() => onManageAction("downgrade-free"))}
                      className="h-8 rounded-full border border-[var(--line)] px-4 text-[11px] font-medium text-[var(--ink-soft)] disabled:opacity-40"
                    >
                      {subscription.plan === "FREE" ? "Current tier" : "Downgrade to Free"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={working || current}
                      onClick={() => void run(() => onCheckout(plan.id, interval))}
                      className="h-8 rounded-full bg-[var(--ink)] px-4 text-[11px] font-medium text-[var(--surface)] disabled:opacity-40"
                    >
                      {current ? "Active" : `Upgrade to ${plan.name}`}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {subscription.plan !== "FREE" && (
          <button
            type="button"
            disabled={working}
            onClick={() => void run(() => onManageAction("cancel"))}
            className="w-full rounded-xl border border-[var(--line)] py-2 text-[11px] font-medium text-[#bb3c37] hover:bg-[#fce8e6] disabled:opacity-40"
          >
            Cancel subscription
          </button>
        )}

        <div className="rounded-2xl border border-[var(--line)] p-3">
          <p className="text-[11px] font-semibold text-[var(--ink)]">Verify Stripe checkout session</p>
          <p className="mt-0.5 text-[10px] text-[var(--muted)]">
            {subscription.billingConfigured
              ? "Paste a completed Stripe checkout session ID below to verify payment and activate your plan."
              : "Stripe billing requires STRIPE_SECRET_KEY and STRIPE_PRICE_* configured on the server."}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="cs_live_... or cs_test_..."
              aria-label="Checkout session ID"
              className="placeholder-color h-9 min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-transparent px-2.5 text-[11px] text-[var(--ink)] outline-none"
            />
            <button
              type="button"
              disabled={working || !sessionId.trim()}
              onClick={() => void run(() => onVerifySession(sessionId.trim()))}
              className="h-9 shrink-0 rounded-xl border border-[var(--line)] px-3 text-[11px] font-medium text-[var(--ink-soft)] disabled:opacity-40"
            >
              Verify
            </button>
          </div>
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.14em] text-[var(--muted)]">
            <ReceiptText size={11} /> Transaction history
          </p>
          {subscription.transactions.length ? (
            <div className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)]">
              {subscription.transactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[10.5px]">
                  <div>
                    <p className="font-medium text-[var(--ink-soft)]">
                      {tx.plan} ({tx.interval})
                    </p>
                    <p className="text-[9.5px] text-[var(--muted)]">{new Date(tx.date).toLocaleDateString()} · {tx.reference}</p>
                  </div>
                  <span className="font-semibold tabular-nums text-[var(--ink)]">
                    {tx.amountFormatted} · {tx.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-2xl border border-[var(--line)] px-3 py-4 text-center text-[11px] text-[var(--muted)]">
              No verified transactions yet.
            </p>
          )}
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--muted)]">
          <ShieldAlert size={13} className="mt-0.5 shrink-0" />
          <span>Paid plans activate only after verified Stripe checkout payment on the server.</span>
        </div>
      </div>
    </Dialog>
  );
}
