// =============================================================================
// ZuriDrive — Deposit lifecycle helpers
//
// A deposit is created PENDING alongside the booking, because no money has
// been collected at that point. It only becomes HELD once the payment for that
// booking is confirmed.
//
// Both payment paths (MoMo callback and manual bank confirmation) must call
// activateDeposit, so it lives here rather than being duplicated — the two
// paths drifting is exactly how a ledger stops balancing.
// =============================================================================

import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Accepts either the client or a transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Moves a booking's deposit from PENDING to HELD and records the movement.
 *
 * Safe to call more than once: a deposit that is already HELD (or further
 * along) is left untouched, so a duplicate webhook can't corrupt the ledger.
 *
 * @returns true if the deposit was activated by this call.
 */
export async function activateDeposit(
  db: Db,
  bookingId: string,
  actorId = "SYSTEM",
): Promise<boolean> {
  const deposit = await db.deposit.findUnique({
    where: { bookingId },
    select: { id: true, status: true, amount: true },
  });

  if (!deposit || deposit.status !== "PENDING") return false;

  await db.deposit.update({
    where: { id: deposit.id },
    data: { status: "HELD", heldAt: new Date() },
  });

  await db.depositMovement.create({
    data: {
      depositId: deposit.id,
      fromStatus: "PENDING",
      toStatus: "HELD",
      amount: deposit.amount,
      reason: "Payment confirmed — deposit collected and now held.",
      actorId,
    },
  });

  return true;
}

/**
 * Cancels a PENDING deposit when its booking never gets paid.
 * Recorded as RELEASED with a zero client refund — no money ever moved.
 *
 * Takes `db` first, like activateDeposit, so it can run inside the same
 * transaction as the booking update it accompanies. Reading through the global
 * client from inside a transaction returns pre-commit state.
 */
export async function voidPendingDeposit(
  db: Db,
  bookingId: string,
  actorId: string,
  reason: string,
): Promise<boolean> {
  const deposit = await db.deposit.findUnique({
    where: { bookingId },
    select: { id: true, status: true, amount: true },
  });

  if (!deposit || deposit.status !== "PENDING") return false;

  await db.deposit.update({
    where: { id: deposit.id },
    data: {
      status: "RELEASED",
      releasedAt: new Date(),
      releaseTriggeredBy: "ADMIN_MANUAL",
      clientRefundAmount: 0,
      ownerAwardAmount: 0,
    },
  });

  await db.depositMovement.create({
    data: {
      depositId: deposit.id,
      fromStatus: "PENDING",
      toStatus: "RELEASED",
      amount: 0,
      reason: `Booking never paid — no deposit was collected. ${reason}`,
      actorId,
    },
  });

  return true;
}
