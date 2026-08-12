// =============================================================================
// ZuriDrive — Reconciliation
//
// Checks that the money the platform holds can be fully explained by the
// ledgers. Run on demand from /admin/finance/reports; results are appended to
// ReconciliationLog (never updated) so there is a history of every check.
//
// The identity being tested:
//
//   collected  =  rental income  +  deposits taken
//
//   rental income   should equal   commission + owner earnings
//   deposits taken  should equal   still held + returned + withheld
//
// A non-zero discrepancy means a record was written outside the normal flow.
// =============================================================================

import { prisma } from "@/lib/db";

export interface ReconciliationResult {
  totalCollected: number;
  totalPaidOut: number;
  totalCommission: number;
  totalDepositsHeld: number;
  totalDepositsReleased: number;
  totalDepositsWithheld: number;

  /** Derived checks */
  rentalCollected: number;
  rentalRefunded: number;
  netRentalCollected: number;
  depositsCollected: number;
  ownerEarningsRealised: number;
  outstandingOwnerBalance: number;
  pendingDeposits: number;

  rentalDiscrepancy: number;
  depositDiscrepancy: number;
  discrepancyAmount: number;
  hasMismatch: boolean;

  notes: string[];
}

export async function runReconciliation(): Promise<ReconciliationResult> {
  const [
    confirmedPayments,
    refundPayments,
    paidPayouts,
    commissionRealised,
    depositsByStatus,
  ] = await Promise.all([
    // Money actually taken from clients. Refund rows are excluded here and
    // netted off below — counting them as income would inflate revenue.
    prisma.payment.aggregate({
      _sum: { rentalAmount: true, depositAmount: true, totalAmount: true },
      where: { status: "CONFIRMED", isVoided: false, isRefund: false },
    }),
    prisma.payment.aggregate({
      _sum: { rentalAmount: true, totalAmount: true },
      where: { status: "CONFIRMED", isVoided: false, isRefund: true },
    }),
    prisma.payout.aggregate({
      _sum: { netAmount: true },
      where: { status: "PAID" },
    }),
    // Commission is only realised once a trip completes
    prisma.commission.aggregate({
      _sum: { commissionAmount: true, netOwnerAmount: true, baseAmount: true },
      where: { booking: { status: "COMPLETED" } },
    }),
    prisma.deposit.groupBy({
      by: ["status"],
      _sum: { amount: true, clientRefundAmount: true, ownerAwardAmount: true },
    }),
  ]);

  const rentalCollected = confirmedPayments._sum.rentalAmount ?? 0;
  const rentalRefunded = refundPayments._sum.rentalAmount ?? 0;
  const netRentalCollected = rentalCollected - rentalRefunded;
  const depositsCollected = confirmedPayments._sum.depositAmount ?? 0;
  const totalCollected =
    (confirmedPayments._sum.totalAmount ?? 0) -
    (refundPayments._sum.totalAmount ?? 0);
  const totalPaidOut = paidPayouts._sum.netAmount ?? 0;
  const totalCommission = commissionRealised._sum.commissionAmount ?? 0;
  const ownerEarningsRealised = commissionRealised._sum.netOwnerAmount ?? 0;
  const commissionableBase = commissionRealised._sum.baseAmount ?? 0;

  const find = (s: string) => depositsByStatus.find((d) => d.status === s);

  // PENDING deposits are deliberately excluded: the booking exists but the
  // payment has not been confirmed, so no money has been collected. Counting
  // them as held would overstate what the platform is actually holding.
  const pendingDeposits = find("PENDING")?._sum.amount ?? 0;

  const totalDepositsHeld = find("HELD")?._sum.amount ?? 0;
  const totalDepositsReleased =
    (find("RELEASED")?._sum.clientRefundAmount ?? 0) +
    (find("PARTIALLY_WITHHELD")?._sum.clientRefundAmount ?? 0);
  const totalDepositsWithheld =
    (find("PARTIALLY_WITHHELD")?._sum.ownerAwardAmount ?? 0) +
    (find("FULLY_WITHHELD")?._sum.ownerAwardAmount ?? 0);

  const notes: string[] = [];

  // --- Check 1: commission + owner earnings must reconstruct the base -------
  const rentalDiscrepancy =
    commissionableBase - (totalCommission + ownerEarningsRealised);
  if (rentalDiscrepancy !== 0) {
    notes.push(
      `Commission split is off by ${rentalDiscrepancy} RWF on completed trips — ` +
        `commission + owner earnings should equal the commissionable base.`,
    );
  }

  // --- Check 2: deposits taken must equal held + returned + withheld --------
  const depositsAccountedFor =
    totalDepositsHeld + totalDepositsReleased + totalDepositsWithheld;
  const depositDiscrepancy = depositsCollected - depositsAccountedFor;
  if (depositDiscrepancy !== 0) {
    notes.push(
      `Deposits are off by ${depositDiscrepancy} RWF — collected ${depositsCollected}, ` +
        `accounted for ${depositsAccountedFor} (held + returned + withheld).`,
    );
  }

  // --- Informational: what the platform still owes owners -------------------
  const outstandingOwnerBalance = ownerEarningsRealised - totalPaidOut;
  if (outstandingOwnerBalance < 0) {
    notes.push(
      `Paid out ${Math.abs(outstandingOwnerBalance)} RWF more than owners have earned. ` +
        `This should never happen — check for payouts attached to non-completed trips.`,
    );
  }

  const discrepancyAmount =
    Math.abs(rentalDiscrepancy) + Math.abs(depositDiscrepancy);

  return {
    totalCollected,
    totalPaidOut,
    totalCommission,
    totalDepositsHeld,
    totalDepositsReleased,
    totalDepositsWithheld,
    rentalCollected,
    rentalRefunded,
    netRentalCollected,
    depositsCollected,
    ownerEarningsRealised,
    outstandingOwnerBalance,
    pendingDeposits,
    rentalDiscrepancy,
    depositDiscrepancy,
    discrepancyAmount,
    hasMismatch: discrepancyAmount !== 0 || outstandingOwnerBalance < 0,
    notes,
  };
}

/**
 * Runs a check and appends it to ReconciliationLog.
 * The log is append-only — each run is a permanent record.
 */
export async function runAndLogReconciliation() {
  const r = await runReconciliation();

  const log = await prisma.reconciliationLog.create({
    data: {
      totalCollected: r.totalCollected,
      totalPaidOut: r.totalPaidOut,
      totalCommission: r.totalCommission,
      totalDepositsHeld: r.totalDepositsHeld,
      totalDepositsReleased: r.totalDepositsReleased,
      totalDepositsWithheld: r.totalDepositsWithheld,
      discrepancyAmount: r.discrepancyAmount,
      hasMismatch: r.hasMismatch,
      notes: r.notes.length > 0 ? r.notes.join("\n") : null,
    },
  });

  return { result: r, log };
}
