/**
 * MoMo settlement and the callback webhook.
 *
 * The security property under test: the callback body is NEVER trusted. MTN
 * does not sign these, so anyone who learns a reference could POST us a fake
 * "SUCCESSFUL". Settlement therefore ignores the body and asks MTN directly.
 * The forged-callback tests below fail if anyone ever "optimises" that away.
 *
 * The correctness property: settlement is idempotent. Callbacks are retried,
 * and the client polls at the same time, so the same reference arrives more
 * than once — often concurrently.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import {
  makeClient,
  makeOwner,
  makeCar,
  paidBooking,
  makePlans,
  makeSettings,
} from "../helpers/factories";
import { runReconciliation } from "@/lib/finance/reconciliation";

// What MTN will say when asked. Each test sets this.
let momoStatus: { status: string; reason?: string } = { status: "PENDING" };
const getPaymentStatusSpy = vi.fn(async (referenceId: string) => ({
  referenceId,
  ...momoStatus,
}));

vi.mock("@/lib/payments/momo", () => ({
  getPaymentStatus: (ref: string) => getPaymentStatusSpy(ref),
  requestToPay: vi.fn(async () => "generated-reference"),
  formatPhoneForMoMo: (p: string) => p.replace(/\D/g, ""),
}));

// settle.ts now asks getPaymentProvider() rather than importing MTN directly,
// so the seam these tests exercise moved. Without this the selector returns the
// DIRECT provider — which by design cannot collect and has no status to report —
// and every settlement assertion fails for the wrong reason.
//
// The stub still delegates to getPaymentStatusSpy, so each test controls the
// provider's answer exactly as before, and the rule under test is unchanged:
// settlement asks the provider and never trusts the callback body.
//
// Both selectors return the same stub. Settlement now picks the provider by
// the market that took the money — only the Ugandan MTN account can confirm a
// Ugandan payment — but which market is chosen is not what these tests are
// about, and mocking them apart would only mean writing the stub twice.
const momoStub = {
  id: "MTN_MOMO",
  displayName: "MTN Mobile Money",
  canCollect: true,
  charge: vi.fn(async () => ({ reference: "generated-reference", redirectUrl: null })),
  getStatus: async (ref: string) => {
    const r = await getPaymentStatusSpy(ref);
    return { reference: r.referenceId, status: r.status, reason: r.reason };
  },
  refund: vi.fn(),
  parseWebhook: () => ({ reference: null, signatureValid: false }),
};

vi.mock("@/lib/payments", () => ({
  getPaymentProvider: () => momoStub,
  getPaymentProviderForCountry: () => momoStub,
  paymentsEnabled: () => true,
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

const { settleBookingPayment, settleSubscriptionPayment, settleMoMoReference } =
  await import("@/lib/payments/settle");
const { POST: callback } = await import(
  "@/app/api/payments/momo/callback/route"
);
const { beginSubscriptionPurchase } = await import(
  "@/lib/subscriptions/checkout"
);

function callbackRequest(body: unknown) {
  return new Request("http://localhost/api/payments/momo/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

/** A booking awaiting a MoMo result. */
async function pendingBooking(reference = "ref-booking-1") {
  const client = await makeClient();
  const { profile } = await makeOwner();
  const car = await makeCar(profile.id);
  const booking = await paidBooking(car.id, client.id, {
    status: "PENDING_PAYMENT",
    leaveDepositPending: true,
    momoReference: reference,
  });
  return { client, booking, reference };
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  momoStatus = { status: "PENDING" };
  getPaymentStatusSpy.mockClear();
});

afterAll(disconnect);

describe("settling a booking payment", () => {
  it("confirms the booking and holds the deposit once MTN says SUCCESSFUL", async () => {
    const { booking, reference } = await pendingBooking();
    momoStatus = { status: "SUCCESSFUL" };

    const result = await settleBookingPayment(reference);

    expect(result.outcome).toBe("CONFIRMED");

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true, deposit: true },
    });
    expect(after.status).toBe("AWAITING_OWNER_CONFIRMATION");
    expect(after.paymentConfirmedAt).not.toBeNull();
    expect(after.payments[0].status).toBe("CONFIRMED");
    // The money has arrived, so the deposit is genuinely held now.
    expect(after.deposit!.status).toBe("HELD");

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });

  it("leaves everything alone while MTN still says PENDING", async () => {
    const { booking, reference } = await pendingBooking();
    momoStatus = { status: "PENDING" };

    expect((await settleBookingPayment(reference)).outcome).toBe("PENDING");

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true, deposit: true },
    });
    expect(after.status).toBe("PENDING_PAYMENT");
    expect(after.payments[0].status).toBe("PENDING");
    expect(after.deposit!.status).toBe("PENDING");
  });

  it("records the reason when MTN says FAILED", async () => {
    const { booking, reference } = await pendingBooking();
    momoStatus = { status: "FAILED", reason: "INSUFFICIENT_FUNDS" };

    expect((await settleBookingPayment(reference)).outcome).toBe("FAILED");

    const payment = await prisma.payment.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(payment.status).toBe("FAILED");
    expect(payment.failureReason).toBe("INSUFFICIENT_FUNDS");

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });

  it("shrugs at a reference it has never seen", async () => {
    const result = await settleBookingPayment("no-such-reference");
    expect(result.outcome).toBe("UNKNOWN_REFERENCE");
    // Never even asked MTN — there is nothing of ours to ask about.
    expect(getPaymentStatusSpy).not.toHaveBeenCalled();
  });
});

describe("idempotency", () => {
  it("settles once however many times it is called", async () => {
    const { booking, reference } = await pendingBooking();
    momoStatus = { status: "SUCCESSFUL" };

    const first = await settleBookingPayment(reference);
    const second = await settleBookingPayment(reference);
    const third = await settleBookingPayment(reference);

    expect(first.outcome).toBe("CONFIRMED");
    expect(second.outcome).toBe("ALREADY_SETTLED");
    expect(third.outcome).toBe("ALREADY_SETTLED");

    const payments = await prisma.payment.findMany({
      where: { bookingId: booking.id },
    });
    expect(payments).toHaveLength(1);

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
    expect(r.depositsCollected).toBe(60_000);
  });

  it("survives the webhook and the client polling at the same time", async () => {
    const { booking, reference } = await pendingBooking();
    momoStatus = { status: "SUCCESSFUL" };

    const results = await Promise.all([
      settleBookingPayment(reference),
      settleBookingPayment(reference),
      settleBookingPayment(reference),
      settleBookingPayment(reference),
    ]);

    // Exactly one call may do the work; the rest must see it as already done.
    const confirmed = results.filter((r) => r.outcome === "CONFIRMED");
    expect(confirmed).toHaveLength(1);

    const payments = await prisma.payment.count({
      where: { bookingId: booking.id },
    });
    expect(payments).toBe(1);

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });
});

describe("settling a subscription payment", () => {
  it("activates the plan when MTN says SUCCESSFUL", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    await makeCar(profile.id);

    const purchase = await beginSubscriptionPurchase(
      profile.id,
      plans.premium.id,
      "MTN_MOMO",
    );
    await prisma.ownerSubscription.update({
      where: { id: purchase.id },
      data: { momoReference: "ref-sub-1" },
    });

    momoStatus = { status: "SUCCESSFUL" };
    const result = await settleSubscriptionPayment("ref-sub-1");

    expect(result.outcome).toBe("CONFIRMED");

    const after = await prisma.ownerSubscription.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(after.status).toBe("ACTIVE");

    const owner = await prisma.carOwnerProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(owner.searchPriority).toBe(1);
    expect(owner.hasVerifiedBadge).toBe(true);
  });

  it("grants nothing while the payment is still pending", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();

    const purchase = await beginSubscriptionPurchase(
      profile.id,
      plans.premium.id,
      "MTN_MOMO",
    );
    await prisma.ownerSubscription.update({
      where: { id: purchase.id },
      data: { momoReference: "ref-sub-2" },
    });

    momoStatus = { status: "PENDING" };
    expect((await settleSubscriptionPayment("ref-sub-2")).outcome).toBe("PENDING");

    const after = await prisma.ownerSubscription.findUniqueOrThrow({
      where: { id: purchase.id },
    });
    expect(after.status).toBe("PENDING_PAYMENT");

    const owner = await prisma.carOwnerProfile.findUniqueOrThrow({
      where: { id: profile.id },
    });
    expect(owner.hasVerifiedBadge).toBe(false);
  });
});

describe("dispatching by reference", () => {
  it("routes a booking reference to the booking path", async () => {
    const { reference } = await pendingBooking("ref-dispatch-booking");
    momoStatus = { status: "SUCCESSFUL" };

    const result = await settleMoMoReference(reference);
    expect(result.kind).toBe("BOOKING");
  });

  it("routes a subscription reference to the subscription path", async () => {
    const plans = await makePlans();
    const { profile } = await makeOwner();
    const purchase = await beginSubscriptionPurchase(
      profile.id,
      plans.basic.id,
      "MTN_MOMO",
    );
    await prisma.ownerSubscription.update({
      where: { id: purchase.id },
      data: { momoReference: "ref-dispatch-sub" },
    });

    momoStatus = { status: "SUCCESSFUL" };
    const result = await settleMoMoReference("ref-dispatch-sub");
    expect(result.kind).toBe("SUBSCRIPTION");
  });
});

describe("the callback webhook", () => {
  it("settles a real payment when MTN confirms it", async () => {
    const { booking, reference } = await pendingBooking("ref-webhook-1");
    momoStatus = { status: "SUCCESSFUL" };

    const res = await callback(callbackRequest({ referenceId: reference }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.outcome).toBe("CONFIRMED");

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(after.status).toBe("AWAITING_OWNER_CONFIRMATION");
  });

  it("IGNORES a forged SUCCESSFUL body and believes MTN instead", async () => {
    const { booking, reference } = await pendingBooking("ref-forged");
    // MTN's truth: the payment never went through.
    momoStatus = { status: "PENDING" };

    // The attacker's claim.
    const res = await callback(
      callbackRequest({
        referenceId: reference,
        status: "SUCCESSFUL",
        amount: "150000",
      }),
    );
    const data = await res.json();

    expect(data.outcome).toBe("PENDING");

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { payments: true, deposit: true },
    });
    // Nothing moved. A forged callback buys the attacker nothing.
    expect(after.status).toBe("PENDING_PAYMENT");
    expect(after.payments[0].status).toBe("PENDING");
    expect(after.deposit!.status).toBe("PENDING");
  });

  it("asks MTN even when the body claims FAILED", async () => {
    const { booking, reference } = await pendingBooking("ref-forged-fail");
    momoStatus = { status: "SUCCESSFUL" };

    await callback(callbackRequest({ referenceId: reference, status: "FAILED" }));

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    // MTN said SUCCESSFUL, so the booking is confirmed despite the body.
    expect(after.status).toBe("AWAITING_OWNER_CONFIRMATION");
  });

  it("answers 200 for an unknown reference so MTN stops retrying", async () => {
    const res = await callback(callbackRequest({ referenceId: "never-seen" }));
    expect(res.status).toBe(200);
    expect((await res.json()).handled).toBe(false);
  });

  it("answers 200 for a payload with no reference", async () => {
    const res = await callback(callbackRequest({ status: "SUCCESSFUL" }));
    expect(res.status).toBe(200);
    expect((await res.json()).reason).toBe("no reference id");
  });

  it("accepts the reference from externalId or financialTransactionId", async () => {
    const { reference } = await pendingBooking("ref-alt-key");
    momoStatus = { status: "SUCCESSFUL" };

    const res = await callback(callbackRequest({ externalId: reference }));
    expect((await res.json()).outcome).toBe("CONFIRMED");
  });

  it("does not fall over on an unparseable body", async () => {
    const bad = new Request("http://localhost/api/payments/momo/callback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{{{not json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    const res = await callback(bad);
    expect(res.status).toBe(200);
    expect((await res.json()).reason).toBe("unparseable body");
  });
});
