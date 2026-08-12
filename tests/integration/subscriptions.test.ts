/**
 * Subscription entitlements and lifecycle.
 *
 * Two things get protected here:
 *
 *  • A PENDING_PAYMENT or LAPSED plan grants NOTHING. Every benefit check looks
 *    for ACTIVE or TRIAL, and if one ever stops doing so an owner gets paid
 *    features they have not paid for.
 *  • A car with an active or upcoming booking is never unlisted, whatever the
 *    allowance says. Someone has paid for that trip.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import {
  makeClient,
  makeOwner,
  makeCar,
  paidBooking,
  makePlans,
  makeSettings,
} from "../helpers/factories";
import {
  getOwnerAllowance,
  applyPlanChange,
  enforceListingLimit,
  relistAfterRenewal,
  getBannerEligibleOwnerIds,
} from "@/lib/subscriptions/limits";
import {
  beginSubscriptionPurchase,
  activateSubscription,
} from "@/lib/subscriptions/checkout";
import { getOwnerAnalyticsLevel, hasLevel } from "@/lib/analytics/owner-queries";
import { resolvePriority, FIRST_RESPONSE_HOURS } from "@/lib/support";

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

async function ownerOn(tier: "none" | "BASIC" | "PRO" | "PREMIUM", cars = 1) {
  const plans = await makePlans();
  const owner = await makeOwner();
  for (let i = 0; i < cars; i++) await makeCar(owner.profile.id);

  if (tier !== "none") {
    const plan = plans.all.find((p) => p.tier === tier)!;
    await prisma.ownerSubscription.create({
      data: {
        ownerId: owner.profile.id,
        planId: plan.id,
        status: "ACTIVE",
        expiresAt: new Date(Date.now() + 30 * 864e5),
      },
    });
  }

  return { ...owner, plans };
}

describe("allowance", () => {
  it("falls back to the free tier with no plan", async () => {
    const { profile } = await ownerOn("none", 1);
    const allowance = await getOwnerAllowance(profile.id);

    expect(allowance.status).toBe("NONE");
    expect(allowance.maxListings).toBe(1);
    expect(allowance.canListMore).toBe(false);
  });

  it("uses the plan's limit when active", async () => {
    const { profile } = await ownerOn("BASIC", 1);
    const allowance = await getOwnerAllowance(profile.id);

    expect(allowance.maxListings).toBe(2);
    expect(allowance.remaining).toBe(1);
    expect(allowance.canListMore).toBe(true);
  });

  it("treats Premium as unlimited", async () => {
    const { profile } = await ownerOn("PREMIUM", 25);
    const allowance = await getOwnerAllowance(profile.id);

    expect(allowance.maxListings).toBeNull();
    expect(allowance.remaining).toBeNull();
    expect(allowance.canListMore).toBe(true);
  });

  it("counts suspended cars against the limit", async () => {
    const { profile } = await ownerOn("BASIC", 1);
    await makeCar(profile.id, { status: "SUSPENDED" });

    const allowance = await getOwnerAllowance(profile.id);
    // An owner cannot dodge their cap by getting a listing suspended.
    expect(allowance.used).toBe(2);
    expect(allowance.canListMore).toBe(false);
  });

  it("grants nothing while a payment is pending", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    await makeCar(profile.id);

    await beginSubscriptionPurchase(profile.id, plans.premium.id, "BANK_TRANSFER");

    const allowance = await getOwnerAllowance(profile.id);
    expect(allowance.maxListings).toBe(1); // still the free tier
  });
});

describe("benefits follow the plan", () => {
  const cases = [
    ["none", "BASIC", false, 3, false],
    ["BASIC", "BASIC", false, 3, false],
    ["PRO", "ADVANCED", false, 2, true],
    ["PREMIUM", "FULL", true, 1, true],
  ] as const;

  for (const [tier, analytics, priority, searchPriority, badge] of cases) {
    it(`${tier}: analytics=${analytics} priority=${priority}`, async () => {
      const { profile, user } = await ownerOn(tier, 1);
      await applyPlanChange(prisma, profile.id);

      expect((await getOwnerAnalyticsLevel(profile.id)).level).toBe(analytics);
      expect((await resolvePriority(user.id)).isPriority).toBe(priority);

      const after = await prisma.carOwnerProfile.findUniqueOrThrow({
        where: { id: profile.id },
      });
      expect(after.searchPriority).toBe(searchPriority);
      expect(after.hasVerifiedBadge).toBe(badge);
    });
  }

  it("gives priority owners a shorter response target", async () => {
    const { user } = await ownerOn("PREMIUM", 1);
    const decision = await resolvePriority(user.id);

    expect(decision.isPriority).toBe(true);
    const hours = Math.round((decision.firstResponseDueAt.getTime() - Date.now()) / 36e5);
    expect(hours).toBe(FIRST_RESPONSE_HOURS.priority);
  });

  it("orders analytics levels correctly", () => {
    expect(hasLevel("FULL", "ADVANCED")).toBe(true);
    expect(hasLevel("ADVANCED", "BASIC")).toBe(true);
    expect(hasLevel("BASIC", "ADVANCED")).toBe(false);
    expect(hasLevel("BASIC", "BASIC")).toBe(true);
  });

  it("only Premium gets the homepage banner", async () => {
    const premium = await ownerOn("PREMIUM", 1);
    const eligible = await getBannerEligibleOwnerIds();
    expect(eligible).toContain(premium.profile.id);
  });
});

describe("a lapsed plan revokes everything", () => {
  it("drops analytics, priority support, badge and banner", async () => {
    const { profile, user } = await ownerOn("PREMIUM", 1);
    await applyPlanChange(prisma, profile.id);

    await prisma.ownerSubscription.updateMany({
      where: { ownerId: profile.id },
      data: { status: "LAPSED" },
    });
    await applyPlanChange(prisma, profile.id);

    expect((await getOwnerAnalyticsLevel(profile.id)).level).toBe("BASIC");
    expect((await resolvePriority(user.id)).isPriority).toBe(false);
    expect(await getBannerEligibleOwnerIds()).not.toContain(profile.id);

    const after = await prisma.carOwnerProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(after.hasVerifiedBadge).toBe(false);
    expect(after.searchPriority).toBe(3);
  });
});

describe("listing enforcement", () => {
  it("unlists down to the allowance, newest kept", async () => {
    const { profile } = await ownerOn("none", 3);

    const { unlisted } = await enforceListingLimit(prisma, profile.id, 1);
    expect(unlisted).toBe(2);

    const live = await prisma.car.findMany({
      where: { ownerId: profile.id, isActive: true },
    });
    expect(live).toHaveLength(1);

    const hidden = await prisma.car.findMany({
      where: { ownerId: profile.id, isActive: false },
    });
    // Deactivated, NOT suspended — suspension is an admin penalty.
    expect(hidden.every((c) => c.status === "LIVE")).toBe(true);
    expect(hidden.every((c) => c.unlistedByPlanAt !== null)).toBe(true);
  });

  it("NEVER unlists a car with a live booking", async () => {
    const { profile } = await ownerOn("none", 3);
    const client = await makeClient();

    const cars = await prisma.car.findMany({
      where: { ownerId: profile.id },
      orderBy: { createdAt: "asc" },
    });
    // The OLDEST car — normally first to be dropped.
    await paidBooking(cars[0].id, client.id, { status: "CONFIRMED" });

    const { unlisted, protectedByBooking } = await enforceListingLimit(
      prisma,
      profile.id,
      1,
    );

    expect(protectedByBooking).toBe(1);
    expect(unlisted).toBe(2);

    const booked = await prisma.car.findUniqueOrThrow({ where: { id: cars[0].id } });
    expect(booked.isActive).toBe(true);
  });

  it("relists only what a lapse hid, never what the owner paused", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    for (let i = 0; i < 3; i++) await makeCar(profile.id);

    await enforceListingLimit(prisma, profile.id, 1);

    // An owner-paused car carries no marker and must stay paused.
    const ownerPausedCar = await prisma.car.findFirstOrThrow({
      where: { ownerId: profile.id, isActive: true },
    });
    await prisma.car.update({
      where: { id: ownerPausedCar.id },
      data: { isActive: false },
    });

    // A real renewal — Premium is unlimited, so there is room for everything.
    const purchase = await beginSubscriptionPurchase(
      profile.id,
      plans.premium.id,
      "MTN_MOMO",
    );
    await prisma.$transaction((tx) => activateSubscription(tx, purchase.id));

    const relisted = await relistAfterRenewal(prisma, profile.id);
    // activateSubscription already put the two plan-hidden cars back, so this
    // second call finds nothing left to do — which is the point.
    expect(relisted).toBe(0);

    const planHidden = await prisma.car.count({
      where: { ownerId: profile.id, isActive: true },
    });
    expect(planHidden).toBe(2);

    const stillPaused = await prisma.car.findUniqueOrThrow({
      where: { id: ownerPausedCar.id },
    });
    expect(stillPaused.isActive).toBe(false);
    expect(stillPaused.unlistedByPlanAt).toBeNull();
  });

  it("respects the free-tier ceiling when there is no plan to renew", async () => {
    const { profile } = await ownerOn("none", 3);
    await enforceListingLimit(prisma, profile.id, 1);

    // Pause the survivor so the free-tier slot is open.
    const survivor = await prisma.car.findFirstOrThrow({
      where: { ownerId: profile.id, isActive: true },
    });
    await prisma.car.update({ where: { id: survivor.id }, data: { isActive: false } });

    // One slot free, so exactly one car comes back — not all of them.
    expect(await relistAfterRenewal(prisma, profile.id)).toBe(1);
  });
});

describe("purchase and activation", () => {
  it("activates, relists, and applies benefits in one step", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    await makeCar(profile.id);
    await makeCar(profile.id);

    // Lapse to the free tier first, hiding one car.
    await applyPlanChange(prisma, profile.id);
    expect(await prisma.car.count({ where: { ownerId: profile.id, isActive: true } })).toBe(1);

    const purchase = await beginSubscriptionPurchase(
      profile.id,
      plans.premium.id,
      "BANK_TRANSFER",
    );
    const activation = await prisma.$transaction((tx) =>
      activateSubscription(tx, purchase.id),
    );

    expect(activation.relisted).toBe(1);
    expect(await prisma.car.count({ where: { ownerId: profile.id, isActive: true } })).toBe(2);

    const after = await prisma.carOwnerProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(after.searchPriority).toBe(1);
    expect(after.hasVerifiedBadge).toBe(true);
  });

  it("snapshots the price so a later change cannot rewrite history", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();

    const purchase = await beginSubscriptionPurchase(
      profile.id,
      plans.premium.id,
      "MTN_MOMO",
    );

    await prisma.subscriptionPlan.update({
      where: { id: plans.premium.id },
      data: { priceMonthly: 999_000 },
    });

    const row = await prisma.ownerSubscription.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(row.pricePaid).toBe(75_000);
  });

  it("adds a full period on top when renewing early", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();

    const first = await beginSubscriptionPurchase(profile.id, plans.pro.id, "MTN_MOMO");
    const a1 = await prisma.$transaction((tx) => activateSubscription(tx, first.id));

    const second = await beginSubscriptionPurchase(profile.id, plans.pro.id, "MTN_MOMO");
    const a2 = await prisma.$transaction((tx) => activateSubscription(tx, second.id));

    const gained = Math.round((a2.expiresAt.getTime() - a1.expiresAt.getTime()) / 864e5);
    expect(gained).toBe(30);
    expect(a2.isRenewal).toBe(true);
  });

  it("leaves exactly one live subscription after a renewal", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();

    for (const plan of [plans.basic, plans.pro, plans.premium]) {
      const p = await beginSubscriptionPurchase(profile.id, plan.id, "MTN_MOMO");
      await prisma.$transaction((tx) => activateSubscription(tx, p.id));
    }

    const live = await prisma.ownerSubscription.count({
      where: { ownerId: profile.id, status: { in: ["ACTIVE", "TRIAL"] } },
    });
    expect(live).toBe(1);
  });

  it("unlists on a downgrade, but protects booked cars", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    const client = await makeClient();

    const premium = await beginSubscriptionPurchase(
      profile.id,
      plans.premium.id,
      "MTN_MOMO",
    );
    await prisma.$transaction((tx) => activateSubscription(tx, premium.id));

    const cars = [];
    for (let i = 0; i < 3; i++) cars.push(await makeCar(profile.id));
    // Oldest car booked — normally the first to be dropped.
    await paidBooking(cars[0].id, client.id, { status: "CONFIRMED" });

    await prisma.subscriptionPlan.update({
      where: { id: plans.basic.id },
      data: { maxListings: 1 },
    });

    const basic = await beginSubscriptionPurchase(
      profile.id,
      plans.basic.id,
      "MTN_MOMO",
    );
    const result = await prisma.$transaction((tx) =>
      activateSubscription(tx, basic.id),
    );

    expect(result.unlisted).toBe(2);
    const booked = await prisma.car.findUniqueOrThrow({ where: { id: cars[0].id } });
    expect(booked.isActive).toBe(true);
  });

  it("reuses a pending request instead of stacking duplicates", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();

    await beginSubscriptionPurchase(profile.id, plans.basic.id, "MTN_MOMO");
    await beginSubscriptionPurchase(profile.id, plans.pro.id, "BANK_TRANSFER");
    await beginSubscriptionPurchase(profile.id, plans.premium.id, "MTN_MOMO");

    const pending = await prisma.ownerSubscription.findMany({
      where: { ownerId: profile.id, status: "PENDING_PAYMENT" },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0].planId).toBe(plans.premium.id);
  });

  it("rejects an unknown or inactive plan", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();

    await expect(
      beginSubscriptionPurchase(profile.id, "no-such-plan", "MTN_MOMO"),
    ).rejects.toThrow();

    await prisma.subscriptionPlan.update({
      where: { id: plans.basic.id },
      data: { isActive: false },
    });
    await expect(
      beginSubscriptionPurchase(profile.id, plans.basic.id, "MTN_MOMO"),
    ).rejects.toThrow();
  });
});
