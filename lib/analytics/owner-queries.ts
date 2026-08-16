// =============================================================================
// ZuriDrive — Owner analytics
//
// The read side of the `analyticsLevel` plan benefit. Every query here is
// scoped to one owner's cars and answers a question that owner can act on.
//
// Earnings mean OWNER earnings — Commission.netOwnerAmount on completed trips.
// That is the figure the owner is actually paid, after the platform's cut, so
// it can never be confused with the gross the client paid.
//
// Depth is gated by plan:
//
//   BASIC     what happened      — earnings, trips, rating, earnings over time
//   ADVANCED  where it came from — per-car performance, booking outcomes
//   FULL      what to do next    — demand patterns, price position, ratings
//
// The gate lives in one place (getOwnerAnalyticsLevel + hasLevel) and the page
// asks it before running a query, so a locked section costs nothing to render.
// =============================================================================

// WHY THESE READ Booking AND NOT Commission
//
// "What did I earn?" and "what did the platform take?" are different questions
// with different sources.
//
// Owner earnings live on the Booking, as a snapshot fixed when the booking was
// made. Commission rows record the PLATFORM's cut — and in Phase 1 there is no
// cut, so no Commission rows are written at all (see app/api/bookings/route.ts).
// Sourcing owner analytics from Commission would therefore report zero earnings
// forever, for every owner, no matter how many trips they completed.
//
// Admin revenue analytics in lib/analytics/queries.ts still reads Commission,
// and correctly reports zero in Phase 1 — the platform really did earn nothing
// per trip. Its revenue is the owner subscriptions.

import { prisma } from "@/lib/db";
import { bucketSeries } from "@/lib/analytics/queries";

/** Plan depths, shallowest first. Mirrors SubscriptionPlan.analyticsLevel. */
export type AnalyticsLevel = "BASIC" | "ADVANCED" | "FULL";

const LEVEL_RANK: Record<AnalyticsLevel, number> = {
  BASIC: 0,
  ADVANCED: 1,
  FULL: 2,
};

/** True when `actual` reaches at least `required`. */
export function hasLevel(
  actual: AnalyticsLevel,
  required: AnalyticsLevel,
): boolean {
  return LEVEL_RANK[actual] >= LEVEL_RANK[required];
}

export interface OwnerAnalyticsAccess {
  level: AnalyticsLevel;
  /** The plan granting it, or null on the free tier. */
  planName: string | null;
  /** The cheapest plan that would unlock more, for the upsell. */
  nextLevel: AnalyticsLevel | null;
  nextPlanName: string | null;
}

/**
 * What depth of analytics this owner has.
 *
 * An owner with no active plan — or a lapsed one — falls back to BASIC rather
 * than to nothing. Their own earnings history is theirs; the plan buys the
 * analysis on top of it, not access to their own numbers.
 */
export async function getOwnerAnalyticsLevel(
  ownerProfileId: string,
): Promise<OwnerAnalyticsAccess> {
  const [subscription, plans] = await Promise.all([
    prisma.ownerSubscription.findFirst({
      where: { ownerId: ownerProfileId, status: { in: ["ACTIVE", "TRIAL"] } },
      include: { plan: true },
      orderBy: { startedAt: "desc" },
    }),
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    }),
  ]);

  const level = (subscription?.plan.analyticsLevel ?? "BASIC") as AnalyticsLevel;

  // The cheapest active plan that goes deeper than what they have now.
  const upgrade = plans.find(
    (p) => LEVEL_RANK[(p.analyticsLevel as AnalyticsLevel) ?? "BASIC"] > LEVEL_RANK[level],
  );

  return {
    level,
    planName: subscription?.plan.name ?? null,
    nextLevel: upgrade ? (upgrade.analyticsLevel as AnalyticsLevel) : null,
    nextPlanName: upgrade?.name ?? null,
  };
}

// ── BASIC ────────────────────────────────────────────────────────────────────

export interface OwnerHeadlines {
  earnings: number;
  earningsDelta: number | null;
  completedTrips: number;
  tripsDelta: number | null;
  avgRating: number | null;
  reviewCount: number;
  /** Requests accepted ÷ requests answered, as a percentage. */
  acceptanceRate: number | null;
  liveCars: number;
}

/** Percent change, or null when there's no baseline to compare against. */
function delta(now: number, before: number): number | null {
  return before > 0 ? Math.round(((now - before) / before) * 100) : null;
}

export async function getOwnerHeadlines(
  ownerProfileId: string,
  from: Date,
  previousFrom: Date,
): Promise<OwnerHeadlines> {
  const ownedCars = { car: { ownerId: ownerProfileId } };

  const [current, previous, reviews, answered, accepted, liveCars] =
    await Promise.all([
      prisma.booking.aggregate({
        _sum: { ownerEarnings: true },
        _count: true,
        where: { ...ownedCars, status: "COMPLETED", tripEndedAt: { gte: from } },
      }),
      prisma.booking.aggregate({
        _sum: { ownerEarnings: true },
        _count: true,
        where: {
          ...ownedCars,
          status: "COMPLETED",
          tripEndedAt: { gte: previousFrom, lt: from },
        },
      }),
      prisma.review.aggregate({
        _avg: { overallRating: true },
        _count: true,
        where: {
          car: { ownerId: ownerProfileId },
          isVisible: true,
          createdAt: { gte: from },
        },
      }),
      // A request the owner actually responded to — accepted or rejected.
      prisma.booking.count({
        where: {
          ...ownedCars,
          createdAt: { gte: from },
          OR: [
            { ownerConfirmedAt: { not: null } },
            { ownerRejectedAt: { not: null } },
          ],
        },
      }),
      prisma.booking.count({
        where: {
          ...ownedCars,
          createdAt: { gte: from },
          ownerConfirmedAt: { not: null },
        },
      }),
      prisma.car.count({
        where: { ownerId: ownerProfileId, status: "LIVE", isActive: true },
      }),
    ]);

  const earnings = current._sum.ownerEarnings ?? 0;

  return {
    earnings,
    earningsDelta: delta(earnings, previous._sum.ownerEarnings ?? 0),
    completedTrips: current._count,
    tripsDelta: delta(current._count, previous._count),
    avgRating: reviews._count > 0 ? (reviews._avg.overallRating ?? null) : null,
    reviewCount: reviews._count,
    acceptanceRate:
      answered > 0 ? Math.round((accepted / answered) * 100) : null,
    liveCars,
  };
}

/** The owner's own earnings over time, from completed trips. */
export async function getOwnerEarningsSeries(
  ownerProfileId: string,
  from: Date,
  bucket: "day" | "month",
) {
  const rows = await prisma.booking.findMany({
    where: {
      car: { ownerId: ownerProfileId },
      status: "COMPLETED",
      tripEndedAt: { gte: from },
    },
    select: { ownerEarnings: true, tripEndedAt: true },
  });

  return bucketSeries(
    rows
      .filter((r) => r.tripEndedAt)
      .map((r) => ({ date: r.tripEndedAt!, amount: r.ownerEarnings })),
    from,
    bucket,
  );
}

// ── ADVANCED ─────────────────────────────────────────────────────────────────

export interface CarPerformance {
  id: string;
  name: string;
  earnings: number;
  trips: number;
  /** Days this car was on a trip during the period. */
  bookedDays: number;
  /** bookedDays as a share of the days the car existed in the period. */
  utilisation: number;
  avgRating: number | null;
  isLive: boolean;
}

/**
 * Per-car performance.
 *
 * Utilisation is measured against the days the car was actually listed inside
 * the window, not the whole window — a car added last week shouldn't look idle
 * for the month before it existed.
 */
export async function getOwnerCarPerformance(
  ownerProfileId: string,
  from: Date,
): Promise<CarPerformance[]> {
  const now = new Date();

  const cars = await prisma.car.findMany({
    where: { ownerId: ownerProfileId },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      status: true,
      isActive: true,
      createdAt: true,
    },
  });

  if (cars.length === 0) return [];

  const carIds = cars.map((c) => c.id);

  const [completedBookings, trips, ratings] = await Promise.all([
    prisma.booking.findMany({
      where: {
        carId: { in: carIds },
        status: "COMPLETED",
        tripEndedAt: { gte: from },
      },
      select: { ownerEarnings: true, carId: true },
    }),
    // Any trip that overlapped the window counts toward booked days.
    prisma.booking.findMany({
      where: {
        carId: { in: carIds },
        status: { in: ["COMPLETED", "ACTIVE", "CONFIRMED"] },
        endDate: { gte: from },
      },
      select: { carId: true, startDate: true, endDate: true },
    }),
    prisma.review.groupBy({
      by: ["carId"],
      where: { carId: { in: carIds }, isVisible: true, createdAt: { gte: from } },
      _avg: { overallRating: true },
    }),
  ]);

  const earningsByCar = new Map<string, { earnings: number; trips: number }>();
  for (const b of completedBookings) {
    const existing = earningsByCar.get(b.carId) ?? { earnings: 0, trips: 0 };
    existing.earnings += b.ownerEarnings;
    existing.trips += 1;
    earningsByCar.set(b.carId, existing);
  }

  const DAY = 24 * 60 * 60 * 1000;
  const bookedDaysByCar = new Map<string, number>();
  for (const t of trips) {
    // Clip each trip to the window so a long trip that started before `from`
    // only contributes the days inside it.
    const start = t.startDate > from ? t.startDate : from;
    const end = t.endDate < now ? t.endDate : now;
    if (end <= start) continue;
    bookedDaysByCar.set(
      t.carId,
      (bookedDaysByCar.get(t.carId) ?? 0) + (end.getTime() - start.getTime()) / DAY,
    );
  }

  const ratingByCar = new Map(
    ratings.map((r) => [r.carId, r._avg.overallRating]),
  );

  return cars
    .map((car) => {
      const money = earningsByCar.get(car.id) ?? { earnings: 0, trips: 0 };
      const bookedDays = bookedDaysByCar.get(car.id) ?? 0;

      const listedFrom = car.createdAt > from ? car.createdAt : from;
      const availableDays = Math.max(
        1,
        (now.getTime() - listedFrom.getTime()) / DAY,
      );

      return {
        id: car.id,
        name: `${car.year} ${car.make} ${car.model}`,
        earnings: money.earnings,
        trips: money.trips,
        bookedDays: Math.round(bookedDays),
        utilisation: Math.min(100, Math.round((bookedDays / availableDays) * 100)),
        avgRating: ratingByCar.get(car.id) ?? null,
        isLive: car.status === "LIVE" && car.isActive,
      };
    })
    .sort((a, b) => b.earnings - a.earnings);
}

export interface BookingOutcomes {
  completed: number;
  cancelledByClient: number;
  rejectedByOwner: number;
  expiredUnpaid: number;
  /** Trips completed ÷ every booking that reached a conclusion. */
  completionRate: number | null;
}

/** Where bookings ended up — the leak report. */
export async function getOwnerBookingOutcomes(
  ownerProfileId: string,
  from: Date,
): Promise<BookingOutcomes> {
  const bookings = await prisma.booking.findMany({
    where: {
      car: { ownerId: ownerProfileId },
      createdAt: { gte: from },
    },
    select: {
      status: true,
      createdAt: true,
      ownerRejectedAt: true,
      paymentConfirmedAt: true,
    },
  });

  // A booking still awaiting payment is only "abandoned" once it's had a fair
  // chance. Anything newer is still in flight and is excluded entirely, so a
  // request made an hour ago never drags the completion rate down.
  const abandonedAfter = new Date(Date.now() - 24 * 60 * 60 * 1000);

  let completed = 0;
  let cancelledByClient = 0;
  let rejectedByOwner = 0;
  let expiredUnpaid = 0;

  // Order matters: a rejection is recorded as a CANCELLED booking with
  // ownerRejectedAt set, so the rejection test has to come first or every
  // rejection would be miscounted as a client cancellation.
  for (const b of bookings) {
    if (b.status === "COMPLETED") completed += 1;
    else if (b.ownerRejectedAt) rejectedByOwner += 1;
    else if (b.status === "CANCELLED") cancelledByClient += 1;
    else if (
      b.status === "PENDING_PAYMENT" &&
      !b.paymentConfirmedAt &&
      b.createdAt < abandonedAfter
    )
      expiredUnpaid += 1;
  }

  const concluded = completed + cancelledByClient + rejectedByOwner + expiredUnpaid;

  return {
    completed,
    cancelledByClient,
    rejectedByOwner,
    expiredUnpaid,
    completionRate:
      concluded > 0 ? Math.round((completed / concluded) * 100) : null,
  };
}

// ── FULL ─────────────────────────────────────────────────────────────────────

// Message keys, resolved by the page. See the note on RANGES in queries.ts.
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

export interface DemandPatterns {
  /** Trips starting on each weekday. */
  byWeekday: { id: string; labelKey: string; value: number }[];
  /** How far ahead clients book. */
  byLeadTime: { id: string; labelKey: string; value: number }[];
  /** Most common trip length, in days. */
  medianTripDays: number | null;
}

/**
 * When demand actually arrives — the input to a pricing or availability
 * decision. Only bookings that were paid for count; an abandoned request
 * says nothing about demand.
 */
export async function getOwnerDemandPatterns(
  ownerProfileId: string,
  from: Date,
): Promise<DemandPatterns> {
  const bookings = await prisma.booking.findMany({
    where: {
      car: { ownerId: ownerProfileId },
      createdAt: { gte: from },
      paymentConfirmedAt: { not: null },
    },
    select: { startDate: true, createdAt: true, totalDays: true },
  });

  const weekdayCounts = new Array(7).fill(0);
  const leadBuckets = { same: 0, week: 0, month: 0, beyond: 0 };
  const lengths: number[] = [];

  const DAY = 24 * 60 * 60 * 1000;

  for (const b of bookings) {
    weekdayCounts[b.startDate.getDay()] += 1;
    lengths.push(b.totalDays);

    const leadDays = (b.startDate.getTime() - b.createdAt.getTime()) / DAY;
    if (leadDays < 1) leadBuckets.same += 1;
    else if (leadDays < 7) leadBuckets.week += 1;
    else if (leadDays < 30) leadBuckets.month += 1;
    else leadBuckets.beyond += 1;
  }

  lengths.sort((a, b) => a - b);
  const medianTripDays =
    lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : null;

  return {
    // Monday-first — a rental week reads better that way than Sunday-first.
    byWeekday: [1, 2, 3, 4, 5, 6, 0].map((d) => ({
      id: WEEKDAYS[d],
      labelKey: WEEKDAYS[d],
      value: weekdayCounts[d],
    })),
    byLeadTime: [
      { id: "same", labelKey: "leadSame", value: leadBuckets.same },
      { id: "week", labelKey: "leadWeek", value: leadBuckets.week },
      { id: "month", labelKey: "leadMonth", value: leadBuckets.month },
      { id: "beyond", labelKey: "leadBeyond", value: leadBuckets.beyond },
    ],
    medianTripDays,
  };
}

export interface PricePosition {
  carId: string;
  name: string;
  category: string;
  yourRate: number;
  /** Median in-city daily rate across live cars in the same category. */
  marketMedian: number | null;
  /** How many other live cars the median is drawn from. */
  sampleSize: number;
  /** Percent above (+) or below (−) the market median. */
  difference: number | null;
}

/**
 * The owner's daily rate against the market for the same category.
 *
 * The median comes from LIVE listings other than their own, and is suppressed
 * below three comparators — a "market rate" drawn from one other car is noise,
 * and pricing advice from noise is worse than none.
 */
export async function getOwnerPricePosition(
  ownerProfileId: string,
): Promise<PricePosition[]> {
  const [ownCars, marketCars] = await Promise.all([
    prisma.car.findMany({
      where: { ownerId: ownerProfileId, pricing: { isNot: null } },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        category: true,
        pricing: { select: { perDayInCity: true } },
      },
    }),
    prisma.car.findMany({
      where: {
        ownerId: { not: ownerProfileId },
        status: "LIVE",
        isActive: true,
        pricing: { isNot: null },
      },
      select: {
        category: true,
        pricing: { select: { perDayInCity: true } },
      },
    }),
  ]);

  const byCategory = new Map<string, number[]>();
  for (const c of marketCars) {
    if (!c.pricing) continue;
    const list = byCategory.get(c.category) ?? [];
    list.push(c.pricing.perDayInCity);
    byCategory.set(c.category, list);
  }

  const MIN_SAMPLE = 3;

  return ownCars
    .filter((c) => c.pricing)
    .map((car) => {
      const rates = (byCategory.get(car.category) ?? []).sort((a, b) => a - b);
      const enough = rates.length >= MIN_SAMPLE;
      const median = enough ? rates[Math.floor(rates.length / 2)] : null;
      const yourRate = car.pricing!.perDayInCity;

      return {
        carId: car.id,
        name: `${car.year} ${car.make} ${car.model}`,
        // Raw enum value: the page runs it through the labeller.
        category: car.category,
        yourRate,
        marketMedian: median,
        sampleSize: rates.length,
        difference:
          median && median > 0
            ? Math.round(((yourRate - median) / median) * 100)
            : null,
      };
    });
}

export interface RatingBreakdown {
  category: string;
  average: number;
  count: number;
}

/**
 * The four rating categories separately.
 *
 * An owner sitting at 4.6 overall can't act on that number; seeing that
 * cleanliness is 4.9 and communication is 4.1 tells them exactly what to fix.
 */
export async function getOwnerRatingBreakdown(
  ownerProfileId: string,
  from: Date,
): Promise<RatingBreakdown[]> {
  const agg = await prisma.review.aggregate({
    _avg: {
      cleanlinessRating: true,
      comfortRating: true,
      valueRating: true,
      communicationRating: true,
    },
    _count: true,
    where: {
      car: { ownerId: ownerProfileId },
      isVisible: true,
      createdAt: { gte: from },
    },
  });

  if (agg._count === 0) return [];

  return [
    { category: "Cleanliness", average: agg._avg.cleanlinessRating ?? 0 },
    { category: "Comfort", average: agg._avg.comfortRating ?? 0 },
    { category: "Value", average: agg._avg.valueRating ?? 0 },
    { category: "Communication", average: agg._avg.communicationRating ?? 0 },
  ].map((r) => ({ ...r, count: agg._count }));
}
