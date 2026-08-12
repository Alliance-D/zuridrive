/**
 * Cancellation — fee, refunds and the dispute path.
 *
 * These call the REAL route handler rather than reimplementing its arithmetic,
 * because a test that recomputes the fee itself would pass even if the route
 * stopped charging one. The session is mocked; everything below it is real.
 *
 * The rule that matters most here: the deposit ledger and the payment ledger
 * must never both record the same refund. Getting that wrong produced a
 * −60,000 discrepancy twice during development.
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import {
  makeClient,
  makeOwner,
  makeCar,
  paidBooking,
  makeSettings,
} from "../helpers/factories";
import { runReconciliation } from "@/lib/finance/reconciliation";

// Who is calling. Each test sets this before invoking the route.
let currentUserId: string | null = null;

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () =>
    currentUserId ? { user: { id: currentUserId } } : null,
  ),
}));

// SMS must never fire in tests, and must never fail a cancellation.
vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => ({ success: true })),
  SMS_TEMPLATES: new Proxy({}, { get: () => () => "sms" }),
}));

const { POST: cancel } = await import("@/app/api/bookings/[id]/cancel/route");
const { POST: disputeFee } = await import(
  "@/app/api/bookings/[id]/dispute-cancellation/route"
);

function request(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}

/** hoursOut controls whether the cancellation lands inside the fee window. */
async function bookingStartingIn(hoursOut: number, deposit = 60_000) {
  const client = await makeClient();
  const { profile, user: ownerUser } = await makeOwner();
  const car = await makeCar(profile.id);
  const booking = await paidBooking(car.id, client.id, {
    status: "CONFIRMED",
    rental: 90_000,
    deposit,
    startDate: new Date(Date.now() + hoursOut * 36e5),
    endDate: new Date(Date.now() + (hoursOut + 48) * 36e5),
  });
  return { client, ownerUser, booking };
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
  currentUserId = null;
});

afterAll(disconnect);

describe("cancelling early", () => {
  it("returns everything and charges no fee", async () => {
    const { client, booking } = await bookingStartingIn(72);
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Plans changed" }), {
      params: { id: booking.id },
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.cancellationFee).toBe(0);
    expect(data.canDisputeFee).toBe(false);

    const deposit = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(deposit.status).toBe("RELEASED");
    expect(deposit.ownerAwardAmount).toBe(0);

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
    // The void reverses both portions, so nothing is left collected.
    expect(r.rentalCollected).toBe(0);
    expect(r.depositsCollected).toBe(0);
  });
});

describe("cancelling late", () => {
  it("keeps 50% of the deposit and returns the rental in full", async () => {
    const { client, booking } = await bookingStartingIn(12);
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Something came up" }), {
      params: { id: booking.id },
    });
    const data = await res.json();

    expect(data.cancellationFee).toBe(30_000);
    expect(data.canDisputeFee).toBe(true);

    const deposit = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(deposit.status).toBe("PARTIALLY_WITHHELD");
    expect(deposit.ownerAwardAmount).toBe(30_000);
    expect(deposit.clientRefundAmount).toBe(30_000);

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
    // Rental went back as its own refund row; the deposit stays collected.
    expect(r.rentalRefunded).toBe(90_000);
    expect(r.netRentalCollected).toBe(0);
    expect(r.depositsCollected).toBe(60_000);
    expect(r.totalDepositsWithheld).toBe(30_000);
    expect(r.totalDepositsReleased).toBe(30_000);
  });

  it("records a movement explaining the fee", async () => {
    const { client, booking } = await bookingStartingIn(6);
    currentUserId = client.id;

    await cancel(request({ reason: "Emergency" }), { params: { id: booking.id } });

    const movement = await prisma.depositMovement.findFirstOrThrow({
      where: { deposit: { bookingId: booking.id } },
    });
    expect(movement.amount).toBe(30_000);
    expect(movement.toStatus).toBe("PARTIALLY_WITHHELD");
    expect(movement.reason).toMatch(/50%/);
  });

  it("charges NOTHING when the owner cancels late", async () => {
    const { ownerUser, booking } = await bookingStartingIn(2);
    currentUserId = ownerUser.id;

    const res = await cancel(request({ reason: "Car broke down" }), {
      params: { id: booking.id },
    });
    const data = await res.json();

    // An owner who pulls out must never profit from doing so.
    expect(data.cancellationFee).toBe(0);

    const deposit = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(deposit.ownerAwardAmount).toBe(0);
    expect(deposit.status).toBe("RELEASED");

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });

  it("charges no fee when no deposit was collected", async () => {
    const { client, booking } = await bookingStartingIn(3, 0);
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Changed my mind" }), {
      params: { id: booking.id },
    });
    const data = await res.json();

    expect(data.cancellationFee).toBe(0);
    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });
});

describe("the fee is configurable", () => {
  it("honours a changed percentage", async () => {
    await makeSettings({ lateCancellationFeePercent: 25 });
    const { client, booking } = await bookingStartingIn(6);
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Plans changed" }), {
      params: { id: booking.id },
    });
    expect((await res.json()).cancellationFee).toBe(15_000);
  });

  it("honours a widened window", async () => {
    await makeSettings({ lateCancellationWindowHours: 96 });
    const { client, booking } = await bookingStartingIn(72);
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Plans changed" }), {
      params: { id: booking.id },
    });
    // 72h out is now inside a 96h window.
    expect((await res.json()).cancellationFee).toBe(30_000);
  });

  it("charges nothing when the fee is set to zero", async () => {
    await makeSettings({ lateCancellationFeePercent: 0 });
    const { client, booking } = await bookingStartingIn(1);
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Plans changed" }), {
      params: { id: booking.id },
    });
    expect((await res.json()).cancellationFee).toBe(0);

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });
});

describe("permissions", () => {
  it("refuses an anonymous caller", async () => {
    const { booking } = await bookingStartingIn(48);
    currentUserId = null;

    const res = await cancel(request({ reason: "Plans changed" }), {
      params: { id: booking.id },
    });
    expect(res.status).toBe(401);
  });

  it("refuses a stranger", async () => {
    const { booking } = await bookingStartingIn(48);
    const stranger = await makeClient();
    currentUserId = stranger.id;

    const res = await cancel(request({ reason: "Not mine" }), {
      params: { id: booking.id },
    });
    expect(res.status).toBe(403);

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
    });
    expect(after.status).toBe("CONFIRMED");
  });

  it("refuses to cancel a trip already under way", async () => {
    const { client, booking } = await bookingStartingIn(-2);
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: "ACTIVE" },
    });
    currentUserId = client.id;

    const res = await cancel(request({ reason: "Too late" }), {
      params: { id: booking.id },
    });
    expect(res.status).toBe(409);
  });
});

describe("disputing the fee", () => {
  async function cancelledLate() {
    const { client, booking } = await bookingStartingIn(6);
    currentUserId = client.id;
    await cancel(request({ reason: "Emergency" }), { params: { id: booking.id } });
    return { client, booking };
  }

  it("opens a dispute and moves the booking to DISPUTED", async () => {
    const { booking } = await cancelledLate();

    const res = await disputeFee(
      request({
        reason: "The owner told me the car was unavailable and to cancel.",
        proofUrls: ["https://res.cloudinary.com/demo/image/upload/v1/proof.jpg"],
      }),
      { params: { id: booking.id } },
    );

    expect(res.status).toBe(201);

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { dispute: true },
    });
    expect(after.status).toBe("DISPUTED");
    expect(after.dispute).not.toBeNull();
    // The evidence has to survive with the dispute record.
    expect(after.dispute!.description).toMatch(/proof\.jpg/);
  });

  it("rejects a dispute with too short a reason", async () => {
    const { booking } = await cancelledLate();
    const res = await disputeFee(request({ reason: "unfair" }), {
      params: { id: booking.id },
    });
    expect(res.status).toBe(400);
  });

  it("refuses a second dispute on the same booking", async () => {
    const { booking } = await cancelledLate();
    const body = { reason: "The owner cancelled on me, not the other way round." };

    await disputeFee(request(body), { params: { id: booking.id } });
    const second = await disputeFee(request(body), { params: { id: booking.id } });

    expect(second.status).toBe(409);
  });

  it("refuses when no fee was charged", async () => {
    const { client, booking } = await bookingStartingIn(72);
    currentUserId = client.id;
    await cancel(request({ reason: "Plans changed" }), {
      params: { id: booking.id },
    });

    const res = await disputeFee(
      request({ reason: "I want all of my money back please, all of it." }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(409);
  });

  it("refuses a stranger", async () => {
    const { booking } = await cancelledLate();
    const stranger = await makeClient();
    currentUserId = stranger.id;

    const res = await disputeFee(
      request({ reason: "Let me dispute someone else's cancellation fee." }),
      { params: { id: booking.id } },
    );
    expect(res.status).toBe(403);
  });

  it("returns the whole deposit when resolved for the client", async () => {
    const { booking } = await cancelledLate();
    await disputeFee(
      request({ reason: "The owner made it impossible to go ahead with this." }),
      { params: { id: booking.id } },
    );

    // What an admin resolving for the client does.
    const deposit = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        status: "RELEASED",
        clientRefundAmount: 60_000,
        ownerAwardAmount: 0,
      },
    });
    await prisma.depositMovement.create({
      data: {
        depositId: deposit.id,
        fromStatus: "PARTIALLY_WITHHELD",
        toStatus: "RELEASED",
        amount: 30_000,
        reason: "Dispute resolved for the client",
        actorId: booking.clientId,
      },
    });

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
    expect(r.totalDepositsWithheld).toBe(0);
    expect(r.totalDepositsReleased).toBe(60_000);
  });
});
