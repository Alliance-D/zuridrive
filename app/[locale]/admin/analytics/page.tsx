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

import Link from "next/link";
import { requireAdminModule } from "@/lib/auth";
import { formatRWF, formatRWFCompact } from "@/lib/currency";
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

export const metadata = { title: "Analytics — ZuriDrive Admin" };

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
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
        title="Analytics"
        subtitle="Platform performance. Read-only."
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
            {r.label}
          </Link>
        ))}
        <span className="ml-2 text-[11px] text-ink-faint">
          since {range.from.toLocaleDateString("en-RW")}
        </span>
      </div>

      {/* Hero figure + supporting headlines */}
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl bg-brand p-5 text-white shadow-sm lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-brand-tint">
            Platform revenue
          </p>
          <p className="mt-1 text-[48px] font-bold leading-none">
            {formatRWF(headlines.revenue)}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <Delta value={headlines.revenueDelta} onDark />
            <span className="text-xs text-brand-tint">
              {headlines.completedTrips} completed trip
              {headlines.completedTrips === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-3 text-[11px] text-brand-tint">
            Commission only — excludes deposits and owner earnings.
          </p>
        </div>

        <Metric
          label="Owner earnings"
          value={formatRWF(headlines.ownerEarnings)}
          hint="Paid or payable to owners"
        />
        <Metric
          label="MRR"
          value={formatRWF(headlines.mrr)}
          hint={`${headlines.activeSubscriptions} active subscription${headlines.activeSubscriptions === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Metric
          label="Completed trips"
          value={String(headlines.completedTrips)}
          delta={headlines.tripsDelta}
        />
        <Metric
          label="New users"
          value={String(headlines.newUsers)}
          delta={headlines.usersDelta}
        />
        <Metric
          label="Booking conversion"
          value={conversion !== null ? `${conversion}%` : "—"}
          hint="Started → completed"
        />
      </div>

      {/* Revenue over time — single series, no legend needed */}
      <Card title={`Revenue over time (${range.bucket === "day" ? "daily" : "monthly"})`}>
        <LineChart data={revenue} format="rwfCompact" />
        <TableView
          caption="Revenue by period"
          rows={revenue.map((p) => [p.label, formatRWF(p.value)])}
          headers={["Period", "Commission"]}
        />
      </Card>

      {/* Bookings over time */}
      <Card title="Bookings created">
        <LineChart
          data={bookings}
          format="number"
          height={180}
          area={false}
        />
        <TableView
          caption="Bookings by period"
          rows={bookings.map((p) => [p.label, String(p.value)])}
          headers={["Period", "Bookings"]}
        />
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Funnel */}
        <Card title="Booking funnel">
          <BarList
            items={funnel.map((f) => ({
              id: f.stage,
              label: f.stage,
              value: f.count,
              meta:
                started > 0
                  ? `${Math.round((f.count / started) * 100)}% of started`
                  : undefined,
            }))}
            format="number"
            emptyMessage="No bookings started in this period."
          />
        </Card>

        {/* Top cars */}
        <Card title="Top performing cars">
          <BarList
            items={topCars.map((c) => ({
              id: c.id,
              label: c.name,
              value: c.revenue,
              meta: `${c.trips} trip${c.trips === 1 ? "" : "s"}`,
            }))}
            format="rwf"
            emptyMessage="No completed trips in this period."
          />
        </Card>
      </div>

      {/* Owner leaderboard — a table, because it's identity plus several
          measures, which a chart would flatten */}
      <Card title="Owner leaderboard">
        {leaderboard.length === 0 ? (
          <EmptyRow>No owner earnings in this period.</EmptyRow>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand text-left text-xs text-ink-faint">
                  <th className="pb-2 font-medium">#</th>
                  <th className="pb-2 font-medium">Owner</th>
                  <th className="pb-2 text-right font-medium">Trips</th>
                  <th className="pb-2 text-right font-medium">Cars</th>
                  <th className="pb-2 text-right font-medium">Earnings</th>
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
                      {formatRWF(o.earnings)}
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
        This page is read-only — nothing here changes any record.
      </p>
    </div>
  );
}
