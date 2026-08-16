/**
 * /owner/subscription — plan selection and current status
 *
 * Onboarding step 3. Read-only for now: choosing a plan creates a payment
 * flow that belongs with the admin finance work, so this page shows the tiers
 * and the current subscription without pretending to charge anyone.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";
import { formatRWF } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { routes } from "@/lib/routes";
import PlanCheckout from "@/components/owner/PlanCheckout";
import { getPlatformSettings } from "@/lib/platform-settings";
import { Check, Star, Sparkles, ShieldCheck, Clock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("subscription")} — ZuriDrive` };
}

const TIER_ICONS: Record<string, React.ElementType> = {
  BASIC: ShieldCheck,
  PRO: Star,
  PREMIUM: Sparkles,
};

export default async function OwnerSubscriptionPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const label = await getEnumLabeller(params.locale);
  const { profile } = await requireOwnerProfile();

  const [plans, current, carCount, pending, settings] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    }),
    prisma.ownerSubscription.findFirst({
      where: { ownerId: profile.id, status: { in: ["ACTIVE", "TRIAL"] } },
      include: { plan: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.car.count({ where: { ownerId: profile.id } }),
    prisma.ownerSubscription.findFirst({
      where: { ownerId: profile.id, status: "PENDING_PAYMENT" },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    }),
    getPlatformSettings(),
  ]);

  const freeTier = settings.freeTierMaxListings;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("subscription")}</h1>
        <p className="text-sm text-ink-soft">{t("subscriptionSub")}</p>
      </div>

      {/* Current plan */}
      {current ? (
        <div className="rounded-2xl bg-brand p-4 text-white shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-brand-tint">
                {t("currentPlan")}
              </p>
              <p className="mt-0.5 text-lg font-bold">{current.plan.name}</p>
              <p className="mt-1 text-xs text-brand-tint">
                {t("perMonthRenews", {
                  amount: formatRWF(current.plan.priceMonthly),
                  date: formatDate(current.expiresAt, params.locale),
                })}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold">
              {current.status === "TRIAL" ? t("freeTrial") : t("planActive")}
            </span>
          </div>

          <p className="mt-3 text-xs text-brand-tint">
            {t("usingListings", {
              used: carCount,
              max: current.plan.maxListings ?? t("unlimited"),
            })}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-warning-bg p-4">
          <p className="text-sm font-semibold text-warning">
            {t("notOnPlanYet")}
          </p>
          <p className="mt-1 text-xs text-warning">
            {t("withoutPlanYouCanList")}{" "}
            <strong>{t("freeTierCars", { count: freeTier })}</strong>
            {carCount > freeTier
              ? `. ${t("someNotVisible", {
                  count: carCount,
                  hidden: carCount - freeTier,
                })}`
              : t("standardPlacementSuffix")}{" "}
            {t("planLiftsLimit")}
          </p>
        </div>
      )}

      {/* A payment we're waiting on. Shown above the plans so nobody pays
          twice while the first one is still being checked. */}
      {pending && (
        <div className="rounded-2xl bg-warning-bg p-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-warning">
            <Clock className="h-4 w-4" />
            {t("waitingOnPayment", { plan: pending.plan.name })}
          </p>
          <p className="mt-1 text-xs text-warning">
            {pending.paymentMethod === "BANK_TRANSFER"
              ? t("bankPendingHint")
              : t("momoPendingHint")}
          </p>
          {pending.rejectionReason && (
            <p className="mt-1.5 rounded-lg bg-white/60 p-2 text-xs text-warning">
              {t("lastAttempt", { reason: pending.rejectionReason })}
            </p>
          )}
        </div>
      )}

      {/* Plans */}
      <div className="grid gap-3 sm:grid-cols-3">
        {plans.map((plan) => {
          const Icon = TIER_ICONS[plan.tier] ?? ShieldCheck;
          const isCurrent = current?.planId === plan.id;

          const features = [
            plan.maxListings
              ? t("upToCars", { count: plan.maxListings })
              : t("unlimitedCars"),
            plan.isFeatured
              ? plan.featuredPriority === 1
                ? t("topOfSearch")
                : t("featuredInSearch")
              : t("standardPlacement"),
            plan.hasVerifiedBadge ? t("verifiedBadge") : null,
            t("analyticsLevel", {
              level: label("analyticsLevel", plan.analyticsLevel),
            }),
            plan.hasHomepageBanner ? t("homepageBanner") : null,
            plan.hasPrioritySupport ? t("prioritySupportFeature") : null,
          ].filter(Boolean) as string[];

          return (
            <div
              key={plan.id}
              className={`rounded-2xl bg-white p-4 shadow-sm ${
                isCurrent ? "ring-2 ring-brand" : ""
              }`}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-sand">
                <Icon className="h-4 w-4 text-brand" />
              </div>

              <h2 className="text-sm font-bold text-ink">{plan.name}</h2>
              <p className="mt-0.5">
                <span className="text-xl font-bold text-ink">
                  {formatRWF(plan.priceMonthly)}
                </span>
                <span className="text-xs text-ink-soft">{t("perMonth")}</span>
              </p>

              <ul className="mt-3 space-y-1.5">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
                    <span className="text-ink-muted first-letter:uppercase">
                      {f}
                    </span>
                  </li>
                ))}
              </ul>

              <PlanCheckout
                planId={plan.id}
                planName={plan.name}
                priceMonthly={plan.priceMonthly}
                isCurrent={isCurrent}
                hasActivePlan={current !== null}
                defaultMomoNumber={profile.momoNumber}
              />
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs text-ink-faint">
        {t("billingQuestions")}{" "}
        <Link href={routes.ownerProfile} className="underline">
          {t("checkPayoutDetails")}
        </Link>{" "}
        {t("orContactSupport")}
      </p>
    </div>
  );
}
