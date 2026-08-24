/**
 * /admin/analytics — read-only platform analytics
 *
 * Accessible to ANALYTICS_VIEWER (and super admins). There are no actions on
 * this page at all — it is a reporting surface, so the role that grants it
 * cannot change anything.
 *
 * "Revenue" here means platform commission on completed trips. Deposits and
 * owner earnings are shown separately and never folded in — the finance
 * ledgers are the source of truth and these figures must agree with them.
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdminModule } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/currency";
import {
  resolveRange,
  RANGES,
  getRevenueSeries,
  getBookingSeries,
  getFunnel,
  getTopCars,
  getOwnerLeaderboard,
  getHeadlines,
} from "@/lib/analytics/queries";
import { PageHeader, Card, EmptyRow } from "@/components/admin/ui";
import LineChart from "@/components/charts/LineChart";
import BarList from "@/components/charts/BarList";
import { Metric, Delta, TableView } from "@/components/charts/pieces";
import { Eye } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const ta = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${ta("analytics")} — ZuriDrive Admin` };
}

export default async function AdminAnalyticsPage({
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
  const ta = await getTranslations({ locale: params.locale, namespace: "admin" });
  await requireAdminModule("ANALYTICS_VIEWER");

  const range = resolveRange(searchParams.range);

  const [headlines, revenue, bookings, funnel, topCars, leaderboard] =
    await Promise.all([
      getHeadlines(range.from, range.previousFrom),
      getRevenueSeries(range.from, range.bucket),
      getBookingSeries(range.from, range.bucket),
      getFunnel(range.from),
      getTopCars(range.from),
      getOwnerLeaderboard(range.from),
    ]);

  const started = funnel[0]?.count ?? 0;
  const completed = funnel[funnel.length - 1]?.count ?? 0;
  const conversion = started > 0 ? Math.round((completed / started) * 100) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={ta("analytics")}
        subtitle={t("adminSub")}
      />

      {/* Range filter — one row above the charts */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/admin/analytics?range=${r.key}`}
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

      {/* Hero figure + supporting headlines */}
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-brand p-5 text-white shadow-sm lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-brand-tint">
            {t("platformRevenue")}
          </p>
          <p className="mt-1 text-[48px] font-bold leading-none">
            {formatMoney(headlines.revenue)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Delta
              value={headlines.revenueDelta}
              onDark
              noBaselineLabel={t("noPriorPeriod")}
            />
            <span className="text-xs text-brand-tint">
              {t("completedTripCount", {
                count: headlines.completedTrips,
              })}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-brand-tint">
            {t("commissionOnly")}
          </p>
        </div>

        <Metric
          label={t("ownerEarnings")}
          value={formatMoney(headlines.ownerEarnings)}
          hint={t("paidOrPayable")}
        />
        <Metric
          label={t("mrr")}
          value={formatMoney(headlines.mrr)}
          hint={t("activeSubCount", {
            count: headlines.activeSubscriptions,
          })}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Metric
          label={t("completedTrips")}
          value={String(headlines.completedTrips)}
          delta={headlines.tripsDelta}
          noBaselineLabel={t("noPriorPeriod")}
        />
        <Metric
          label={t("newUsers")}
          value={String(headlines.newUsers)}
          delta={headlines.usersDelta}
          noBaselineLabel={t("noPriorPeriod")}
        />
        <Metric
          label={t("bookingConversion")}
          value={conversion !== null ? `${conversion}%` : "—"}
          hint={t("startedToCompleted")}
        />
      </div>

      {/* Revenue over time — single series, no legend needed */}
      <Card
        title={
          range.bucket === "day"
            ? t("revenueOverTimeDaily")
            : t("revenueOverTimeMonthly")
        }
      >
        <LineChart data={revenue} format="rwfCompact" />
        <TableView
          tableLabel={t("viewAsTable")}
          caption={t("revenueByPeriod")}
          rows={revenue.map((p) => [p.label, formatMoney(p.value)])}
          headers={[t("colPeriod"), t("colCommission")]}
        />
      </Card>

      {/* Bookings over time */}
      <Card title={t("bookingsCreated")}>
        <LineChart
          data={bookings}
          format="number"
          height={180}
          area={false}
        />
        <TableView
          tableLabel={t("viewAsTable")}
          caption={t("bookingsByPeriod")}
          rows={bookings.map((p) => [p.label, String(p.value)])}
          headers={[t("colPeriod"), t("colBookings")]}
        />
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Funnel */}
        <Card title={t("bookingFunnel")}>
          <BarList
            items={funnel.map((f) => ({
              id: f.stage,
              label: t(f.stage),
              value: f.count,
              meta:
                started > 0
                  ? t("percentOfStarted", {
                      percent: Math.round((f.count / started) * 100),
                    })
                  : undefined,
            }))}
            format="number"
            emptyMessage={t("noBookingsStarted")}
          />
        </Card>

        {/* Top cars */}
        <Card title={t("topCars")}>
          <BarList
            items={topCars.map((c) => ({
              id: c.id,
              label: c.name,
              value: c.revenue,
              meta: t("tripCount", { count: c.trips }),
            }))}
            format="rwf"
            emptyMessage={t("noCompletedTrips")}
          />
        </Card>
      </div>

      {/* Owner leaderboard — a table, because it's identity plus several
          measures, which a chart would flatten */}
      <Card title={t("ownerLeaderboard")}>
        {leaderboard.length === 0 ? (
          <EmptyRow>{t("noOwnerEarnings")}</EmptyRow>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">{t("colOwner")}</th>
                  <th className="pb-2 text-right font-medium">{t("colTrips")}</th>
                  <th className="pb-2 text-right font-medium">{t("colCars")}</th>
                  <th className="pb-2 text-right font-medium">
                    {t("colEarnings")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand">
                {leaderboard.map((o, i) => (
                  <tr key={o.id}>
                    <td className="py-2.5 text-xs text-ink-faint">{i + 1}</td>
                    <td className="py-2.5 text-xs font-medium text-ink">
                      {o.name}
                    </td>
                    <td className="py-2.5 text-right text-xs text-ink-soft">
                      {o.trips}
                    </td>
                    <td className="py-2.5 text-right text-xs text-ink-soft">
                      {o.cars}
                    </td>
                    <td className="py-2.5 text-right text-xs font-semibold text-brand">
                      {formatMoney(o.earnings)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="flex items-center justify-center gap-1.5 pb-2 text-[11px] text-ink-faint">
        <Eye className="h-3 w-3" />
        {t("readOnlyNote")}
      </p>
    </div>
  );
}
