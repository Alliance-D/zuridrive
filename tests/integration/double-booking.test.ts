/**
 * A car cannot be booked twice for the same dates.
 *
 * The booking route checked availability and then, in a separate transaction,
 * created the booking. Between those two steps another request could pass the
 * same check, and both would succeed — one car, two renters, both told yes.
 * Reproduced with two simultaneous requests against the running app.
 *
 * Re-checking inside the transaction narrows the window without closing it:
 * under READ COMMITTED, two concurrent transactions each see a table without
 * the other's uncommitted row, so both still pass. The rule therefore lives in
 * the database as an exclusion constraint, where no amount of application code
 * can forget it — and these tests go through Prisma rather than the HTTP
 * layer so they assert on that constraint rather than on a route's politeness.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, makeSettings } from "../helpers/factories";

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

let seq = 0;

async function book(
  carId: string,
  clientId: string,
  startDate: Date,
  endDate: Date,
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "PENDING_PAYMENT" = "CONFIRMED",
) {
  return prisma.booking.create({
    data: {
      reference: `ZD-OVL-${++seq}-${Date.now().toString().slice(-5)}`,
      carId,
      clientId,
      rentalType: "PER_DAY",
      tripScope: "IN_CITY",
      startDate,
      endDate,
      totalDays: 3,
      status,
      baseRatePerDay: 50_000,
      baseAmount: 150_000,
      driverTotal: 0,
      deliveryFee: 0,
      subtotal: 150_000,
      commissionRate: 20,
      commissionAmount: 30_000,
      ownerEarnings: 120_000,
      depositAmount: 0,
      licenceAttestedAt: new Date(),
    },
  });
}

const day = (n: number) => new Date(Date.UTC(2027, 0, n));

describe("overlapping bookings", () => {
  it("refuses a second booking that overlaps a confirmed one", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const a = await makeClient();
    const b = await makeClient();

    await book(car.id, a.id, day(10), day(13));

    await expect(book(car.id, b.id, day(12), day(15))).rejects.toThrow(
      /bookings_no_overlap/,
    );
  });

  it("refuses a booking wholly inside another", async () => {
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const a = await makeClient();
    const b = await makeClient();

    await book(car.id, a.id, day(10), day(20));

    await expect(book(car.id, b.id, day(12), day(14))).rejects.toThrow(
      /bookings_no_overlap/,
    );
  });

  it("allows back-to-back dates on the same car", async () => {
    // The constraint uses an inclusive range, so a booking ending on the 13th
    // blocks one starting on the 13th. The next free start is the 14th.
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const a = await makeClient();
    const b = await makeClient();

    await book(car.id, a.id, day(10), day(13));
    const second = await book(car.id, b.id, day(14), day(17));

    expect(second.id).toBeTruthy();
  });

  it("allows the same dates on a different car", async () => {
    const owner = await makeOwner();
    const one = await makeCar(owner.profile.id);
    const two = await makeCar(owner.profile.id);
    const a = await makeClient();
    const b = await makeClient();

    await book(one.id, a.id, day(10), day(13));
    const other = await book(two.id, b.id, day(10), day(13));

    expect(other.id).toBeTruthy();
  });

  it("lets a cancelled booking free its dates", async () => {
    // A cancelled or completed trip does not occupy the car, so it must not
    // block anybody — otherwise every cancellation would poison those dates
    // permanently.
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const a = await makeClient();
    const b = await makeClient();

    await book(car.id, a.id, day(10), day(13), "CANCELLED");
    const replacement = await book(car.id, b.id, day(10), day(13));

    expect(replacement.id).toBeTruthy();
  });

  it("does not let an unpaid booking hold dates hostage", async () => {
    // PENDING_PAYMENT is deliberately not in the occupying set: an abandoned
    // checkout must not keep a car off the market.
    const owner = await makeOwner();
    const car = await makeCar(owner.profile.id);
    const a = await makeClient();
    const b = await makeClient();

    await book(car.id, a.id, day(10), day(13), "PENDING_PAYMENT");
    const other = await book(car.id, b.id, day(10), day(13));

    expect(other.id).toBeTruthy();
  });
});
