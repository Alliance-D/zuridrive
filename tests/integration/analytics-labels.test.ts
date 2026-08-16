/**
 * Every label key the analytics queries emit must exist in both locales.
 *
 * These keys are built at runtime — `rating${category}`, a weekday array, an
 * enum value handed to the labeller — so check:messages can only list them as
 * "not statically checkable" and move on. That gap hid three separate bugs at
 * once, and all three were visible only to owners on the top plan:
 *
 *   • four of the seven weekdays were capitalised in the source array while
 *     every message key is lowercase, so half the chart read "analytics.Friday"
 *   • the rating breakdown emitted "Value for money" as a key fragment,
 *     producing "analytics.ratingValue for money"
 *   • the price table lowercased CarCategory before the labeller saw it, so
 *     every lookup missed and a `capitalize` class rendered the miss as
 *     "Enum.Category.Suv"
 *
 * Nobody on Basic or Pro could see any of it. This asserts on the keys the
 * queries actually return, which is the only place the mistake shows.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resetDatabase, disconnect } from "../helpers/db";
import {
  makeOwner,
  makeCar,
  makeClient,
  makeSettings,
  paidBooking,
} from "../helpers/factories";
import { prisma } from "../helpers/db";
import {
  getOwnerDemandPatterns,
  getOwnerRatingBreakdown,
  getOwnerPricePosition,
} from "@/lib/analytics/owner-queries";

const messages = Object.fromEntries(
  (["en", "rw"] as const).map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);

/** Resolve a dotted path, as next-intl would. */
function resolve(locale: string, path: string): unknown {
  return path
    .split(".")
    .reduce<Record<string, unknown> | undefined>(
      (node, part) =>
        node == null ? undefined : (node[part] as Record<string, unknown>),
      messages[locale],
    );
}

function expectResolves(path: string) {
  for (const locale of ["en", "rw"]) {
    expect(
      typeof resolve(locale, path),
      `${path} is missing from ${locale}`,
    ).toBe("string");
  }
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

describe("analytics label keys", () => {
  it("emits weekday keys that exist", async () => {
    const owner = await makeOwner();
    const demand = await getOwnerDemandPatterns(
      owner.profile.id,
      new Date(Date.now() - 30 * 864e5),
    );

    expect(demand.byWeekday).toHaveLength(7);
    for (const d of demand.byWeekday) expectResolves(`analytics.${d.labelKey}`);
  });

  it("emits lead-time keys that exist", async () => {
    const owner = await makeOwner();
    const demand = await getOwnerDemandPatterns(
      owner.profile.id,
      new Date(Date.now() - 30 * 864e5),
    );

    expect(demand.byLeadTime.length).toBeGreaterThan(0);
    for (const d of demand.byLeadTime) expectResolves(`analytics.${d.labelKey}`);
  });

  it("emits rating categories that exist as keys", async () => {
    // The page builds `rating${category}`, so the category has to be a key
    // fragment rather than something written for display. The breakdown is
    // empty until a review exists, so one has to be written first.
    const owner = await makeOwner();
    const client = await makeClient();
    const car = await makeCar(owner.profile.id);
    // A review hangs off a booking, so the trip has to exist first.
    const booking = await paidBooking(car.id, client.id, {
      status: "COMPLETED",
    });
    await prisma.review.create({
      data: {
        bookingId: booking.id,
        carId: car.id,
        clientId: client.id,
        overallRating: 5,
        cleanlinessRating: 5,
        comfortRating: 5,
        valueRating: 4,
        communicationRating: 5,
        isVisible: true,
      },
    });

    const ratings = await getOwnerRatingBreakdown(
      owner.profile.id,
      new Date(Date.now() - 30 * 864e5),
    );

    expect(ratings).toHaveLength(4);
    for (const r of ratings) expectResolves(`analytics.rating${r.category}`);
  });

  it("emits a car category the enum labeller can resolve", async () => {
    const owner = await makeOwner();
    await makeCar(owner.profile.id, { category: "SUV" });

    const pricing = await getOwnerPricePosition(owner.profile.id);

    expect(pricing.length).toBeGreaterThan(0);
    for (const p of pricing) expectResolves(`enum.category.${p.category}`);
  });
});
