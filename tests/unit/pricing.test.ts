/**
 * Booking price calculation.
 *
 * This is the single most consequential pure function on the platform: it
 * decides what a client is charged, what the owner earns, and what the platform
 * takes. Every one of those is an integer number of francs, and they must add
 * up exactly.
 *
 * It is also where a real bug lived: the code once branched on 'DAY'/'WEEK'
 * while the Prisma enum is PER_DAY/PER_WEEK, so EVERY booking fell through to
 * the monthly flat rate. The rental-type tests below exist to make that
 * impossible to reintroduce silently.
 */

import { describe, it, expect } from "vitest";
import {
  calculateBookingPrice,
  calcDurationDays,
} from "@/lib/booking/pricing";

const MATRIX = {
  perDayInCity: 45_000,
  perDayOutsideCity: 55_000,
  perWeekInCity: 270_000,
  perWeekOutsideCity: 330_000,
  perMonth: 900_000,
  driverSurchargePerDay: 15_000,
  depositAmount: 60_000,
  depositEnabled: true,
};

const day = (n: number) => new Date(2026, 0, n);

function price(overrides: Partial<Parameters<typeof calculateBookingPrice>[0]> = {}) {
  return calculateBookingPrice({
    rentalType: "PER_DAY",
    tripScope: "IN_CITY",
    startDate: day(1),
    endDate: day(4),
    withDriver: false,
    deliveryFee: 0,
    pricingMatrix: MATRIX,
    ...overrides,
  });
}

describe("duration", () => {
  it("counts whole days", () => {
    expect(calcDurationDays(day(1), day(4))).toBe(3);
  });

  it("never returns less than a day", () => {
    expect(calcDurationDays(day(1), day(1))).toBe(1);
    expect(calcDurationDays(day(4), day(1))).toBe(1);
  });

  it("rounds a part-day up", () => {
    const start = new Date(2026, 0, 1, 9, 0);
    const end = new Date(2026, 0, 2, 15, 0); // 30 hours
    expect(calcDurationDays(start, end)).toBe(2);
  });
});

describe("rental type is honoured", () => {
  // The regression guard: each type must use its OWN rate, not fall through.
  it("PER_DAY uses the daily rate", () => {
    const p = price({ rentalType: "PER_DAY", startDate: day(1), endDate: day(4) });
    expect(p.baseRate).toBe(45_000);
    expect(p.baseAmount).toBe(135_000); // 3 days
  });

  it("PER_WEEK uses the weekly rate", () => {
    const p = price({ rentalType: "PER_WEEK", startDate: day(1), endDate: day(8) });
    expect(p.baseRate).toBe(270_000);
    expect(p.baseAmount).toBe(270_000); // 1 week
  });

  it("PER_MONTH uses the flat monthly rate", () => {
    const p = price({ rentalType: "PER_MONTH", startDate: day(1), endDate: day(28) });
    expect(p.baseRate).toBe(900_000);
    expect(p.baseAmount).toBe(900_000);
  });

  it("a daily booking is NOT priced as a month", () => {
    const daily = price({ rentalType: "PER_DAY", startDate: day(1), endDate: day(4) });
    const monthly = price({ rentalType: "PER_MONTH", startDate: day(1), endDate: day(4) });
    expect(daily.baseAmount).not.toBe(monthly.baseAmount);
    expect(daily.baseAmount).toBeLessThan(monthly.baseAmount);
  });
});

describe("trip scope", () => {
  it("charges more outside the city, per day", () => {
    const inCity = price({ tripScope: "IN_CITY" });
    const outside = price({ tripScope: "OUTSIDE_CITY" });
    expect(outside.baseRate).toBe(55_000);
    expect(outside.baseAmount).toBeGreaterThan(inCity.baseAmount);
  });

  it("charges more outside the city, per week", () => {
    const outside = price({
      rentalType: "PER_WEEK",
      tripScope: "OUTSIDE_CITY",
      startDate: day(1),
      endDate: day(8),
    });
    expect(outside.baseRate).toBe(330_000);
  });

  it("ignores scope on a monthly booking", () => {
    const a = price({ rentalType: "PER_MONTH", tripScope: "IN_CITY", endDate: day(28) });
    const b = price({ rentalType: "PER_MONTH", tripScope: "OUTSIDE_CITY", endDate: day(28) });
    expect(a.baseAmount).toBe(b.baseAmount);
  });
});

describe("driver surcharge", () => {
  it("is charged per day even on a weekly booking", () => {
    const p = price({
      rentalType: "PER_WEEK",
      withDriver: true,
      startDate: day(1),
      endDate: day(8),
    });
    expect(p.driverSurchargeTotal).toBe(15_000 * 7);
  });

  it("is zero when no driver is requested", () => {
    expect(price({ withDriver: false }).driverSurchargeTotal).toBe(0);
  });

  it("is commissionable", () => {
    const p = price({ withDriver: true });
    expect(p.commissionableSubtotal).toBe(p.baseAmount + p.driverSurchargeTotal);
  });
});

describe("commission", () => {
  it("takes the default rate off base plus driver", () => {
    const p = price({ withDriver: true, commissionRatePercent: 20 });
    expect(p.commissionAmount).toBe(Math.round(p.commissionableSubtotal * 0.2));
    expect(p.ownerEarnings).toBe(p.commissionableSubtotal - p.commissionAmount);
  });

  it("splits exactly — no francs created or lost", () => {
    for (const rate of [0, 7, 12, 15, 20, 33, 50]) {
      const p = price({ withDriver: true, commissionRatePercent: rate });
      expect(p.commissionAmount + p.ownerEarnings).toBe(p.commissionableSubtotal);
      expect(Number.isInteger(p.commissionAmount)).toBe(true);
      expect(Number.isInteger(p.ownerEarnings)).toBe(true);
    }
  });

  it("gives the owner everything at 0%", () => {
    const p = price({ commissionRatePercent: 0 });
    expect(p.commissionAmount).toBe(0);
    expect(p.ownerEarnings).toBe(p.commissionableSubtotal);
  });
});

describe("delivery fee", () => {
  it("is NOT commissionable — it belongs to the owner", () => {
    const without = price({ deliveryFee: 0 });
    const with_ = price({ deliveryFee: 10_000 });

    expect(with_.commissionableSubtotal).toBe(without.commissionableSubtotal);
    expect(with_.commissionAmount).toBe(without.commissionAmount);
    expect(with_.subtotalBeforeDeposit).toBe(without.subtotalBeforeDeposit + 10_000);
  });
});

describe("deposit", () => {
  it("is never commissionable", () => {
    const p = price();
    // The commissionable base is base + driver only — the deposit is not in it.
    expect(p.commissionableSubtotal).toBe(p.baseAmount + p.driverSurchargeTotal);
    expect(p.commissionAmount).toBe(Math.round(p.commissionableSubtotal * 0.2));
    // Changing the deposit must not change what the platform earns.
    const bigger = price({
      pricingMatrix: { ...MATRIX, depositAmount: 500_000 },
    });
    expect(bigger.commissionAmount).toBe(p.commissionAmount);
    expect(bigger.ownerEarnings).toBe(p.ownerEarnings);
  });

  it("is added to the amount charged now", () => {
    const p = price();
    expect(p.totalChargedNow).toBe(p.subtotalBeforeDeposit + p.depositAmount);
  });

  it("is zero when disabled", () => {
    const p = price({
      pricingMatrix: { ...MATRIX, depositEnabled: false, depositAmount: 0 },
    });
    expect(p.depositAmount).toBe(0);
    expect(p.totalChargedNow).toBe(p.subtotalBeforeDeposit);
  });
});

describe("the totals always reconcile", () => {
  it("holds across a wide range of inputs", () => {
    const types = ["PER_DAY", "PER_WEEK", "PER_MONTH"] as const;
    const scopes = ["IN_CITY", "OUTSIDE_CITY"] as const;

    for (const rentalType of types) {
      for (const tripScope of scopes) {
        for (const withDriver of [true, false]) {
          for (const deliveryFee of [0, 5_000, 12_345]) {
            for (const days of [1, 3, 7, 31]) {
              const p = price({
                rentalType,
                tripScope,
                withDriver,
                deliveryFee,
                startDate: day(1),
                endDate: day(1 + days),
                commissionRatePercent: 20,
              });

              const label = `${rentalType}/${tripScope}/driver=${withDriver}/${days}d`;

              // Commission and owner earnings partition the commissionable base.
              expect(
                p.commissionAmount + p.ownerEarnings,
                `split broke for ${label}`,
              ).toBe(p.commissionableSubtotal);

              // Subtotal is base + driver + delivery.
              expect(p.subtotalBeforeDeposit, `subtotal broke for ${label}`).toBe(
                p.baseAmount + p.driverSurchargeTotal + deliveryFee,
              );

              // Charged now is subtotal + deposit.
              expect(p.totalChargedNow, `total broke for ${label}`).toBe(
                p.subtotalBeforeDeposit + p.depositAmount,
              );

              // Everything is whole francs.
              for (const [key, value] of Object.entries(p)) {
                if (typeof value === "number") {
                  expect(Number.isInteger(value), `${key} not integer for ${label}`).toBe(true);
                }
              }
            }
          }
        }
      }
    }
  });
});

describe("labels", () => {
  it("describes what was charged", () => {
    const p = price({ startDate: day(1), endDate: day(4) });
    expect(p.baseRateLabel).toContain("3 day");
    expect(p.baseRateLabel).toContain("45,000");
  });

  it("names the driver surcharge only when there is one", () => {
    expect(price({ withDriver: true }).driverSurchargeLabel).toContain("15,000");
    expect(price({ withDriver: false }).driverSurchargeLabel).toBeNull();
  });
});
