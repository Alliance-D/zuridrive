/**
 * SMS goes out in the recipient's language.
 *
 * The thing worth guarding here is not that a translation exists — check:sms
 * proves that — but that `sendSms` looks the recipient up and renders against
 * *their* locale. Every call site was converted by hand, and the failure mode
 * if the lookup regresses is silent: the SMS still sends, still says something
 * sensible, and is simply in the wrong language for the person reading it.
 *
 * Africa's Talking is never contacted: setup.ts leaves AT credentials set but
 * these assertions read the SmsLog row, which stores the rendered body.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeClient, phone } from "../helpers/factories";
import { sendSms } from "@/lib/sms";
import { renderSms } from "@/lib/sms-i18n";

// Intercept the HTTP call rather than the module, so the whole of sendSms —
// locale lookup, rendering, logging — runs exactly as it does in production.
beforeEach(async () => {
  // Same contract as every other integration suite: start from an empty
  // database. The phone-number counter in the factories restarts each run,
  // so leftover rows would collide on the unique phone column.
  await resetDatabase();

  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        SMSMessageData: {
          Message: "Sent to 1/1",
          Recipients: [
            {
              statusCode: "101",
              number: "+250788000000",
              status: "Success",
              messageId: "test-message",
              cost: "RWF 0.0000",
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
});

/** The body as it was actually sent, read back off the audit trail. */
async function sentBody(userPhone: string): Promise<string> {
  const log = await prisma.smsLog.findFirst({
    where: { phone: userPhone },
    orderBy: { createdAt: "desc" },
  });
  return log?.message ?? "";
}

afterAll(disconnect);

describe("SMS language", () => {
  it("renders in the recipient's stored locale", async () => {
    const reader = await makeClient({ locale: "rw" });

    await sendSms({
      to: reader.phone,
      userId: reader.id,
      messageKey: "listingLive",
      params: { car: "Toyota RAV4" },
    });

    const body = await sentBody(reader.phone);
    expect(body).toBe(renderSms("listingLive", { car: "Toyota RAV4" }, "rw"));
    expect(body).toContain("iragaragara");
  });

  it("resolves the locale by phone when the caller has no userId", async () => {
    // Plenty of call sites only have a number off a relation. That must not
    // quietly downgrade the reader to English.
    const reader = await makeClient({ locale: "rw" });

    await sendSms({
      to: reader.phone,
      messageKey: "listingLive",
      params: { car: "Toyota RAV4" },
    });

    expect(await sentBody(reader.phone)).toContain("iragaragara");
  });

  it("sends English to an English reader", async () => {
    const reader = await makeClient({ locale: "en" });

    await sendSms({
      to: reader.phone,
      userId: reader.id,
      messageKey: "listingLive",
      params: { car: "Toyota RAV4" },
    });

    expect(await sentBody(reader.phone)).toContain("is now live");
  });

  it("falls back to English for a recipient who has no account", async () => {
    const stranger = phone();

    await sendSms({
      to: stranger,
      messageKey: "listingLive",
      params: { car: "Toyota RAV4" },
    });

    expect(await sentBody(stranger)).toContain("is now live");
  });

  it("logs the rendered text, not the key", async () => {
    // The SmsLog is the compliance record: it has to show what the person
    // received, in the language they received it.
    const reader = await makeClient({ locale: "rw" });

    await sendSms({
      to: reader.phone,
      userId: reader.id,
      messageKey: "depositReleased",
      params: { amount: "RWF 50,000", reference: "ZD-1" },
    });

    const body = await sentBody(reader.phone);
    expect(body).not.toContain("depositReleased");
    expect(body).toContain("RWF 50,000");
    expect(body).toContain("ZD-1");
  });

  it("still sends when a locale has no translation of its own", async () => {
    // sw and fr are declared in routing but their message files are empty.
    // An English SMS is worth sending; a raw message key is not.
    const reader = await makeClient({ locale: "sw" });

    await sendSms({
      to: reader.phone,
      userId: reader.id,
      messageKey: "listingLive",
      params: { car: "Toyota RAV4" },
    });

    expect(await sentBody(reader.phone)).toContain("is now live");
  });

  it("keeps every SMS inside the GSM-7 alphabet once rendered", async () => {
    // A single character outside GSM-7 triples what a message costs to send,
    // and params flow in from user data.
    const body = renderSms(
      "listingSuspended",
      { car: "Toyota RAV4", reason: "Insurance expired." },
      "rw",
    );

    expect(body).not.toMatch(/[‐-―‘’“”]/);
  });
});
