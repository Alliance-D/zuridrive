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
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRWF, formatRWFCompact } from "@/lib/currency";
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
import LineChart from "@/components/charts/LineChart";
import BarList from "@/components/charts/BarList";
import { Metric, Delta, TableView } from "@/components/charts/pieces";
import LockedInsight from "@/components/owner/LockedInsight";
import { Star, Sparkles } from "lucide-react";

export const metadata = { title: "Analytics — ZuriDrive" };

export default async function OwnerAnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/owner/analytics");

  const profile = await prisma.carOwnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/owner/onboarding");

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
          <h1 className="text-xl font-bold text-ink">Analytics</h1>
          <p className="text-xs text-ink-soft">
            How your fleet is performing.
          </p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ink-soft shadow-sm">
          {access.planName ?? "Free tier"} ·{" "}
          {access.level === "FULL"
            ? "Full analytics"
            : access.level === "ADVANCED"
              ? "Advanced analytics"
              : "Basic analytics"}
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
            {r.label}
          </Link>
        ))}
        <span className="ml-2 text-[11px] text-ink-faint">
          since {range.from.toLocaleDateString("en-RW")}
        </span>
      </div>

      {/* Hero — the number an owner opens this page for */}
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-brand p-5 text-white shadow-sm lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-brand-tint">
            Your earnings
          </p>
          <p className="mt-1 text-[44px] font-bold leading-none">
            {formatRWF(headlines.earnings)}
          </p>
          <div className="mt-2">
            <Delta value={headlines.earningsDelta} onDark />
          </div>
          <p className="mt-3 text-[11px] text-brand-tint">
            After the platform commission — this is what you are paid.
          </p>
        </div>

        <Metric
          label="Completed trips"
          value={String(headlines.completedTrips)}
          delta={headlines.tripsDelta}
        />
        <Metric
          label="Average rating"
          value={
            headlines.avgRating !== null
              ? headlines.avgRating.toFixed(1)
              : "—"
          }
          hint={
            headlines.reviewCount > 0
              ? `${headlines.reviewCount} review${headlines.reviewCount === 1 ? "" : "s"} in this period`
              : "No reviews yet in this period"
          }
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric
          label="Request acceptance"
          value={
            headlines.acceptanceRate !== null
              ? `${headlines.acceptanceRate}%`
              : "—"
          }
          hint="Of the requests you responded to"
        />
        <Metric
          label="Cars listed"
          value={String(headlines.liveCars)}
          hint="Live and visible to clients right now"
        />
      </div>

      {/* Earnings over time — single series, so no legend; the title names it */}
      <Card
        title={`Earnings over time (${range.bucket === "day" ? "daily" : "monthly"})`}
      >
        <LineChart data={earnings} format="rwfCompact" />
        <TableView
          caption="Earnings by period"
          headers={["Period", "Your earnings"]}
          rows={earnings.map((p) => [p.label, formatRWF(p.value)])}
        />
      </Card>

      {/* ── ADVANCED ──────────────────────────────────────────────────────── */}
      {advanced && cars && outcomes ? (
        <>
          <Card title="How each car is doing">
            {cars.length === 0 ? (
              <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
                You haven&apos;t listed a car yet.
              </p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand text-left text-xs text-ink-faint">
                      <th className="pb-2 font-medium">Car</th>
                      <th className="pb-2 text-right font-medium">Trips</th>
                      <th className="pb-2 text-right font-medium">Days out</th>
                      <th className="pb-2 text-right font-medium">Used</th>
                      <th className="pb-2 text-right font-medium">Rating</th>
                      <th className="pb-2 text-right font-medium">Earnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {cars.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 text-xs font-medium text-ink">
                          {c.name}
                          {!c.isLive && (
                            <span className="ml-1.5 rounded-full bg-bone px-1.5 py-0.5 text-[10px] text-ink-faint">
                              not listed
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
                          {formatRWF(c.earnings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[11px] text-ink-faint">
              &ldquo;Used&rdquo; is the share of days the car was out on a trip,
              counted from the day you listed it.
            </p>
          </Card>

          <Card title="Where your bookings ended up">
            <BarList
              items={[
                {
                  id: "completed",
                  label: "Completed",
                  value: outcomes.completed,
                },
                {
                  id: "rejected",
                  label: "You declined",
                  value: outcomes.rejectedByOwner,
                },
                {
                  id: "cancelled",
                  label: "Client cancelled",
                  value: outcomes.cancelledByClient,
                },
                {
                  id: "unpaid",
                  label: "Never paid for",
                  value: outcomes.expiredUnpaid,
                },
              ]}
              format="number"
              emptyMessage="No bookings in this period."
            />
            {outcomes.completionRate !== null && (
              <p className="mt-2 text-[11px] text-ink-faint">
                {outcomes.completionRate}% of the bookings that reached a
                conclusion ended in a completed trip.
              </p>
            )}
          </Card>
        </>
      ) : (
        <LockedInsight
          title="Per-car performance and booking outcomes"
          planName={access.nextPlanName}
          what={[
            "Which of your cars earns most, and which sits idle",
            "How many days each car is actually out on trips",
            "Why bookings fall through — declined, cancelled, or never paid for",
          ]}
        />
      )}

      {/* ── FULL ──────────────────────────────────────────────────────────── */}
      {full && demand && pricing && ratings ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <Card title="When trips start">
              <BarList
                items={demand.byWeekday}
                format="number"
                emptyMessage="No paid bookings in this period."
              />
              {demand.medianTripDays !== null && (
                <p className="mt-2 text-[11px] text-ink-faint">
                  A typical trip runs {demand.medianTripDays} day
                  {demand.medianTripDays === 1 ? "" : "s"}.
                </p>
              )}
            </Card>

            <Card title="How far ahead clients book">
              <BarList
                items={demand.byLeadTime}
                format="number"
                emptyMessage="No paid bookings in this period."
              />
            </Card>
          </div>

          <Card title="Your rates against the market">
            {pricing.length === 0 ? (
              <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
                Add pricing to a car to see how it compares.
              </p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-sand text-left text-xs text-ink-faint">
                      <th className="pb-2 font-medium">Car</th>
                      <th className="pb-2 text-right font-medium">Your rate</th>
                      <th className="pb-2 text-right font-medium">
                        Typical rate
                      </th>
                      <th className="pb-2 text-right font-medium">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand">
                    {pricing.map((p) => (
                      <tr key={p.carId}>
                        <td className="py-2.5 text-xs font-medium text-ink">
                          {p.name}
                          <span className="block text-[10px] capitalize text-ink-faint">
                            {p.category}
                          </span>
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink">
                          {formatRWF(p.yourRate)}
                        </td>
                        <td className="py-2.5 text-right text-xs text-ink-soft">
                          {p.marketMedian !== null
                            ? formatRWF(p.marketMedian)
                            : "—"}
                        </td>
                        <td className="py-2.5 text-right text-xs font-semibold">
                          {p.difference === null ? (
                            <span className="font-normal text-ink-faint">
                              too few to compare
                            </span>
                          ) : p.difference === 0 ? (
                            <span className="text-ink-soft">at market</span>
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
              The typical rate is the middle in-city daily rate among other live
              cars in the same category. It is hidden below three comparable
              cars — a market rate drawn from one other listing is noise.
            </p>
          </Card>

          <Card title="What clients rate you on">
            {ratings.length === 0 ? (
              <p className="rounded-xl bg-bone px-4 py-8 text-center text-sm text-ink-soft">
                No reviews in this period yet.
              </p>
            ) : (
              <>
                <BarList
                  items={ratings.map((r) => ({
                    id: r.category,
                    label: r.category,
                    value: Math.round(r.average * 10) / 10,
                  }))}
                  format="rating"
                />
                <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-faint">
                  <Star className="h-3 w-3" />
                  Across {ratings[0].count} review
                  {ratings[0].count === 1 ? "" : "s"}. Your lowest score is the
                  one worth fixing first.
                </p>
              </>
            )}
          </Card>
        </>
      ) : (
        <LockedInsight
          title="Demand, pricing and rating detail"
          planName={
            access.nextLevel === "FULL" ? access.nextPlanName : null
          }
          what={[
            "Which days of the week your cars actually get booked",
            "How far in advance clients commit, so you can plan availability",
            "Whether your daily rate sits above or below comparable cars",
            "Your four rating categories separately, not one blended score",
          ]}
        />
      )}

      {access.nextPlanName && (
        <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-ink-faint">
          <Sparkles className="h-3 w-3" />
          More detail is included with {access.nextPlanName}.
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
