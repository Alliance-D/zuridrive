// =============================================================================
// ZuriDrive — Subscription activation
//
// The one place a subscription becomes ACTIVE. Every payment path ends here:
// MoMo confirmation, a Finance Manager confirming a bank transfer, and a Super
// Admin granting a plan by hand.
//
// Having a single activation function is what makes the plan benefits reliable
// — applyPlanChange() runs exactly once per activation, so a new payment method
// can never be added that forgets to re-list an owner's cars or to re-rank them
// in search.
//
// Money note: subscription payments deliberately do NOT go into the Payment
// table. That table is keyed to a booking and reconciliation reads every
// confirmed row as rental + deposit; putting plan fees there would break both
// identities it checks. The cycle's payment details live on the subscription
// row itself, and pricePaid snapshots the price so a later price change never
// rewrites what someone already paid.
// =============================================================================

import { prisma } from "@/lib/db";
import { applyPlanChange } from "@/lib/subscriptions/limits";
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** One billing cycle. */
export const BILLING_PERIOD_DAYS = 30;

/** Statuses that mean an owner currently holds this plan. */
const LIVE_STATUSES: Prisma.EnumSubscriptionStatusFilter = {
  in: ["ACTIVE", "TRIAL"],
};

export interface ActivationResult {
  subscriptionId: string;
  planName: string;
  expiresAt: Date;
  /** True when this extended an existing plan rather than starting one. */
  isRenewal: boolean;
  /** Cars put back after a previous lapse. */
  relisted: number;
  /** Cars taken down because the new plan is smaller. */
  unlisted: number;
}

/**
 * Turns a PENDING_PAYMENT subscription into an ACTIVE one.
 *
 * Renewal keeps the days already paid for: if the owner still has 10 days
 * left, the new cycle ends 40 days out, not 30. Charging someone for a month
 * and silently eating the remainder of the last one is theft by rounding.
 *
 * Any previously live subscription is superseded (CANCELLED), so the "one
 * active record per owner" rule the schema states stays true.
 */
export async function activateSubscription(
  db: Db,
  subscriptionId: string,
  options: {
    confirmedById?: string | null;
    /**
     * Grant the plan without payment. Everything that reads entitlements
     * already treats TRIAL as live, but nothing ever set it, so a free period
     * had to be given as a normal ACTIVE subscription — which then counted
     * towards MRR as though somebody had paid for it.
     */
    asTrial?: boolean;
  } = {},
): Promise<ActivationResult> {
  const subscription = await db.ownerSubscription.findUnique({
    where: { id: subscriptionId },
    include: { plan: true },
  });

  if (!subscription) {
    throw new Error(`Subscription ${subscriptionId} not found`);
  }

  const now = new Date();

  // What they already hold, if anything — this is what makes it a renewal.
  const existing = await db.ownerSubscription.findFirst({
    where: {
      ownerId: subscription.ownerId,
      status: LIVE_STATUSES,
      id: { not: subscription.id },
    },
    orderBy: { expiresAt: "desc" },
  });

  const isRenewal = existing !== null;

  // Extend from the later of "now" and whatever is left on the old plan.
  const base =
    existing && existing.expiresAt > now ? existing.expiresAt : now;
  const expiresAt = new Date(
    base.getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  if (existing) {
    await db.ownerSubscription.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", cancelledAt: now },
    });
  }

  await db.ownerSubscription.update({
    where: { id: subscription.id },
    data: {
      status: options.asTrial ? "TRIAL" : "ACTIVE",
      startedAt: now,
      expiresAt,
      renewedAt: isRenewal ? now : null,
      // A trial was never paid for, so it carries no confirmation and no
      // price — pricePaid stays null and the finance figures stay honest.
      paymentConfirmedAt: options.asTrial ? null : now,
      paymentConfirmedById: options.asTrial ? null : (options.confirmedById ?? null),
      rejectionReason: null,
    },
  });

  // The whole reason this function exists — benefits applied exactly once.
  const change = await applyPlanChange(db, subscription.ownerId);

  return {
    subscriptionId: subscription.id,
    planName: subscription.plan.name,
    expiresAt,
    isRenewal,
    relisted: change.relisted,
    unlisted: change.unlisted,
  };
}

/**
 * Starts a plan purchase. Returns a PENDING_PAYMENT subscription that grants
 * nothing until money is verified.
 *
 * An owner can only have one request in flight — a second attempt reuses and
 * updates the first rather than littering the finance queue with duplicates
 * every time someone taps a different plan.
 */
export async function beginSubscriptionPurchase(
  ownerProfileId: string,
  planId: string,
  method: "MTN_MOMO" | "BANK_TRANSFER",
): Promise<{ id: string; priceMonthly: number; planName: string }> {
  const plan = await prisma.subscriptionPlan.findFirst({
    where: { id: planId, isActive: true },
  });

  if (!plan) throw new Error("That plan isn’t available.");

  const pending = await prisma.ownerSubscription.findFirst({
    where: { ownerId: ownerProfileId, status: "PENDING_PAYMENT" },
    orderBy: { createdAt: "desc" },
  });

  const data = {
    planId: plan.id,
    paymentMethod: method,
    // Snapshot — see the header note.
    pricePaid: plan.priceMonthly,
    // Provisional; activateSubscription() sets the real one.
    expiresAt: new Date(
      Date.now() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000,
    ),
    paymentProofUrl: null,
    momoReference: null,
    rejectionReason: null,
  };

  const subscription = pending
    ? await prisma.ownerSubscription.update({
        where: { id: pending.id },
        data,
      })
    : await prisma.ownerSubscription.create({
        data: { ...data, ownerId: ownerProfileId, status: "PENDING_PAYMENT" },
      });

  return {
    id: subscription.id,
    priceMonthly: plan.priceMonthly,
    planName: plan.name,
  };
}
