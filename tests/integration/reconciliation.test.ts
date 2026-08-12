/**
 * Reconciliation — the two identities the whole finance system rests on.
 *
 *   1. commission + owner earnings == the commissionable base (COMPLETED trips)
 *   2. deposits collected == held + returned + withheld
 *
 * These caught three real bugs during development: deposits marked HELD before
 * payment cleared, and a cancellation refund counted twice in two separate
 * routes. The tests below reproduce each of those situations deliberately, so
 * that if anyone reintroduces them the suite fails instead of the books.
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
import { runReconciliation } from "@/lib/finance/reconciliation";

beforeEach(async () => {
  await resetDatabase();
  await makeSettings();
});

afterAll(disconnect);

describe("an empty ledger", () => {
  it("balances at zero", async () => {
    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
    expect(r.discrepancyAmount).toBe(0);
    expect(r.rentalCollected).toBe(0);
    expect(r.depositsCollected).toBe(0);
  });
});

describe("a completed trip", () => {
  it("balances, and splits commission from owner earnings", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    await paidBooking(car.id, client.id, {
      status: "COMPLETED",
      rental: 90_000,
      deposit: 60_000,
      commissionRate: 20,
    });

    const r = await runReconciliation();

    expect(r.hasMismatch).toBe(false);
    expect(r.discrepancyAmount).toBe(0);
    expect(r.rentalCollected).toBe(90_000);
    expect(r.depositsCollected).toBe(60_000);
    expect(r.totalCommission).toBe(18_000);
    expect(r.ownerEarningsRealised).toBe(72_000);
    // Identity 1.
    expect(r.totalCommission + r.ownerEarningsRealised).toBe(90_000);
  });

  it("stays balanced across many bookings", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    for (let i = 0; i < 12; i++) {
      await paidBooking(car.id, client.id, {
        status: "COMPLETED",
        rental: 10_000 + i * 3_333,
        deposit: 5_000 + i * 1_111,
        commissionRate: [0, 12, 15, 20, 33][i % 5],
      });
    }

    const r = await runReconciliation();
    expect(r.hasMismatch).toBe(false);
    expect(r.discrepancyAmount).toBe(0);
  });
});

describe("deposit lifecycle", () => {
  it("counts a deposit as collected only once payment has cleared", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    // The bug this reproduces: the deposit was written as HELD while the
    // payment was still pending, so the ledger claimed money we did not have.
    await paidBooking(car.id, client.id, {
      status: "PENDING_PAYMENT",
      deposit: 60_000,
      leaveDepositPending: true,
    });

    const r = await runReconciliation();

    expect(r.pendingDeposits).toBe(60_000);
    expect(r.totalDepositsHeld).toBe(0);
    expect(r.hasMismatch).toBe(false);
  });

  it("balances when a deposit is released in full", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    const booking = await paidBooking(car.id, client.id, {
      status: "COMPLETED",
      deposit: 60_000,
    });

    await prisma.deposit.update({
      where: { id: booking.deposit!.id },
      data: { status: "RELEASED", clientRefundAmount: 60_000, ownerAwardAmount: 0 },
    });

    const r = await runReconciliation();
    expect(r.totalDepositsReleased).toBe(60_000);
    expect(r.depositDiscrepancy).toBe(0);
    expect(r.hasMismatch).toBe(false);
  });

  it("balances on a partial withholding", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    const booking = await paidBooking(car.id, client.id, {
      status: "COMPLETED",
      deposit: 60_000,
    });

    await prisma.deposit.update({
      where: { id: booking.deposit!.id },
      data: {
        status: "PARTIALLY_WITHHELD",
        clientRefundAmount: 45_000,
        ownerAwardAmount: 15_000,
      },
    });

    const r = await runReconciliation();
    // Identity 2: collected == held + returned + withheld.
    expect(
      r.totalDepositsHeld + r.totalDepositsReleased + r.totalDepositsWithheld,
    ).toBe(r.depositsCollected);
    expect(r.depositDiscrepancy).toBe(0);
    expect(r.hasMismatch).toBe(false);
  });
});

describe("refunds", () => {
  it("nets a refund off collected rental", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    const booking = await paidBooking(car.id, client.id, {
      status: "CANCELLED",
      rental: 90_000,
      deposit: 60_000,
    });

    await prisma.payment.create({
      data: {
        bookingId: booking.id,
        method: "MTN_MOMO",
        status: "CONFIRMED",
        isRefund: true,
        originalPaymentId: booking.payments[0].id,
        rentalAmount: 90_000,
        depositAmount: 0,
        totalAmount: 90_000,
      },
    });

    const r = await runReconciliation();
    expect(r.rentalCollected).toBe(90_000);
    expect(r.rentalRefunded).toBe(90_000);
    expect(r.netRentalCollected).toBe(0);
  });

  it("DETECTS the double-counted refund bug", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    const booking = await paidBooking(car.id, client.id, {
      status: "CANCELLED",
      rental: 90_000,
      deposit: 60_000,
    });

    // The bug: voiding the payment already reverses the deposit portion.
    // Recording a deposit refund as well counts the same money twice.
    await prisma.payment.update({
      where: { id: booking.payments[0].id },
      data: { isVoided: true, voidedAt: new Date(), voidReason: "cancelled" },
    });

    await prisma.deposit.update({
      where: { id: booking.deposit!.id },
      data: { status: "RELEASED", clientRefundAmount: 60_000 },
    });

    const r = await runReconciliation();

    // The whole point of reconciliation: this must NOT silently pass.
    expect(r.hasMismatch).toBe(true);
    expect(r.depositDiscrepancy).not.toBe(0);
  });
});

describe("voided payments", () => {
  it("removes a voided payment from collected entirely", async () => {
    const client = await makeClient();
    const { profile } = await makeOwner();
    const car = await makeCar(profile.id);

    const booking = await paidBooking(car.id, client.id, {
      status: "CANCELLED",
      rental: 90_000,
      deposit: 60_000,
    });

    await prisma.payment.update({
      where: { id: booking.payments[0].id },
      data: { isVoided: true, voidedAt: new Date(), voidReason: "cancelled early" },
    });

    // The deposit goes back through the same reversal, so it records nothing.
    await prisma.deposit.update({
      where: { id: booking.deposit!.id },
      data: { status: "RELEASED", clientRefundAmount: 0, ownerAwardAmount: 0 },
    });

    const r = await runReconciliation();
    expect(r.rentalCollected).toBe(0);
    expect(r.depositsCollected).toBe(0);
    expect(r.hasMismatch).toBe(false);
  });
});
