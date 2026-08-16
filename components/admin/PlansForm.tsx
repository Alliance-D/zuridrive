"use client";

/**
 * PlansForm — subscription plan pricing.
 *
 * Plans used to live only in prisma/seed.ts, so every price change was a code
 * change. This edits them directly.
 *
 * Two things the form says out loud, because they are the first questions
 * anyone changing a price will have:
 *
 *   • Editing a price never touches what an existing subscriber already paid.
 *     OwnerSubscription.pricePaid snapshots the figure at the moment they
 *     committed, so a change applies from their next cycle.
 *
 *   • An empty listing cap means unlimited, which is how the largest operator
 *     ends up paying what a mid-sized one pays. The field warns rather than
 *     forbidding it, since one uncapped tier plus "talk to us" above it is a
 *     legitimate model.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { formatRWF } from "@/lib/currency";
import { Loader2, Check, AlertCircle, AlertTriangle, Infinity as InfinityIcon } from "lucide-react";

export interface PlanValues {
  id: string;
  tier: string;
  name: string;
  priceMonthly: number;
  maxListings: number | null;
  commissionRatePercent: number | null;
  isFeatured: boolean;
  hasVerifiedBadge: boolean;
  hasHomepageBanner: boolean;
  hasPrioritySupport: boolean;
  analyticsLevel: string;
  isActive: boolean;
}

/** Form state keeps numbers as strings so a half-typed field isn't coerced. */
interface Draft {
  id: string;
  tier: string;
  name: string;
  priceMonthly: string;
  maxListings: string;
  commissionRatePercent: string;
  isFeatured: boolean;
  hasVerifiedBadge: boolean;
  hasHomepageBanner: boolean;
  hasPrioritySupport: boolean;
  analyticsLevel: string;
  isActive: boolean;
}

const toDraft = (p: PlanValues): Draft => ({
  ...p,
  priceMonthly: String(p.priceMonthly),
  maxListings: p.maxListings === null ? "" : String(p.maxListings),
  commissionRatePercent:
    p.commissionRatePercent === null ? "" : String(p.commissionRatePercent),
});

export default function PlansForm({
  initial,
  platformCommission,
}: {
  initial: PlanValues[];
  platformCommission: number;
}) {
  const t = useTranslations("adminForms");
  const tc = useTranslations("common");
  const router = useRouter();

  const [plans, setPlans] = useState<Draft[]>(initial.map(toDraft));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<Draft>) {
    setPlans((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plans: plans.map((p) => ({
            id: p.id,
            name: p.name.trim(),
            priceMonthly: Number(p.priceMonthly || 0),
            // Empty means unlimited, and empty commission means "use the
            // platform rate" — both are deliberate nulls, not missing values.
            maxListings: p.maxListings.trim() === "" ? null : Number(p.maxListings),
            commissionRatePercent:
              p.commissionRatePercent.trim() === ""
                ? null
                : Number(p.commissionRatePercent),
            isFeatured: p.isFeatured,
            hasVerifiedBadge: p.hasVerifiedBadge,
            hasHomepageBanner: p.hasHomepageBanner,
            hasPrioritySupport: p.hasPrioritySupport,
            analyticsLevel: p.analyticsLevel,
            isActive: p.isActive,
          })),
        }),
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? tc("genericError"));
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError(tc("genericError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sand-dark bg-warning-bg p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" />
          <p className="text-sm text-warning">{t("planPriceNote")}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {plans.map((p) => {
          const unlimited = p.maxListings.trim() === "";
          const usesPlatformRate = p.commissionRatePercent.trim() === "";

          return (
            <section
              key={p.id}
              className={`rounded-2xl border bg-white p-5 ${
                p.isActive ? "border-sand-dark" : "border-sand-light opacity-70"
              }`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <input
                  value={p.name}
                  onChange={(e) => update(p.id, { name: e.target.value })}
                  aria-label={t("planName")}
                  className="w-full max-w-[10rem] rounded-lg border border-sand-dark px-2.5 py-1.5 text-base font-bold text-ink"
                />
                <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-ink-soft">
                  <input
                    type="checkbox"
                    checked={p.isActive}
                    onChange={(e) => update(p.id, { isActive: e.target.checked })}
                  />
                  {t("planActive")}
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">
                    {t("planPrice")}
                  </span>
                  <input
                    inputMode="numeric"
                    value={p.priceMonthly}
                    onChange={(e) =>
                      update(p.id, { priceMonthly: e.target.value.replace(/\D/g, "") })
                    }
                    className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-ink-faint">
                    {formatRWF(Number(p.priceMonthly || 0))}
                  </span>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">
                    {t("planMaxListings")}
                  </span>
                  <input
                    inputMode="numeric"
                    value={p.maxListings}
                    placeholder={t("planUnlimited")}
                    onChange={(e) =>
                      update(p.id, { maxListings: e.target.value.replace(/\D/g, "") })
                    }
                    className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm"
                  />
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-ink-faint">
                    {unlimited && <InfinityIcon className="h-3 w-3" />}
                    {unlimited ? t("planUncappedWarning") : t("planCapHint")}
                  </span>
                </label>

                <label className="col-span-2 block">
                  <span className="mb-1 block text-xs font-semibold text-ink-soft">
                    {t("planCommission")}
                  </span>
                  <input
                    inputMode="numeric"
                    value={p.commissionRatePercent}
                    placeholder={String(platformCommission)}
                    onChange={(e) =>
                      update(p.id, {
                        commissionRatePercent: e.target.value.replace(/\D/g, ""),
                      })
                    }
                    className="w-full rounded-lg border border-sand-dark px-3 py-2 text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-ink-faint">
                    {usesPlatformRate
                      ? t("planCommissionInherited", { rate: platformCommission })
                      : t("planCommissionOwn")}
                  </span>
                </label>
              </div>

              <div className="mt-4 space-y-2 border-t border-sand-light pt-3">
                {(
                  [
                    ["isFeatured", "planFeatured"],
                    ["hasVerifiedBadge", "planVerifiedBadge"],
                    ["hasHomepageBanner", "planHomepageBanner"],
                    ["hasPrioritySupport", "planPrioritySupport"],
                  ] as const
                ).map(([field, labelKey]) => (
                  <label
                    key={field}
                    className="flex items-center gap-2 text-sm text-ink-muted"
                  >
                    <input
                      type="checkbox"
                      checked={p[field]}
                      onChange={(e) => update(p.id, { [field]: e.target.checked })}
                    />
                    {t(labelKey)}
                  </label>
                ))}

                <label className="flex items-center gap-2 pt-1 text-sm text-ink-muted">
                  <span className="shrink-0">{t("planAnalytics")}</span>
                  <select
                    value={p.analyticsLevel}
                    onChange={(e) => update(p.id, { analyticsLevel: e.target.value })}
                    // pr-7 leaves room for the native chevron, which was
                    // sitting on top of "ADVANCED".
                    className="rounded-lg border border-sand-dark py-1 pl-2 pr-7 text-sm"
                  >
                    <option value="BASIC">BASIC</option>
                    <option value="ADVANCED">ADVANCED</option>
                    <option value="FULL">FULL</option>
                  </select>
                </label>
              </div>
            </section>
          );
        })}
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-danger-error">
          <AlertCircle className="h-4 w-4" /> {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? tc("saving") : t("savePlans")}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-success-strong">
            <Check className="h-4 w-4" /> {tc("saved")}
          </span>
        )}
      </div>
    </div>
  );
}
