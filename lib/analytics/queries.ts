// =============================================================================
// ZuriDrive — Analytics queries
//
// Read-only aggregation for /admin/analytics.
//
// Revenue means PLATFORM revenue: commission on completed trips, from the
// Commission ledger. It deliberately excludes deposits (client money held in
// trust) and owner earnings (money owed out), so the figure here can't be
// confused with cash collected.
// =============================================================================

import { prisma } from "@/lib/db";

export type RangeKey = "7d" | "30d" | "90d" | "12m";

// labelKey, not label: this is evaluated at import, where no translator
// exists. The page resolves it against the `analytics` namespace at render.
export const RANGES: { key: RangeKey; labelKey: string; days: number }[] = [
  { key: "7d", labelKey: "range7d", days: 7 },
  { key: "30d", labelKey: "range30d", days: 30 },
  { key: "90d", labelKey: "range90d", days: 90 },
  { key: "12m", labelKey: "range12m", days: 365 },
];

export function resolveRange(key: string | undefined): {
  key: RangeKey;
  days: number;
  from: Date;
  /** Same length immediately before `from`, for period-on-period comparison. */
  previousFrom: Date;
  /** Bucket width — daily for short ranges, monthly for a year. */
  bucket: "day" | "month";
} {
  const match = RANGES.find((r) => r.key === key) ?? RANGES[1];
  const from = new Date(Date.now() - match.days * 24 * 60 * 60 * 1000);
  const previousFrom = new Date(
    from.getTime() - match.days * 24 * 60 * 60 * 1000,
  );
  return {
    key: match.key,
    days: match.days,
    from,
    previousFrom,
    bucket: match.days > 90 ? "month" : "day",
  };
}

export interface TimePoint {
  /** ISO date at the start of the bucket. */
  date: string;
  label: string;
  value: number;
}

/** Groups dated amounts into day or month buckets, filling gaps with zero. */
export function bucketSeries(
  rows: { date: Date; amount: number }[],
  from: Date,
  bucket: "day" | "month",
): TimePoint[] {
  const buckets = new Map<string, number>();

  // Seed every bucket so gaps render as zero rather than disappearing —
  // a missing day must not look like a shorter month.
  const cursor = new Date(from);
  const now = new Date();
  if (bucket === "day") {
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= now) {
      buckets.set(cursor.toISOString().slice(0, 10), 0);
      cursor.setDate(cursor.getDate() + 1);
    }
  } else {
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    while (cursor <= now) {
      buckets.set(cursor.toISOString().slice(0, 7), 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  for (const row of rows) {
    const key =
      bucket === "day"
        ? row.date.toISOString().slice(0, 10)
        : row.date.toISOString().slice(0, 7);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + row.amount);
    }
  }

  return [...buckets.entries()].map(([key, value]) => ({
    date: key,
    label:
      bucket === "day"
        ? new Date(key).toLocaleDateString("en-RW", {
            day: "numeric",
            month: "short",
          })
        : new Date(key + "-01").toLocaleDateString("en-RW", {
            month: "short",
            year: "2-digit",
          }),
    value,
  }));
}

/** Platform commission on completed trips, over time. */
export async function getRevenueSeries(from: Date, bucket: "day" | "month") {
  const rows = await prisma.commission.findMany({
    where: { booking: { status: "COMPLETED", tripEndedAt: { gte: from } } },
    select: { commissionAmount: true, booking: { select: { tripEndedAt: true } } },
  });

  return bucketSeries(
    rows
      .filter((r) => r.booking.tripEndedAt)
      .map((r) => ({ date: r.booking.tripEndedAt!, amount: r.commissionAmount })),
    from,
    bucket,
  );
}

/** Bookings created over time. */
export async function getBookingSeries(from: Date, bucket: "day" | "month") {
  const rows = await prisma.booking.findMany({
    where: { createdAt: { gte: from } },
    select: { createdAt: true },
  });

  return bucketSeries(
    rows.map((r) => ({ date: r.createdAt, amount: 1 })),
    from,
    bucket,
  );
}

/**
 * Booking funnel. Every booking that reached a stage counts, including ones
 * that went further — so the numbers only ever decrease down the funnel.
 */
export async function getFunnel(from: Date) {
  const bookings = await prisma.booking.findMany({
    where: { createdAt: { gte: from } },
    select: { status: true, paymentConfirmedAt: true, ownerConfirmedAt: true },
  });

  const created = bookings.length;
  const paid = bookings.filter((b) => b.paymentConfirmedAt !== null).length;
  const confirmed = bookings.filter((b) => b.ownerConfirmedAt !== null).length;
  const completed = bookings.filter((b) => b.status === "COMPLETED").length;

  // Stage keys, resolved by the page — see the note on RANGES.
  return [
    { stage: "funnelStarted", count: created },
    { stage: "funnelPaid", count: paid },
    { stage: "funnelAccepted", count: confirmed },
    { stage: "funnelCompleted", count: completed },
  ];
}

/** Cars ranked by platform commission earned in the period. */
export async function getTopCars(from: Date, limit = 8) {
  const rows = await prisma.commission.findMany({
    where: { booking: { status: "COMPLETED", tripEndedAt: { gte: from } } },
    select: {
      commissionAmount: true,
      netOwnerAmount: true,
      booking: {
        select: {
          car: { select: { id: true, make: true, model: true, year: true } },
        },
      },
    },
  });

  const byCar = new Map<
    string,
    { id: string; name: string; revenue: number; trips: number }
  >();

  for (const r of rows) {
    const car = r.booking.car;
    const existing = byCar.get(car.id);
    if (existing) {
      existing.revenue += r.commissionAmount;
      existing.trips += 1;
    } else {
      byCar.set(car.id, {
        id: car.id,
        name: `${car.year} ${car.make} ${car.model}`,
        revenue: r.commissionAmount,
        trips: 1,
      });
    }
  }

  return [...byCar.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** Owners ranked by their own earnings in the period. */
export async function getOwnerLeaderboard(from: Date, limit = 10) {
  const rows = await prisma.commission.findMany({
    where: { booking: { status: "COMPLETED", tripEndedAt: { gte: from } } },
    select: {
      netOwnerAmount: true,
      booking: {
        select: {
          car: {
            select: {
              owner: {
                select: {
                  id: true,
                  user: { select: { name: true } },
                  _count: { select: { cars: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  const byOwner = new Map<
    string,
    { id: string; name: string; earnings: number; trips: number; cars: number }
  >();

  for (const r of rows) {
    const owner = r.booking.car.owner;
    const existing = byOwner.get(owner.id);
    if (existing) {
      existing.earnings += r.netOwnerAmount;
      existing.trips += 1;
    } else {
      byOwner.set(owner.id, {
        id: owner.id,
        name: owner.user.name ?? "Owner",
        earnings: r.netOwnerAmount,
        trips: 1,
        cars: owner._count.cars,
      });
    }
  }

  return [...byOwner.values()]
    .sort((a, b) => b.earnings - a.earnings)
    .slice(0, limit);
}

/** Headline totals for the period, with the previous period for comparison. */
export async function getHeadlines(from: Date, previousFrom: Date) {
  const [current, previous, activeSubs, newUsers, previousUsers] =
    await Promise.all([
      prisma.commission.aggregate({
        _sum: { commissionAmount: true, netOwnerAmount: true },
        _count: true,
        where: { booking: { status: "COMPLETED", tripEndedAt: { gte: from } } },
      }),
      prisma.commission.aggregate({
        _sum: { commissionAmount: true },
        _count: true,
        where: {
          booking: {
            status: "COMPLETED",
            tripEndedAt: { gte: previousFrom, lt: from },
          },
        },
      }),
      prisma.ownerSubscription.findMany({
        where: { status: "ACTIVE" },
        select: { plan: { select: { priceMonthly: true } } },
      }),
      prisma.user.count({
        where: { createdAt: { gte: from }, role: { in: ["CLIENT", "OWNER"] } },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: previousFrom, lt: from },
          role: { in: ["CLIENT", "OWNER"] },
        },
      }),
    ]);

  const revenue = current._sum.commissionAmount ?? 0;
  const previousRevenue = previous._sum.commissionAmount ?? 0;
  const mrr = activeSubs.reduce((s, x) => s + x.plan.priceMonthly, 0);

  /** Percent change, or null when there's no baseline to compare against. */
  const delta = (now: number, before: number) =>
    before > 0 ? Math.round(((now - before) / before) * 100) : null;

  return {
    revenue,
    revenueDelta: delta(revenue, previousRevenue),
    ownerEarnings: current._sum.netOwnerAmount ?? 0,
    completedTrips: current._count,
    tripsDelta: delta(current._count, previous._count),
    mrr,
    activeSubscriptions: activeSubs.length,
    newUsers,
    usersDelta: delta(newUsers, previousUsers),
  };
}
