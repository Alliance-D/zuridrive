// =============================================================================
// ZuriDrive — Support tickets
//
// Where SubscriptionPlan.hasPrioritySupport becomes something real.
//
// Priority buys ONE thing, and it is worth being precise about what:
//   a shorter first-response target, and a place nearer the front of the queue.
//
// It does not buy a different answer, and it does not push another person's
// ticket past its own deadline — the queue is ordered by how close each ticket
// is to missing its target, so a standard ticket that has been waiting 20 hours
// outranks a priority ticket raised five minutes ago. Priority means a tighter
// clock, not an unlimited right to cut in.
//
// The decision is snapshotted onto the ticket at creation. A plan that lapses
// next week must not silently demote a ticket already in the queue, and a plan
// bought after a complaint must not retroactively jump it.
// =============================================================================

import { prisma } from "@/lib/db";

/** Hours until a first human reply is due. */
export const FIRST_RESPONSE_HOURS = {
  priority: 4,
  standard: 24,
} as const;

export interface PriorityDecision {
  isPriority: boolean;
  /** The plan that granted it, for the audit trail. */
  planName: string | null;
  firstResponseDueAt: Date;
}

/**
 * Does this user get priority support right now?
 *
 * Only an owner with a live plan carrying hasPrioritySupport does. Clients and
 * free-tier owners get the standard target — which is a real target, not an
 * absence of one.
 */
export async function resolvePriority(userId: string): Promise<PriorityDecision> {
  const subscription = await prisma.ownerSubscription.findFirst({
    where: {
      owner: { userId },
      status: { in: ["ACTIVE", "TRIAL"] },
      plan: { hasPrioritySupport: true },
    },
    include: { plan: { select: { name: true } } },
    orderBy: { startedAt: "desc" },
  });

  const isPriority = subscription !== null;
  const hours = isPriority
    ? FIRST_RESPONSE_HOURS.priority
    : FIRST_RESPONSE_HOURS.standard;

  return {
    isPriority,
    planName: subscription?.plan.name ?? null,
    firstResponseDueAt: new Date(Date.now() + hours * 60 * 60 * 1000),
  };
}

/**
 * Short, human-readable ticket reference (ZD-T-XXXX).
 *
 * Retried on collision rather than trusting randomness — the space is small
 * enough that a clash is plausible once there are a few thousand tickets.
 */
export async function generateTicketReference(): Promise<string> {
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1

  for (let attempt = 0; attempt < 8; attempt++) {
    let suffix = "";
    for (let i = 0; i < 4; i++) {
      suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    const reference = `ZD-T-${suffix}`;

    const existing = await prisma.supportTicket.findUnique({
      where: { reference },
      select: { id: true },
    });
    if (!existing) return reference;
  }

  // Vanishingly unlikely; fall back to something guaranteed unique.
  return `ZD-T-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * How overdue a ticket is, in hours. Negative means still within target.
 * Used to order the queue and to colour the badge.
 */
export function hoursAgainstTarget(
  dueAt: Date,
  respondedAt: Date | null,
): number {
  const reference = respondedAt ?? new Date();
  return (reference.getTime() - dueAt.getTime()) / (1000 * 60 * 60);
}

/**
 * The categories a ticket can be filed under, in the order they are offered.
 *
 * This used to be a map of category to English label, which the ticket form
 * read for both the option values and their text. The text now lives under
 * `enum.ticketCategory` in the message files, so keeping the English here as
 * well would leave two sources of truth with nothing keeping them in step.
 * Status labels were the same and are now `enum.ticketStatus`.
 */
export const SUPPORT_CATEGORIES = [
  "PAYOUT",
  "BOOKING",
  "LISTING",
  "SUBSCRIPTION",
  "ACCOUNT",
  "OTHER",
] as const;
