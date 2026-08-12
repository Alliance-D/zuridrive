/**
 * Sentry payload scrubbing.
 *
 * This platform holds national ID numbers, driving licence numbers, phone
 * numbers, MoMo numbers and bank account details. An error tracker that
 * captured them would become a second, less-protected copy of all of it on a
 * third-party server — which the Privacy Policy explicitly says we do not do.
 *
 * These tests are the enforcement of that promise.
 */

import { describe, it, expect } from "vitest";
import { baseOptions } from "@/lib/observability/sentry-options";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const send = (event: any) => baseOptions.beforeSend(event, {} as any) as any;

describe("request data", () => {
  it("drops the body entirely", () => {
    const out = send({
      request: {
        url: "https://zuridrive.rw/api/bookings",
        data: { nationalId: "1199012345678", licenseNumber: "DL-99" },
      },
    });
    expect(out.request.data).toBeUndefined();
  });

  it("drops cookies and headers", () => {
    const out = send({
      request: {
        cookies: { "next-auth.session-token": "secret-session" },
        headers: { authorization: "Bearer abc", cookie: "a=b" },
      },
    });
    expect(out.request.cookies).toBeUndefined();
    expect(out.request.headers).toBeUndefined();
  });

  it("redacts the query string", () => {
    const out = send({
      request: { url: "https://zuridrive.rw/x", query_string: "phone=0788123456" },
    });
    expect(out.request.query_string).toBe("[redacted]");
    expect(JSON.stringify(out)).not.toContain("0788123456");
  });

  it("drops the user object", () => {
    const out = send({ user: { id: "u1", email: "a@b.rw", ip_address: "1.2.3.4" } });
    expect(out.user).toBeUndefined();
  });
});

describe("sensitive keys anywhere in the payload", () => {
  it("redacts identity and payout fields by name", () => {
    const out = send({
      extra: {
        nationalId: "1199012345678",
        licenseNumber: "DL-4477",
        momoNumber: "+250788123456",
        bankAccountNumber: "0001234567",
        email: "someone@example.rw",
        harmless: "keep me",
      },
    });

    expect(out.extra.nationalId).toBe("[redacted]");
    expect(out.extra.licenseNumber).toBe("[redacted]");
    expect(out.extra.momoNumber).toBe("[redacted]");
    expect(out.extra.bankAccountNumber).toBe("[redacted]");
    expect(out.extra.email).toBe("[redacted]");
    // Non-sensitive context still gets through — the point is to debug errors.
    expect(out.extra.harmless).toBe("keep me");
  });

  it("reaches into nested structures", () => {
    const out = send({
      contexts: {
        booking: { client: { profile: { phone: "+250788123456" } } },
      },
    });
    expect(JSON.stringify(out)).not.toContain("788123456");
  });

  it("reaches into arrays", () => {
    const out = send({
      extra: { passengers: [{ nationalId: "1199012345678" }, { nationalId: "1199087654321" }] },
    });
    expect(JSON.stringify(out)).not.toContain("1199012345678");
  });
});

describe("values that leak through free text", () => {
  it("redacts a phone number embedded in a message", () => {
    const out = send({
      message: "Failed to send SMS to +250788123456 for booking ZD-1",
    });
    expect(out.message).not.toContain("788123456");
    expect(out.message).toContain("ZD-1");
  });

  it("catches every Rwandan phone format we accept", () => {
    for (const number of ["+250788123456", "250788123456", "0788123456", "788123456"]) {
      const out = send({ message: `error for ${number}` });
      expect(out.message, `leaked ${number}`).not.toContain("88123456");
    }
  });

  it("redacts long ID-like numbers", () => {
    const out = send({ message: "national id 1199012345678 rejected" });
    expect(out.message).not.toContain("1199012345678");
  });

  it("leaves ordinary numbers alone", () => {
    const out = send({ message: "booking total was 90000 RWF over 2 days" });
    expect(out.message).toContain("90000");
    expect(out.message).toContain("2 days");
  });
});

describe("robustness", () => {
  it("survives a deeply nested payload without hanging", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let deep: any = { phone: "+250788123456" };
    for (let i = 0; i < 40; i++) deep = { nested: deep };

    const out = send({ extra: deep });
    expect(out).toBeDefined();
  });

  it("handles an empty event", () => {
    expect(send({})).toBeDefined();
  });
});

describe("configuration", () => {
  it("never sends PII by default", () => {
    expect(baseOptions.sendDefaultPii).toBe(false);
  });

  it("is disabled without a DSN", () => {
    // No SENTRY_DSN is set in tests, so nothing can be transmitted.
    expect(baseOptions.enabled).toBe(false);
  });

  it("ignores Next's control-flow exceptions", () => {
    expect(baseOptions.ignoreErrors).toContain("NEXT_REDIRECT");
    expect(baseOptions.ignoreErrors).toContain("NEXT_NOT_FOUND");
  });
});
