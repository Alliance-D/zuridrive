// =============================================================================
// ZuriDrive — Subscription limits and plan benefits
//
// The single place that answers "what is this owner entitled to?".
//
// Two things live here because they must never disagree:
//   • the ALLOWANCE check, used to stop a listing being created
//   • the PLAN STATE sync, which denormalises searchPriority and the verified
//     badge onto CarOwnerProfile so listings can be ordered in SQL
//
// Every plan benefit is enforced somewhere real. Where each one lives:
//
//   maxListings         here — getOwnerAllowance() and enforceListingLimit()
//   featuredPriority    CarOwnerProfile.searchPriority, ordered in SQL
//   hasVerifiedBadge    CarOwnerProfile.hasVerifiedBadge, on listing cards
//   hasHomepageBanner   getBannerEligibleOwnerIds(), used by the homepage
//   analyticsLevel      lib/analytics/owner-queries.ts → /owner/analytics
//   hasPrioritySupport  lib/support.ts → the first-response target and queue
//
// If a benefit is ever added to SubscriptionPlan, it belongs on this list with
// somewhere to point at — a benefit nobody enforces is a promise to a paying
// owner that the platform quietly breaks.
// =============================================================================

import { prisma } from "@/lib/db";
import { getPlatformSettings } from "@/lib/platform-settings";
import type { Prisma, PrismaClient, SubscriptionPlan } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Search priority by tier. Lower sorts first. */
const PRIORITY_BY_TIER: Record<string, number> = {
  PREMIUM: 1,
  PRO: 2,
  BASIC: 3,
};

/** Owners with no active plan sort last. */
const DEFAULT_PRIORITY = 3;

/**
 * Why an owner can't list another car, as data rather than as a sentence.
 *
 * This used to be a ready-made English string. That reads well until the page
 * around it is in Kinyarwanda and the one line explaining why the button is
 * disabled is still in English — and there is nothing the page can do about it,
 * because by then the sentence is already built. Returning the key and its
 * numbers lets each caller render it in its own locale.
 */
export type AllowanceReason =
  | { key: "planLapsed"; plan: string; max: number }
  | { key: "chooseAPlan"; max: number }
  | { key: "planCovers"; plan: string; max: number };

export interface OwnerAllowance {
  /** The active plan, or null when there isn't one. */
  plan: SubscriptionPlan | null;
  status: "ACTIVE" | "TRIAL" | "LAPSED" | "NONE";
  /** null means unlimited. */
  maxListings: number | null;
  /** Cars that count against the limit. */
  used: number;
  /** null when unlimited. */
  remaining: number | null;
  canListMore: boolean;
  /** Why not, when canListMore is false. */
  reason: AllowanceReason | null;
}

/**
 * English rendering of an allowance reason, for contexts with no locale —
 * the JSON API, logs. UI should translate the key instead.
 */
export function formatAllowanceReason(reason: AllowanceReason): string {
  const cars = (n: number) => `${n} car${n === 1 ? "" : "s"}`;
  switch (reason.key) {
    case "planLapsed":
      return `Your ${reason.plan} plan has lapsed. Renew it to list more than ${cars(reason.max)}.`;
    case "chooseAPlan":
      return `Choose a plan to list more than ${cars(reason.max)}.`;
    case "planCovers":
      return `Your ${reason.plan} plan covers ${cars(reason.max)}. Upgrade to list more.`;
  }
}

/**
 * What this owner may currently do.
 *
 * Pass `db` when calling inside a transaction. Reading through the global
 * client from within one returns pre-transaction state, which silently
 * computes the allowance from the plan the owner had a moment ago.
 *
 * SUSPENDED cars still count against the limit — an owner can't dodge their
 * cap by getting a listing suspended. Only a listing that no longer exists
 * frees a slot.
 */
export async function getOwnerAllowance(
  ownerProfileId: string,
  db: Db = prisma,
): Promise<OwnerAllowance> {
  const [subscription, used, settings] = await Promise.all([
    db.ownerSubscription.findFirst({
      where: { ownerId: ownerProfileId },
      include: { plan: true },
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    }),
    db.car.count({ where: { ownerId: ownerProfileId } }),
    getPlatformSettings(),
  ]);

  const isLive =
    subscription?.status === "ACTIVE" || subscription?.status === "TRIAL";

  // No active plan — the free-tier allowance applies, whether that's because
  // they never subscribed or because their plan lapsed.
  if (!subscription || !isLive) {
    const maxListings = settings.freeTierMaxListings;
    const remaining = Math.max(0, maxListings - used);

    return {
      plan: subscription?.plan ?? null,
      status: subscription ? (subscription.status as "LAPSED") : "NONE",
      maxListings,
      used,
      remaining,
      canListMore: remaining > 0,
      reason:
        remaining > 0
          ? null
          : subscription
            ? {
                key: "planLapsed",
                plan: subscription.plan.name,
                max: maxListings,
              }
            : { key: "chooseAPlan", max: maxListings },
    };
  }

  const maxListings = subscription.plan.maxListings; // null = unlimited
  const remaining = maxListings === null ? null : Math.max(0, maxListings - used);

  return {
    plan: subscription.plan,
    status: subscription.status as "ACTIVE" | "TRIAL",
    maxListings,
    used,
    remaining,
    canListMore: remaining === null || remaining > 0,
    reason:
      remaining !== null && remaining <= 0
        ? {
            key: "planCovers",
            plan: subscription.plan.name,
            max: maxListings!,
          }
        : null,
  };
}

/**
 * Recomputes the denormalised plan state on CarOwnerProfile.
 *
 * Call this whenever a subscription starts, changes, renews or lapses.
 * Everything it writes is derived — it never invents state.
 */
export async function syncOwnerPlanState(
  db: Db,
  ownerProfileId: string,
): Promise<{ searchPriority: number; hasVerifiedBadge: boolean }> {
  const subscription = await db.ownerSubscription.findFirst({
    where: { ownerId: ownerProfileId, status: { in: ["ACTIVE", "TRIAL"] } },
    include: { plan: true },
    orderBy: { startedAt: "desc" },
  });

  // A lapsed or absent plan drops the owner to standard placement with no
  // badge. Their listings stay live — only the perks stop.
  const searchPriority = subscription
    ? (subscription.plan.featuredPriority ??
       PRIORITY_BY_TIER[subscription.plan.tier] ??
       DEFAULT_PRIORITY)
    : DEFAULT_PRIORITY;

  const hasVerifiedBadge = subscription?.plan.hasVerifiedBadge ?? false;

  await db.carOwnerProfile.update({
    where: { id: ownerProfileId },
    data: { searchPriority, hasVerifiedBadge },
  });

  return { searchPriority, hasVerifiedBadge };
}

/**
 * True when the owner's plan grants a homepage banner slot.
 * Used by the homepage to decide which cars to surface.
 */
export async function getBannerEligibleOwnerIds(): Promise<string[]> {
  const subs = await prisma.ownerSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIAL"] },
      plan: { hasHomepageBanner: true },
    },
    select: { ownerId: true },
  });
  return subs.map((s) => s.ownerId);
}

/** Bookings that mean a car must stay listed no matter what. */
const LIVE_BOOKING_STATUSES = [
  "PAYMENT_CONFIRMED",
  "AWAITING_OWNER_CONFIRMATION",
  "CONFIRMED",
  "ACTIVE",
] as const;

/**
 * Brings an owner's live listings down to what their plan allows.
 *
 * Called when a subscription lapses. The rules, in order:
 *
 *  1. A car with an active or upcoming booking is NEVER unlisted. Someone has
 *     paid for that trip; taking the listing offline would strand them.
 *  2. Beyond those, the newest listings are kept up to the allowance —
 *     an owner who just added a car is most likely to still want it.
 *  3. Everything else is deactivated (isActive = false), NOT suspended.
 *     Suspension is an admin penalty with a reason attached; this is a plan
 *     consequence the owner can undo by renewing.
 *
 * Marks each one with unlistedByPlanAt so relistAfterRenewal() can put back
 * exactly these, and not the cars the owner paused themselves.
 */
export async function enforceListingLimit(
  db: Db,
  ownerProfileId: string,
  maxListings: number,
): Promise<{ unlisted: number; protectedByBooking: number }> {
  const cars = await db.car.findMany({
    where: { ownerId: ownerProfileId, status: "LIVE", isActive: true },
    select: {
      id: true,
      createdAt: true,
      _count: {
        select: {
          bookings: { where: { status: { in: [...LIVE_BOOKING_STATUSES] } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const withBookings = cars.filter((c) => c._count.bookings > 0);
  const withoutBookings = cars.filter((c) => c._count.bookings === 0);

  // Booked cars occupy allowance slots first — they cannot be touched.
  const slotsLeft = Math.max(0, maxListings - withBookings.length);
  const toUnlist = withoutBookings.slice(slotsLeft);

  if (toUnlist.length > 0) {
    await db.car.updateMany({
      where: { id: { in: toUnlist.map((c) => c.id) } },
      data: { isActive: false, unlistedByPlanAt: new Date() },
    });
  }

  return {
    unlisted: toUnlist.length,
    protectedByBooking: withBookings.length,
  };
}

/**
 * THE entry point for "this owner's plan changed".
 *
 * Call this after anything that starts, renews, upgrades, downgrades, cancels
 * or lapses a subscription. It works out which direction the change went and
 * applies the consequence, so no caller has to reason about it:
 *
 *   more room than they're using  → put back what a lapse took offline
 *   fewer listings than they have → bring them down to the new allowance
 *
 * Having one function means an upgrade and a downgrade can't drift apart, and
 * a new payment path can't forget half the work.
 */
export async function applyPlanChange(
  db: Db,
  ownerProfileId: string,
): Promise<{
  searchPriority: number;
  hasVerifiedBadge: boolean;
  relisted: number;
  unlisted: number;
  /** Cars kept live despite the allowance, because a trip depends on them. */
  protectedByBooking: number;
}> {
  const { searchPriority, hasVerifiedBadge } = await syncOwnerPlanState(
    db,
    ownerProfileId,
  );

  const allowance = await getOwnerAllowance(ownerProfileId, db);

  // Unlimited, or still inside the allowance — nothing to take away, and
  // anything a previous lapse unlisted can come back.
  if (allowance.maxListings === null) {
    const relisted = await relistAfterRenewal(db, ownerProfileId);
    return {
      searchPriority,
      hasVerifiedBadge,
      relisted,
      unlisted: 0,
      protectedByBooking: 0,
    };
  }

  const liveCount = await db.car.count({
    where: { ownerId: ownerProfileId, status: "LIVE", isActive: true },
  });

  // Downgrade or lapse — they're over the line, so bring them down.
  if (liveCount > allowance.maxListings) {
    const { unlisted, protectedByBooking } = await enforceListingLimit(
      db,
      ownerProfileId,
      allowance.maxListings,
    );
    return {
      searchPriority,
      hasVerifiedBadge,
      relisted: 0,
      unlisted,
      protectedByBooking,
    };
  }

  const relisted = await relistAfterRenewal(db, ownerProfileId);
  return {
    searchPriority,
    hasVerifiedBadge,
    relisted,
    unlisted: 0,
    protectedByBooking: 0,
  };
}

/**
 * Puts back the cars a lapsed plan took offline, up to the new allowance.
 * Only touches cars carrying unlistedByPlanAt — anything the owner paused
 * themselves stays paused.
 *
 * Reached through applyPlanChange() rather than called directly, so the
 * opposite case (a downgrade that needs cars taken down) can't be skipped.
 */
export async function relistAfterRenewal(
  db: Db,
  ownerProfileId: string,
): Promise<number> {
  const allowance = await getOwnerAllowance(ownerProfileId, db);

  const activeCount = await db.car.count({
    where: { ownerId: ownerProfileId, status: "LIVE", isActive: true },
  });

  const room =
    allowance.maxListings === null
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, allowance.maxListings - activeCount);

  if (room === 0) return 0;

  const candidates = await db.car.findMany({
    where: {
      ownerId: ownerProfileId,
      isActive: false,
      unlistedByPlanAt: { not: null },
    },
    select: { id: true },
    orderBy: { unlistedByPlanAt: "desc" },
    take: room === Number.MAX_SAFE_INTEGER ? undefined : room,
  });

  if (candidates.length === 0) return 0;

  await db.car.updateMany({
    where: { id: { in: candidates.map((c) => c.id) } },
    data: { isActive: true, unlistedByPlanAt: null },
  });

  return candidates.length;
}
