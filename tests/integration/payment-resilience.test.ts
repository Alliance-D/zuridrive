/**
 * What happens when the payment provider does not answer.
 *
 * MTN queues a request and prompts the renter's phone whether or not our
 * connection survives the reply. So a charge that times out is not a charge
 * that did not happen — it is a charge whose outcome we do not know yet, and
 * the only unrecoverable version of that is one we cannot name.
 *
 * The reference is therefore written down before the money is asked for. The
 * worst case becomes a payment somebody has to ask MTN about, rather than one
 * that arrives in the renter's statement and nowhere else.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import { makeOwner, makeCar, makeClient, paidBooking, makeSettings } from "../helpers/factories";

const session = vi.hoisted(() => ({ current: null as { user: { id: string } } | null }));
vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));

// A provider that behaves like a third party having a bad day.
const provider = vi.hoisted(() => ({
  charge: vi.fn(),
  canCollect: true,
  displayName: "Test MoMo",
}));
vi.mock("@/lib/payments", () => ({ getPaymentProvider: () => provider }));

const { POST } = await import("@/app/api/bookings/[id]/payment/route");

function request(body: unknown) {
  return new Request("http://test/api/bookings/x/payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  session.current = null;
  provider.charge.mockReset();
  provider.canCollect = true;
});

afterAll(disconnect);

async function pendingBooking() {
  const owner = await makeOwner();
  const client = await makeClient();
  const car = await makeCar(owner.profile.id);
  const booking = await paidBooking(car.id, client.id, { status: "PENDING_PAYMENT" });
  session.current = { user: { id: client.id } };
  return booking;
}

describe("a charge that fails in flight", () => {
  it("keeps the reference, so the payment can still be traced", async () => {
    const booking = await pendingBooking();
    provider.charge.mockRejectedValue(
      new Error("MTN MoMo did not respond within 20s — the payment may still be in progress"),
    );

    const res = await POST(
      request({ action: "initiate_momo", phoneNumber: "0788000000" }),
      { params: { id: booking.id } },
    );

    expect(res?.status).toBe(502);

    // The whole point: we can name the payment afterwards.
    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(payment?.momoReference).toBeTruthy();
  });

  it("charges under the reference it already recorded", async () => {
    const booking = await pendingBooking();
    provider.charge.mockResolvedValue({ reference: "ignored", redirectUrl: null });

    await POST(request({ action: "initiate_momo", phoneNumber: "0788000000" }), {
      params: { id: booking.id },
    });

    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    // The reference handed to the provider must be the one in our row, or
    // polling would look up something MTN has never heard of.
    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({ reference: payment?.momoReference }),
    );
  });

  it("does not mark the payment FAILED on a timeout", async () => {
    // A wrong FAILED is worse than an unknown: the prompt may be on the phone
    // at that moment, and the renter may still approve it.
    const booking = await pendingBooking();
    provider.charge.mockRejectedValue(new Error("socket hang up"));

    await POST(request({ action: "initiate_momo", phoneNumber: "0788000000" }), {
      params: { id: booking.id },
    });

    const payment = await prisma.payment.findFirst({ where: { bookingId: booking.id } });
    expect(payment?.status).toBe("PENDING");
  });

  it("leaves the booking payable rather than stranding it", async () => {
    const booking = await pendingBooking();
    provider.charge.mockRejectedValue(new Error("socket hang up"));

    await POST(request({ action: "initiate_momo", phoneNumber: "0788000000" }), {
      params: { id: booking.id },
    });

    const after = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(after?.status).toBe("PENDING_PAYMENT");
  });

  it("refuses to charge through a provider that cannot collect", async () => {
    const booking = await pendingBooking();
    provider.canCollect = false;

    const res = await POST(
      request({ action: "initiate_momo", phoneNumber: "0788000000" }),
      { params: { id: booking.id } },
    );

    expect(res?.status).toBe(409);
    expect(provider.charge).not.toHaveBeenCalled();
  });
});
