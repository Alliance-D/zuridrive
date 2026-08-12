/**
 * Money arithmetic — the pure parts.
 *
 * RWF is handled as whole numbers everywhere. These tests exist to catch the
 * day someone "tidies up" a Math.round into a float and quietly starts losing
 * fractions of a franc on every booking.
 */

import { describe, it, expect } from "vitest";
import { formatRWF, formatRWFCompact } from "@/lib/currency";

/** The commission split, as the booking flow computes it. */
function split(rental: number, ratePercent: number) {
  const commission = Math.round((rental * ratePercent) / 100);
  return { commission, owner: rental - commission };
}

/** The late-cancellation split, as the cancel route computes it. */
function cancellationSplit(deposit: number, feePercent: number) {
  const fee = Math.round((deposit * feePercent) / 100);
  return { fee, toClient: deposit - fee };
}

describe("commission split", () => {
  it("never loses a franc", () => {
    for (const rental of [1, 7, 99, 333, 1_001, 45_000, 90_000, 123_457]) {
      for (const rate of [0, 5, 12, 15, 20, 33, 50]) {
        const { commission, owner } = split(rental, rate);
        expect(commission + owner).toBe(rental);
        expect(Number.isInteger(commission)).toBe(true);
        expect(Number.isInteger(owner)).toBe(true);
      }
    }
  });

  it("computes the standard 20% correctly", () => {
    expect(split(90_000, 20)).toEqual({ commission: 18_000, owner: 72_000 });
  });

  it("gives everything to the owner at a 0% rate", () => {
    expect(split(50_000, 0)).toEqual({ commission: 0, owner: 50_000 });
  });

  it("rounds a half-franc up, and still balances", () => {
    // 333 * 15% = 49.95 -> 50, leaving 283.
    const { commission, owner } = split(333, 15);
    expect(commission).toBe(50);
    expect(owner).toBe(283);
    expect(commission + owner).toBe(333);
  });
});

describe("late cancellation split", () => {
  it("halves the deposit at the default 50%", () => {
    expect(cancellationSplit(60_000, 50)).toEqual({ fee: 30_000, toClient: 30_000 });
  });

  it("returns everything at 0%", () => {
    expect(cancellationSplit(60_000, 0)).toEqual({ fee: 0, toClient: 60_000 });
  });

  it("keeps everything at 100%", () => {
    expect(cancellationSplit(60_000, 100)).toEqual({ fee: 60_000, toClient: 0 });
  });

  it("never creates or destroys money on an odd deposit", () => {
    for (const deposit of [1, 3, 999, 12_345, 60_001]) {
      for (const pct of [0, 25, 50, 75, 100]) {
        const { fee, toClient } = cancellationSplit(deposit, pct);
        expect(fee + toClient).toBe(deposit);
        expect(fee).toBeGreaterThanOrEqual(0);
        expect(toClient).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("formatting", () => {
  it("renders whole francs with separators", () => {
    expect(formatRWF(90_000)).toMatch(/90[,\s ]000/);
    expect(formatRWF(0)).toMatch(/0/);
  });

  it("never shows decimals — RWF has no minor unit", () => {
    expect(formatRWF(1_234_567)).not.toMatch(/[.,]\d\d$/);
  });

  it("compacts large amounts", () => {
    const compact = formatRWFCompact(1_500_000);
    expect(compact.length).toBeLessThan(formatRWF(1_500_000).length);
  });
});
