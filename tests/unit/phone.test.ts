/**
 * Phone normalisation across markets.
 *
 * The phone number is the account identifier, so it must be stored in exactly
 * one shape: 0788123456 and +250788123456 are the same person, and a unique
 * constraint does not know that.
 *
 * The rules became a table so a second market is an entry rather than an edit.
 * The case worth reading carefully is the last group — a Ugandan number typed
 * into the Rwandan site has to work, because someone in Kigali with a Ugandan
 * phone is exactly the traveller this platform is for.
 */

import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  isValidPhone,
  formatPhone,
  countryOfPhone,
  normalizeRwandaPhone,
  PHONE_FORMATS,
} from "@/lib/phone";

describe("normalising a number", () => {
  it("accepts the three ways a Rwandan writes their own number", () => {
    for (const input of ["0788123456", "+250788123456", "250788123456"]) {
      expect(normalizePhone(input, "RW")).toBe("+250788123456");
    }
  });

  it("ignores spaces, dashes and brackets", () => {
    expect(normalizePhone("078 812 34 56", "RW")).toBe("+250788123456");
    expect(normalizePhone("+250-788-123-456", "RW")).toBe("+250788123456");
    expect(normalizePhone("(0788) 123456", "RW")).toBe("+250788123456");
  });

  it("handles each market on its own prefix", () => {
    expect(normalizePhone("0772123456", "UG")).toBe("+256772123456");
    expect(normalizePhone("0712123456", "KE")).toBe("+254712123456");
    expect(normalizePhone("0754123456", "TZ")).toBe("+255754123456");
  });

  it("refuses what is not a number for that market", () => {
    expect(normalizePhone("12345", "RW")).toBeNull();
    expect(normalizePhone("078812345", "RW")).toBeNull(); // one digit short
    expect(normalizePhone("07881234567", "RW")).toBeNull(); // one too many
    expect(normalizePhone("abcdefghij", "RW")).toBeNull();
  });

  it("refuses a market it does not know", () => {
    expect(normalizePhone("0788123456", "ZZ")).toBeNull();
  });
});

describe("a number from another market", () => {
  it("accepts a Ugandan number typed into the Rwandan site", () => {
    // The cross-border traveller. Rejecting this would lock out the person the
    // platform most wants: someone hiring a car in a country they are visiting.
    expect(normalizePhone("+256772123456", "RW")).toBe("+256772123456");
  });

  it("knows which market a number actually belongs to", () => {
    expect(countryOfPhone("+250788123456")).toBe("RW");
    expect(countryOfPhone("+256772123456")).toBe("UG");
    expect(countryOfPhone("+44207123456")).toBeNull();
  });

  it("groups a foreign number by its own market, not the viewer's", () => {
    expect(formatPhone("+256772123456", "RW")).toBe("+256 772 123 456");
  });
});

describe("display", () => {
  it("groups digits readably", () => {
    expect(formatPhone("0788123456", "RW")).toBe("+250 788 123 456");
  });

  it("hands back anything it cannot parse, rather than mangling it", () => {
    expect(formatPhone("not a number", "RW")).toBe("not a number");
  });
});

describe("the format table", () => {
  it("groups exactly as many digits as the market has", () => {
    // A grouping that does not sum to the digit count would drop or duplicate
    // digits on screen.
    for (const f of Object.values(PHONE_FORMATS)) {
      const grouped = f.grouping.reduce((a, b) => a + b, 0);
      expect(grouped, `${f.code} grouping`).toBe(f.nationalDigits);
    }
  });

  it("gives every market a distinct prefix", () => {
    const prefixes = Object.values(PHONE_FORMATS).map((f) => f.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

describe("the old Rwanda-only names", () => {
  it("still behave exactly as they did", () => {
    // Kept so existing call sites keep working and keep meaning what they said.
    expect(normalizeRwandaPhone("0788123456")).toBe("+250788123456");
    expect(normalizeRwandaPhone("12345")).toBeNull();
    expect(isValidPhone("0788123456", "RW")).toBe(true);
  });
});
