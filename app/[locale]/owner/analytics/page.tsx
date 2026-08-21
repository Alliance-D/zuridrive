/**
 * /owner/analytics — the owner's own performance.
 *
 * This is where SubscriptionPlan.analyticsLevel is enforced. Depth by plan:
 *
 *   BASIC     what happened      — earnings, trips, rating, earnings over time
 *   ADVANCED  where it came from — per-car performance, booking outcomes
 *   FULL      what to do next    — demand patterns, price position, ratings
 *
 * Two rules the gating follows:
 *   • A locked section is never queried, so depth costs nothing to withhold.
 *   • BASIC is available to every owner including the free tier. An owner's
 *     own earnings history is theirs; the plan buys the analysis on top of it.
 *
 * Money shown here is OWNER earnings — net of commission, matching what
 * /owner/earnings and the payout ledger say.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { localePath, loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import { RANGES, resolveRange } from "@/lib/analytics/queries";
import {
  getOwnerAnalyticsLevel,
  getOwnerHeadlines,
  getOwnerEarningsSeries,
  getOwnerCarPerformance,
  getOwnerBookingOutcomes,
  getOwnerDemandPatterns,
  getOwnerPricePosition,
  getOwnerRatingBreakdown,
  hasLevel,
} from "@/lib/analytics/owner-queries";
import { getTranslations } from "next-intl/server";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import LineChart from "@/components/charts/LineChart";
import BarList from "@/components/charts/BarList";
import { Metric, Delta, TableView } from "@/components/charts/pieces";
import LockedInsight from "@/components/owner/LockedInsight";
import { Star, Sparkles } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const to = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${to("analytics")} — ZuriDrive` };
}

export default async function OwnerAnalyticsPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { range?: string };
}) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "analytics",
  });
  const to = await getTranslations({ locale: params.locale, namespace: "owner" });
  const label = await getEnumLabeller(params.locale);
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/owner/analytics"));

  const profile = await prisma.carOwnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect(await localePath("/owner/onboarding"));

  const range = resolveRange(searchParams.range);
  const access = await getOwnerAnalyticsLevel(profile.id);

  // BASIC — every owner gets these.
  const [headlines, earnings] = await Promise.all([
    getOwnerHeadlines(profile.id, range.from, range.previousFrom),
    getOwnerEarningsSeries(profile.id, range.from, range.bucket),
  ]);

  // Only query what the plan actually reaches.
  const advanced = hasLevel(access.level, "ADVANCED");
  const full = hasLevel(access.level, "FULL");

  const [cars, outcomes] = advanced
    ? await Promise.all([
        getOwnerCarPerformance(profile.id, range.from),
        getOwnerBookingOutcomes(profile.id, range.from),
      ])
    : [null, null];

  const [demand, pricing, ratings] = full
    ? await Promise.all([
        getOwnerDemandPatterns(profile.id, range.from),
        getOwnerPricePosition(profile.id),
        getOwnerRatingBreakdown(profile.id, range.from),
      ])
    : [null, null, null];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-ink">{to("analytics")}</h1>
          <p className="text-xs text-ink-soft">{t("ownerSub")}</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-soft shadow-sm">
          {access.planName ?? t("freeTier")} ·{" "}
          {access.level === "FULL"
            ? t("levelFull")
            : access.level === "ADVANCED"
              ? t("levelAdvanced")
              : t("levelBasic")}
        </span>
      </div>

      {/* Range filter — one row above the charts */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/owner/analytics?range=${r.key}`}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              range.key === r.key
                ? "bg-brand text-white"
                : "bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {t(r.labelKey)}
          </Link>
        ))}
        <span className="ml-2 text-[11px] text-ink-faint">
          {t("since", { date: formatDate(range.from, params.locale) })}
        </span>
      </div>

      {/* Hero — the number an owner opens this page for */}
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-brand p-5 text-white shadow-sm lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-brand-tint">
            {t("yourEarnings")}
          </p>
          <p className="mt-1 text-[44px] font-bold leading-none">
            {formatMoney(headlines.earnings)}
          </p>
          <div className="mt-2">
            <Delta
              value={headlines.earningsDelta}
              onDark
              noBaselineLabel={t("noPriorPeriod")}
            />
          </div>
          <p className="mt-3 text-[11px] text-brand-tint">
            {t("afterCommission")}
          </p>
        </div>

        <Metric
          label={t("completedTrips")}
          value={String(headlines.completedTrips)}
          delta={headlines.tripsDelta}
          noBaselineLabel={t("noPriorPeriod")}
        />
        <Metric
          label={t("averageRating")}
          value={
            headlines.avgRating !== null
              ? headlines.avgRating.toFixed(1)
              : "—"
          }
          hint={
            headlines.reviewCount > 0
              ? t("reviewsInPeriod", { count: headlines.reviewCount })
              : t("noReviewsInPeriod")
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          label={t("requestAcceptance")}
          value={
            headlines.acceptanceRate !== null
              ? `${headlines.acceptanceRate}%`
              : "—"
          }
          hint={t("ofRequestsResponded")}
        />
        <Metric
          label={t("carsListed")}
          value={String(headlines.liveCars)}
          hint={t("liveAndVisible")}
        />
      </div>

      {/* Earnings over time — single series, so no legend; the title names it */}
      <Card
        title={
          range.bucket === "day"
            ? t("earningsOverTimeDaily")
            : t("earningsOverTimeMonthly")
        }
      >
        <LineChart data={earnings} format="rwfCompact" />
        <TableView
          tableLabel={t("viewAsTable")}
          caption={t("earningsByPeriod")}
          headers={[t("colPeriod"), t("colYourEarnings")]}
          rows={earnings.map((p) => [p.label, formatMoney(p.value)])}
        />
      </Card>

      {/* ── ADVANCED ──────────────────────────────────────────────────────── */}
      {advanced && cars && outcomes ? (
        <>
          <Card title={t("howEachCar")}>
            {cars.length === 0 ? (
              <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
                {t("noCarYet")}
              </p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand text-left text-xs text-ink-faint">
                      <th className="pb-2 font-medium">{t("colCar")}</th>
                      <th className="pb-2 text-right font-medium">
                        {t("colTrips")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("colDaysOut")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("colUsed")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("colRating")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("colEarnings")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {cars.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 text-xs font-medium text-ink">
                          {c.name}
                          {!c.isLive && (
                            <span className="ml-1.5 rounded-full bg-bone px-1.5 py-0.5 text-[10px] text-ink-faint">
                              {t("notListed")}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink-soft">
                          {c.trips}
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink-soft">
                          {c.bookedDays}
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink-soft">
                          {c.utilisation}%
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink-soft">
                          {c.avgRating !== null ? c.avgRating.toFixed(1) : "—"}
                        </td>
                        <td className="py-2.5 text-right text-xs font-semibold text-brand">
                          {formatMoney(c.earnings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              {t("usedExplainer")}
            </p>
          </Card>

          <Card title={t("whereBookingsEnded")}>
            <BarList
              items={[
                {
                  id: "completed",
                  label: t("outcomeCompleted"),
                  value: outcomes.completed,
                },
                {
                  id: "rejected",
                  label: t("outcomeDeclined"),
                  value: outcomes.rejectedByOwner,
                },
                {
                  id: "cancelled",
                  label: t("outcomeCancelled"),
                  value: outcomes.cancelledByClient,
                },
                {
                  id: "unpaid",
                  label: t("outcomeUnpaid"),
                  value: outcomes.expiredUnpaid,
                },
              ]}
              format="number"
              emptyMessage={t("noBookingsInPeriod")}
            />
            {outcomes.completionRate !== null && (
              <p className="mt-2 text-[11px] text-ink-faint">
                {t("completionRateNote", {
                  percent: outcomes.completionRate,
                })}
              </p>
            )}
          </Card>
        </>
      ) : (
        <LockedInsight
          title={t("lockedAdvancedTitle")}
          planName={access.nextPlanName}
          what={[
            t("lockedAdvanced1"),
            t("lockedAdvanced2"),
            t("lockedAdvanced3"),
          ]}
        />
      )}

      {/* ── FULL ──────────────────────────────────────────────────────────── */}
      {full && demand && pricing && ratings ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title={t("whenTripsStart")}>
              <BarList
                items={demand.byWeekday.map((d) => ({
                  ...d,
                  label: t(d.labelKey),
                }))}
                format="number"
                emptyMessage={t("noPaidBookings")}
              />
              {demand.medianTripDays !== null && (
                <p className="mt-2 text-[11px] text-ink-faint">
                  {t("typicalTrip", { count: demand.medianTripDays })}
                </p>
              )}
            </Card>

            <Card title={t("howFarAhead")}>
              <BarList
                items={demand.byLeadTime.map((d) => ({
                  ...d,
                  label: t(d.labelKey),
                }))}
                format="number"
                emptyMessage={t("noPaidBookings")}
              />
            </Card>
          </div>

          <Card title={t("ratesAgainstMarket")}>
            {pricing.length === 0 ? (
              <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
                {t("addPricingToCompare")}
              </p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand text-left text-xs text-ink-faint">
                      <th className="pb-2 font-medium">{t("colCar")}</th>
                      <th className="pb-2 text-right font-medium">
                        {t("colYourRate")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("colTypicalRate")}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {t("colDifference")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {pricing.map((p) => (
                      <tr key={p.carId}>
                        <td className="py-2.5 text-xs font-medium text-ink">
                          {p.name}
                          <span className="block text-[10px] text-ink-faint">
                            {label("category", p.category)}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink">
                          {formatMoney(p.yourRate)}
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink-soft">
                          {p.marketMedian !== null
                            ? formatMoney(p.marketMedian)
                            : "—"}
                        </td>
                        <td className="py-2.5 text-right text-xs font-semibold">
                          {p.difference === null ? (
                            <span className="font-normal text-ink-faint">
                              {t("tooFewToCompare")}
                            </span>
                          ) : p.difference === 0 ? (
                            <span className="text-ink-soft">{t("atMarket")}</span>
                          ) : (
                            <span
                              className={
                                p.difference > 0
                                  ? "text-warning-strong"
                                  : "text-success"
                              }
                            >
                              {p.difference > 0 ? "+" : ""}
                              {p.difference}%
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              {t("marketRateExplainer")}
            </p>
          </Card>

          <Card title={t("whatClientsRate")}>
            {ratings.length === 0 ? (
              <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
                {t("noReviewsYetPeriod")}
              </p>
            ) : (
              <>
                <BarList
                  items={ratings.map((r) => ({
                    id: r.category,
                    label: t(`rating${r.category}` as never),
                    value: Math.round(r.average * 10) / 10,
                  }))}
                  format="rating"
                  emptyMessage={t("noData")}
                />
                <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-faint">
                  <Star className="h-3 w-3" />
                  {t("acrossReviews", { count: ratings[0].count })}
                </p>
              </>
            )}
          </Card>
        </>
      ) : (
        <LockedInsight
          title={t("lockedFullTitle")}
          planName={
            access.nextLevel === "FULL" ? access.nextPlanName : null
          }
          what={[
            t("lockedFull1"),
            t("lockedFull2"),
            t("lockedFull3"),
            t("lockedFull4"),
          ]}
        />
      )}

      {access.nextPlanName && (
        <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-ink-faint">
          <Sparkles className="h-3 w-3" />
          {t("moreWithPlan", { plan: access.nextPlanName })}
        </p>
      )}
    </div>
  );
}

/** Local card — the owner area doesn't share the admin chrome. */
function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}
