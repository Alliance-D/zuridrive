/**
 * Money formatting.
 *
 * The currency used to be in the function name — formatRWF, across several
 * hundred call sites — which made a second market a mechanical edit of the
 * whole codebase rather than a deployment setting. It now comes from config
 * and defaults to RWF.
 *
 * The first thing these check is that nothing moved: Rwanda must render
 * exactly as it did before, or this was a rename that quietly changed every
 * price on the site.
 */

import { describe, it, expect } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  parseMoney,
  currencyCode,
  calcCommission,
  calcOwnerEarnings,
} from "@/lib/currency";

describe("money formatting", () => {
  it("defaults to RWF, so an unconfigured deployment is Rwanda", () => {
    expect(currencyCode).toBe("RWF");
  });

  it("renders exactly as it did before the rename", () => {
    expect(formatMoney(15000)).toBe("RWF 15,000");
    expect(formatMoney(1234567)).toBe("RWF 1,234,567");
    expect(formatMoney(0)).toBe("RWF 0");
  });

  it("never shows decimals", () => {
    // These currencies are used in whole units; a stray "15,000.5" in a price
    // is not something anyone here would recognise.
    expect(formatMoney(15000.4)).toBe("RWF 15,000");
    expect(formatMoney(15000.6)).toBe("RWF 15,001");
  });

  it("shortens large amounts for tight spaces", () => {
    expect(formatMoneyCompact(1_500_000)).toBe("RWF 1.5M");
    expect(formatMoneyCompact(15_000)).toBe("RWF 15K");
    // Below a thousand there is nothing to shorten.
    expect(formatMoneyCompact(750)).toBe("RWF 750");
  });

  it("reads back what a person typed", () => {
    expect(parseMoney("RWF 25,000")).toBe(25000);
    expect(parseMoney("25000")).toBe(25000);
    expect(parseMoney("25 000")).toBe(25000);
    expect(parseMoney("rwf25,000")).toBe(25000);
  });

  it("refuses what is not an amount", () => {
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-500")).toBeNull();
    expect(parseMoney("")).toBeNull();
  });
});

describe("commission", () => {
  it("applies only to rental and driver", () => {
    // 100,000 rental + 20,000 driver at 20% = 24,000. Deposit and delivery are
    // not in the calculation at all.
    expect(calcCommission(100_000, 20_000, 20)).toBe(24_000);
  });

  it("gives the owner the rest, plus the delivery fee untouched", () => {
    // Delivery is the owner's own cost recovered — the platform takes no cut.
    expect(calcOwnerEarnings(100_000, 20_000, 5_000, 20)).toBe(101_000);
  });

  it("rounds to whole units", () => {
    // 33,333 at 20% is 6,666.6 — a fraction of a franc cannot be charged.
    expect(calcCommission(33_333, 0, 20)).toBe(6_667);
  });
});
