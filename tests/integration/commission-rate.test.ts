/**
 * Which commission rate applies to which owner.
 *
 * A plan may carry its own rate so that a higher subscription buys a smaller
 * cut. The resolution has to be automatic and per-owner — nobody sets a rate
 * against a person — and it has to fall back cleanly, because most plans will
 * carry no rate of their own for most of this platform's life.
 *
 * The failure mode this guards is quiet: a rate that silently resolves to the
 * platform default for a paying owner costs them the discount they bought, and
 * a rate that resolves to a plan's discount for a lapsed subscriber costs the
 * platform money. Neither shows up as an error anywhere.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makePlans, makeSettings } from "../helpers/factories";
import { getCommissionRateForOwner } from "@/lib/subscriptions/limits";

beforeEach(async () => {
  await resetDatabase();
  await makeSettings({ commissionRatePercent: 20 });
});

afterAll(disconnect);

/** Put an owner on a plan at a given subscription status. */
async function subscribe(
  ownerProfileId: string,
  planId: string,
  status: "ACTIVE" | "TRIAL" | "LAPSED" | "PENDING_PAYMENT" = "ACTIVE",
) {
  return prisma.ownerSubscription.create({
    data: {
      ownerId: ownerProfileId,
      planId,
      status,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

describe("commission rate by plan", () => {
  it("gives each owner the rate of the plan they are on", async () => {
    const plans = await makePlans();
    await prisma.subscriptionPlan.update({
      where: { id: plans.basic.id },
      data: { commissionRatePercent: 17 },
    });
    await prisma.subscriptionPlan.update({
      where: { id: plans.pro.id },
      data: { commissionRatePercent: 14 },
    });
    await prisma.subscriptionPlan.update({
      where: { id: plans.premium.id },
      data: { commissionRatePercent: 11 },
    });

    const [a, b, c] = await Promise.all([makeOwner(), makeOwner(), makeOwner()]);
    await subscribe(a.profile.id, plans.basic.id);
    await subscribe(b.profile.id, plans.pro.id);
    await subscribe(c.profile.id, plans.premium.id);

    expect(await getCommissionRateForOwner(a.profile.id)).toBe(17);
    expect(await getCommissionRateForOwner(b.profile.id)).toBe(14);
    expect(await getCommissionRateForOwner(c.profile.id)).toBe(11);
  });

  it("charges an owner with no subscription the platform rate", async () => {
    const owner = await makeOwner();
    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(20);
  });

  it("falls back to the platform rate for a plan that sets none", async () => {
    // The normal state: plans carry no rate of their own, so every owner is on
    // the platform rate and the column changes nothing.
    const plans = await makePlans();
    const owner = await makeOwner();
    await subscribe(owner.profile.id, plans.pro.id);

    expect(plans.pro.commissionRatePercent).toBeNull();
    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(20);
  });

  it("takes the discount away when a plan lapses", async () => {
    const plans = await makePlans();
    await prisma.subscriptionPlan.update({
      where: { id: plans.premium.id },
      data: { commissionRatePercent: 11 },
    });

    const owner = await makeOwner();
    const sub = await subscribe(owner.profile.id, plans.premium.id);
    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(11);

    await prisma.ownerSubscription.update({
      where: { id: sub.id },
      data: { status: "LAPSED" },
    });
    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(20);
  });

  it("grants nothing while a subscription is still awaiting payment", async () => {
    // PENDING_PAYMENT means the owner chose a plan and the money has not been
    // verified. It must not buy the better rate in the meantime.
    const plans = await makePlans();
    await prisma.subscriptionPlan.update({
      where: { id: plans.pro.id },
      data: { commissionRatePercent: 14 },
    });

    const owner = await makeOwner();
    await subscribe(owner.profile.id, plans.pro.id, "PENDING_PAYMENT");

    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(20);
  });

  it("honours a trial", async () => {
    const plans = await makePlans();
    await prisma.subscriptionPlan.update({
      where: { id: plans.pro.id },
      data: { commissionRatePercent: 14 },
    });

    const owner = await makeOwner();
    await subscribe(owner.profile.id, plans.pro.id, "TRIAL");

    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(14);
  });

  it("follows the platform rate when an admin changes it", async () => {
    // Owners on no plan should move with the setting, which is what makes a
    // flat rate adjustable from the admin screen.
    const owner = await makeOwner();
    await makeSettings({ commissionRatePercent: 25 });

    expect(await getCommissionRateForOwner(owner.profile.id)).toBe(25);
  });
});
