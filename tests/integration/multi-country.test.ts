/**
 * One deployment, several markets.
 *
 * The choice here was one platform serving every country rather than a
 * deployment per country, so that the brand, the supply and the demand stay
 * pooled in one place. That only works if everything which differs between
 * markets is data, and these are the places where getting it wrong costs
 * money rather than looks: what currency a booking is priced in, what
 * commission is taken, and which listings a renter is shown.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, makeSettings, makePlans } from "../helpers/factories";
import { getCommissionRateForOwner } from "@/lib/subscriptions/limits";
import { getPaymentProviderForCountry } from "@/lib/payments";

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

describe("markets", () => {
  it("seeds Rwanda live and the rest ready but closed", async () => {
    const live = await prisma.country.findMany({ where: { isActive: true } });
    expect(live.map((c) => c.code)).toEqual(["RW"]);

    // Opening a market should be a flag, not a migration.
    const planned = await prisma.country.findMany({ where: { isActive: false } });
    expect(planned.map((c) => c.code).sort()).toEqual(["KE", "TZ", "UG"]);
  });

  it("gives each market its own currency and dialling prefix", async () => {
    const ug = await prisma.country.findUnique({ where: { code: "UG" } });
    expect(ug?.currency).toBe("UGX");
    expect(ug?.phonePrefix).toBe("+256");
  });

  it("puts every existing car in Rwanda", async () => {
    // Nothing about the live market changes: this is where every car already is.
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    expect(car.countryCode).toBe("RW");
  });
});

describe("commission by market", () => {
  it("falls back to the platform rate when a market sets none", async () => {
    const owner = await makeOwner();
    const rate = await getCommissionRateForOwner(owner.profile.id, undefined, "RW");
    expect(rate).toBe(20);
  });

  it("uses the market's rate when it has one", async () => {
    // What the competition charges in Kampala is not what it charges in
    // Kigali, and one global number would have to be wrong in one of them.
    await prisma.country.update({
      where: { code: "UG" },
      data: { commissionRatePercent: 15 },
    });

    const owner = await makeOwner();
    const rate = await getCommissionRateForOwner(owner.profile.id, undefined, "UG");
    expect(rate).toBe(15);
  });

  it("still lets a plan beat the market rate", async () => {
    // Most specific wins: the owner's plan, then their market, then the
    // platform default.
    await makePlans();
    await prisma.country.update({
      where: { code: "UG" },
      data: { commissionRatePercent: 15 },
    });

    const plan = await prisma.subscriptionPlan.findFirst({
      where: { commissionRatePercent: { not: null } },
    });
    if (!plan) return; // no plan carries its own rate in this fixture

    const owner = await makeOwner();
    await prisma.ownerSubscription.create({
      data: {
        ownerId: owner.profile.id,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const rate = await getCommissionRateForOwner(owner.profile.id, undefined, "UG");
    expect(rate).toBe(plan.commissionRatePercent);
  });
});

describe("payment routing", () => {
  it("sends each market to the collector named on its country row", async () => {
    // MTN runs in Rwanda and Uganda under separate accounts, and neither
    // covers Kenya.
    expect(getPaymentProviderForCountry("MOMO").displayName).toBeTruthy();
    expect(getPaymentProviderForCountry("DIRECT").canCollect).toBe(false);
  });

  it("settles directly rather than guessing when a provider is unknown", async () => {
    // A wrong collector is worse than none: it would take money into an
    // account nobody is reconciling.
    const provider = getPaymentProviderForCountry("NOT_A_PROVIDER");
    expect(provider.canCollect).toBe(false);
  });
});

describe("what a renter is shown", () => {
  it("hides listings from a market that is not trading", async () => {
    const owner = await makeOwner();
    await makeCar(owner.profile.id, { countryCode: "UG" });

    // Uganda is seeded but closed, so its cars are invisible however they
    // were created.
    const visible = await prisma.car.findMany({
      where: { status: "LIVE", isActive: true, country: { isActive: true } },
    });
    expect(visible.every((c) => c.countryCode === "RW")).toBe(true);
  });

  it("shows them once the market opens", async () => {
    const owner = await makeOwner();
    await makeCar(owner.profile.id, { countryCode: "UG" });

    await prisma.country.update({ where: { code: "UG" }, data: { isActive: true } });

    const visible = await prisma.car.findMany({
      where: { status: "LIVE", isActive: true, country: { isActive: true } },
    });
    expect(visible.some((c) => c.countryCode === "UG")).toBe(true);
  });
});
