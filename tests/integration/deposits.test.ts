/**
 * Deposit lifecycle.
 *
 * The rule this file protects: a deposit is only HELD once money has actually
 * arrived. Writing it as HELD at booking time made the ledger claim funds the
 * platform did not have — a bug reconciliation caught with a −120,000
 * discrepancy, and the reason DepositStatus.PENDING exists at all.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma, resetDatabase, disconnect } from "../helpers/db";
import {
  makeClient,
  makeOwner,
  makeCar,
  paidBooking,
  makeSettings,
} from "../helpers/factories";
import { activateDeposit, voidPendingDeposit } from "@/lib/finance/deposits";
import { runReconciliation } from "@/lib/finance/reconciliation";

async function scenario(depositAmount = 60_000) {
  const client = await makeClient();
  const { profile } = await makeOwner();
  const car = await makeCar(profile.id);
  const booking = await paidBooking(car.id, client.id, {
    status: "PENDING_PAYMENT",
    deposit: depositAmount,
    leaveDepositPending: true,
  });
  return { client, profile, car, booking };
}

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

describe("activateDeposit", () => {
  it("moves a deposit from PENDING to HELD", async () => {
    const { booking } = await scenario();

    expect(booking.deposit!.status).toBe("PENDING");

    await activateDeposit(prisma, booking.id);

    const after = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(after.status).toBe("HELD");
  });

  it("is idempotent — a retried payment callback must not double-count", async () => {
    const { booking } = await scenario();

    await activateDeposit(prisma, booking.id);
    await activateDeposit(prisma, booking.id);
    await activateDeposit(prisma, booking.id);

    const movements = await prisma.depositMovement.count({
      where: { deposit: { bookingId: booking.id } },
    });
    // However many times it runs, the deposit is held exactly once.
    expect(movements).toBeLessThanOrEqual(1);

    const after = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(after.status).toBe("HELD");
    expect(after.amount).toBe(60_000);
  });

  it("does not resurrect a released deposit", async () => {
    const { booking } = await scenario();
    await activateDeposit(prisma, booking.id);

    await prisma.deposit.update({
      where: { bookingId: booking.id },
      data: { status: "RELEASED", clientRefundAmount: 60_000 },
    });

    await activateDeposit(prisma, booking.id);

    const after = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(after.status).toBe("RELEASED");
  });

  it("copes with a booking that has no deposit", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);
    const booking = await paidBooking(car.id, client.id, { deposit: 0 });

    await expect(activateDeposit(prisma, booking.id)).resolves.not.toThrow();
  });
});

describe("voidPendingDeposit", () => {
  it("clears a deposit whose payment never cleared", async () => {
    const { booking, client } = await scenario();

    await voidPendingDeposit(prisma, booking.id, client.id, "payment window expired");

    const after = await prisma.deposit.findUnique({
      where: { bookingId: booking.id },
    });
    // Either removed or marked released — never left claiming to hold money.
    expect(after === null || after.status !== "HELD").toBe(true);

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
  });

  it("refuses to void a deposit that is already HELD", async () => {
    const { booking, client } = await scenario();
    await activateDeposit(prisma, booking.id);

    const voided = await voidPendingDeposit(prisma, booking.id, client.id, "too late");

    // Money has arrived — this is no longer a no-op cancellation.
    expect(voided).toBe(false);
    const after = await prisma.deposit.findUniqueOrThrow({
      where: { bookingId: booking.id },
    });
    expect(after.status).toBe("HELD");
  });
});

describe("the ledger identity across a full lifecycle", () => {
  it("holds at every step from booking to release", async () => {
    const { booking } = await scenario();

    const check = async (label: string) => {
      const r = await runReconciliation();
      expect(r.depositDiscrepancy, `deposit identity broke ${label}`).toBe(0);
      expect(r.hasMismatch, `reconciliation broke ${label}`).toBe(false);
      return r;
    };

    await check("at creation");

    // Money arrives.
    await prisma.payment.updateMany({
      where: { bookingId: booking.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
    });
    await activateDeposit(prisma, booking.id);
    const held = await check("once payment cleared");
    expect(held.totalDepositsHeld).toBe(60_000);
    expect(held.depositsCollected).toBe(60_000);

    // Trip completes, deposit goes back.
    await prisma.deposit.update({
      where: { bookingId: booking.id },
      data: {
        status: "RELEASED",
        clientRefundAmount: 60_000,
        ownerAwardAmount: 0,
        releasedAt: new Date(),
      },
    });
    const released = await check("after release");
    expect(released.totalDepositsHeld).toBe(0);
    expect(released.totalDepositsReleased).toBe(60_000);
  });

  it("holds when a deposit is fully withheld", async () => {
    const { booking } = await scenario();

    await prisma.payment.updateMany({
      where: { bookingId: booking.id },
      data: { status: "CONFIRMED" },
    });
    await activateDeposit(prisma, booking.id);

    await prisma.deposit.update({
      where: { bookingId: booking.id },
      data: {
        status: "FULLY_WITHHELD",
        clientRefundAmount: 0,
        ownerAwardAmount: 60_000,
      },
    });

    const r = await runReconciliation();
    expect(r.totalDepositsWithheld).toBe(60_000);
    expect(r.depositDiscrepancy).toBe(0);
    expect(r.hasMismatch).toBe(false);
  });
});
