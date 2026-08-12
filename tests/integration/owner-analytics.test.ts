/**
 * Owner analytics.
 *
 * These exist because of a bug that was easy to introduce and impossible to
 * notice: owner earnings used to be read from the Commission table, and Phase 1
 * writes no Commission rows. Every owner would have seen a permanent zero — not
 * an empty chart because nothing had happened yet, but a flat zero after a
 * hundred completed trips, with no error anywhere.
 *
 * In Phase 1 analytics is not a nice-to-have. Owner subscriptions are the only
 * revenue, and the analytics tiers are part of what an owner is paying for. A
 * dashboard that under-reports what they made is the fastest way to lose them.
 *
 * The distinction being protected:
 *   owner earnings   -> Booking.ownerEarnings   (what they made)
 *   platform revenue -> Commission              (what we took; zero in Phase 1)
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, makeSettings } from "../helpers/factories";
import {
  getOwnerHeadlines,
  getOwnerEarningsSeries,
  getOwnerCarPerformance,
  hasLevel,
} from "@/lib/analytics/owner-queries";

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

/** A completed trip with no Commission row — i.e. exactly what Phase 1 writes. */
async function completedDirectTrip(
  carId: string,
  clientId: string,
  ownerEarnings: number,
  daysAgo = 3,
) {
  const ended = new Date(Date.now() - daysAgo * 86_400_000);

  return prisma.booking.create({
    data: {
      reference: `ZD-${Math.floor(Math.random() * 1e9)}`,
      clientId,
      carId,
      startDate: new Date(ended.getTime() - 2 * 86_400_000),
      endDate: ended,
      tripEndedAt: ended,
      totalDays: 2,
      status: "COMPLETED",
      rentalType: "PER_DAY",
      baseRatePerDay: 45_000,
      baseAmount: ownerEarnings,
      driverTotal: 0,
      deliveryFee: 0,
      subtotal: ownerEarnings,
      commissionRate: 0,
      commissionAmount: 0,
      ownerEarnings,
      depositAmount: 0,
    },
  });
}

const from = new Date(Date.now() - 30 * 86_400_000);
const previousFrom = new Date(Date.now() - 60 * 86_400_000);

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

describe("earnings are reported without any Commission row", () => {
  it("headlines count what the owner actually made", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();

    await completedDirectTrip(car.id, client.id, 90_000);
    await completedDirectTrip(car.id, client.id, 60_000);

    // Precondition: this is genuinely the Phase 1 shape.
    expect(await prisma.commission.count()).toBe(0);

    const headlines = await getOwnerHeadlines(owner.profile.id, from, previousFrom);

    expect(headlines.earnings).toBe(150_000);
    expect(headlines.completedTrips).toBe(2);
  });

  it("the earnings chart is not flat zero", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();

    await completedDirectTrip(car.id, client.id, 120_000);

    const series = await getOwnerEarningsSeries(owner.profile.id, from, "day");
    const total = series.reduce((sum, point) => sum + point.value, 0);

    expect(total).toBe(120_000);
  });

  it("per-car performance attributes earnings to the right car", async () => {
    const owner = await makeOwner();
    const carA = await makeCar(owner.profile.id);
    const carB = await makeCar(owner.profile.id);
    const client = await makeClient();

    await completedDirectTrip(carA.id, client.id, 100_000);
    await completedDirectTrip(carB.id, client.id, 40_000);
    await completedDirectTrip(carB.id, client.id, 25_000);

    const perf = await getOwnerCarPerformance(owner.profile.id, from);
    const byId = new Map(perf.map((p) => [p.id, p]));

    expect(byId.get(carA.id)!.earnings).toBe(100_000);
    expect(byId.get(carA.id)!.trips).toBe(1);
    expect(byId.get(carB.id)!.earnings).toBe(65_000);
    expect(byId.get(carB.id)!.trips).toBe(2);
  });
});

describe("scoping", () => {
  it("never counts another owner's trips", async () => {
    const mine = await makeOwner();
    const theirs = await makeOwner();
    const myCar = await makeCar(mine.profile.id);
    const theirCar = await makeCar(theirs.profile.id);
    const client = await makeClient();

    await completedDirectTrip(myCar.id, client.id, 50_000);
    await completedDirectTrip(theirCar.id, client.id, 999_000);

    const headlines = await getOwnerHeadlines(mine.profile.id, from, previousFrom);
    expect(headlines.earnings).toBe(50_000);
  });

  it("excludes trips that have not completed", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();

    const done = await completedDirectTrip(car.id, client.id, 70_000);
    const live = await completedDirectTrip(car.id, client.id, 500_000);
    await prisma.booking.update({
      where: { id: live.id },
      data: { status: "ACTIVE", tripEndedAt: null },
    });

    const headlines = await getOwnerHeadlines(owner.profile.id, from, previousFrom);

    // Money is only earned when the trip is finished.
    expect(headlines.earnings).toBe(70_000);
    expect(done.status).toBe("COMPLETED");
  });

  it("excludes trips outside the window", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const client = await makeClient();

    await completedDirectTrip(car.id, client.id, 30_000, 3);
    await completedDirectTrip(car.id, client.id, 800_000, 200); // long ago

    const headlines = await getOwnerHeadlines(owner.profile.id, from, previousFrom);
    expect(headlines.earnings).toBe(30_000);
  });
});

describe("an owner with no trips yet", () => {
  it("gets zeros rather than an error", async () => {
    // The launch-day case: every owner looks like this on their first visit.
    const owner = await makeOwner();
    await makeCar(owner.profile.id);

    const headlines = await getOwnerHeadlines(owner.profile.id, from, previousFrom);
    const series = await getOwnerEarningsSeries(owner.profile.id, from, "day");
    const perf = await getOwnerCarPerformance(owner.profile.id, from);

    expect(headlines.earnings).toBe(0);
    expect(headlines.completedTrips).toBe(0);
    expect(series.every((p) => p.value === 0)).toBe(true);
    expect(perf.every((c) => c.earnings === 0)).toBe(true);
  });

  it("gets an empty list when they own no cars at all", async () => {
    const owner = await makeOwner();
    expect(await getOwnerCarPerformance(owner.profile.id, from)).toEqual([]);
  });
});

describe("plan gating", () => {
  it("ranks levels so a higher plan satisfies a lower requirement", () => {
    expect(hasLevel("FULL", "BASIC")).toBe(true);
    expect(hasLevel("ADVANCED", "ADVANCED")).toBe(true);
    expect(hasLevel("BASIC", "ADVANCED")).toBe(false);
    expect(hasLevel("ADVANCED", "FULL")).toBe(false);
  });
});
