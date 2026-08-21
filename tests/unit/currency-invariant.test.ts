/**
 * What is shown and what is charged must be the same currency.
 *
 * Display currency became configurable while the MoMo client still had
 * 'RWF' hardcoded. Pointing a deployment at another market would have shown
 * one currency on screen and asked MTN to collect the same number in another —
 * "UGX 50,000" displayed, RWF 50,000 taken, roughly twelve times the price.
 *
 * Nothing would have thrown. The amounts would simply have been wrong, on
 * every booking, until somebody reconciled by hand.
 *
 * This is a source-level check rather than a behavioural one on purpose: the
 * failure it guards against is a literal creeping back into the payment
 * client, and by the time that can be observed at runtime the money has moved.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { currencyCode } from "@/lib/currency";

const momoSource = readFileSync("lib/payments/momo.ts", "utf8");

describe("display and charge currency", () => {
  it("sends MTN the configured market currency", () => {
    const assignment = momoSource.match(/const MOMO_CURRENCY = (.+)/)?.[1] ?? "";

    // It must read configuration. A bare string literal here is the bug.
    expect(assignment).toContain("process.env");
  });

  it("does not hardcode a currency literal as the value sent to MTN", () => {
    const assignment = momoSource.match(/const MOMO_CURRENCY = (.+)/)?.[1] ?? "";

    // A fallback literal is fine — that is the default market. What is not
    // fine is the whole value being a literal with no configuration behind it.
    expect(/^\s*['"][A-Z]{3}['"]\s*$/.test(assignment)).toBe(false);
  });

  it("falls back to the same default the display side does", () => {
    // An unconfigured deployment must be Rwanda on both sides, not Rwanda on
    // one and something else on the other.
    const fallback = momoSource
      .match(/const MOMO_CURRENCY = .*\|\|\s*['"]([A-Z]{3})['"]/)?.[1];

    expect(fallback).toBe("RWF");
    expect(currencyCode).toBe("RWF");
  });

  it("reads the same environment variable the display side reads", () => {
    const assignment = momoSource.match(/const MOMO_CURRENCY = (.+)/)?.[1] ?? "";

    // Two different variables would drift the first time somebody set one and
    // not the other.
    expect(assignment).toContain("NEXT_PUBLIC_CURRENCY");
  });
});
