/**
 * Spotting a phone number in a renter's note.
 *
 * The note exists so a renter can tell an owner what they need to know before
 * a handover. Occasionally somebody uses it to say "call me on 0788…, we can
 * arrange it cheaper directly", which is how a marketplace loses the booking
 * it introduced.
 *
 * The bar is deliberately "probably a phone number", and the consequence is
 * that an admin can see it — not that the renter is stopped mid-booking.
 * Which is why the tests that matter most are the second group: a false
 * positive on a flight number would be infuriating, and infuriating people
 * over a false alarm costs more than the occasional missed number.
 */

import { describe, it, expect } from "vitest";
import { findContactDetails, hasContactDetails } from "@/lib/contact-detection";

describe("what should be flagged", () => {
  it("spots a plain local number", () => {
    expect(hasContactDetails("call me on 0788123456")).toBe(true);
  });

  it("spots an international number", () => {
    expect(hasContactDetails("my number is +250 788 123 456")).toBe(true);
  });

  it("spots one written with separators", () => {
    expect(hasContactDetails("reach me 0788-123-456")).toBe(true);
    expect(hasContactDetails("0788.123.456")).toBe(true);
    expect(hasContactDetails("(0788) 123456")).toBe(true);
  });

  it("spots a number spelled out in words", () => {
    // Somebody writing "zero seven eight eight" is not doing it by accident.
    expect(
      hasContactDetails("zero seven eight eight one two three four five six"),
    ).toBe(true);
  });

  it("spots one spelled out in Kinyarwanda", () => {
    expect(
      hasContactDetails("zeru karindwi umunani umunani rimwe kabiri gatatu kane"),
    ).toBe(true);
  });

  it("says why, so an admin is not left guessing", () => {
    const [match] = findContactDetails("call me on 0788123456");
    expect(match.reason).toMatch(/digits/);
    expect(match.text).toContain("0788123456");
  });
});

describe("what must not be flagged", () => {
  it("leaves a flight number alone", () => {
    expect(hasContactDetails("Landing at 11pm, flight WB204")).toBe(false);
  });

  it("leaves a plate alone", () => {
    expect(hasContactDetails("Plate RAD 123 X, meet at gate 2")).toBe(false);
  });

  it("leaves dates and times alone", () => {
    expect(hasContactDetails("Arriving 22/08 around 4pm")).toBe(false);
    expect(hasContactDetails("I land at 23:45 on the 3rd")).toBe(false);
  });

  it("leaves amounts alone", () => {
    expect(hasContactDetails("Budget is 45,000 per day")).toBe(false);
  });

  it("leaves ordinary requests alone", () => {
    expect(hasContactDetails("I'll need a child seat for a 3 year old")).toBe(false);
    expect(hasContactDetails("Please have the tank full, I'm driving to Musanze")).toBe(false);
  });

  it("handles nothing at all", () => {
    expect(hasContactDetails("")).toBe(false);
    expect(hasContactDetails("   ")).toBe(false);
  });

  it("does not flag a short run of digits", () => {
    // Eight digits is not a number in any market here.
    expect(hasContactDetails("reference 12345678")).toBe(false);
  });
});
