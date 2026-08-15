// =============================================================================
// ZuriDrive — MoMo settlement
//
// The one place a MoMo payment turns into a confirmed booking or an active
// subscription. Two things reach it:
//
//   • the client polling after approving a prompt
//   • MTN's callback webhook
//
// Both must produce the same result, which is why neither implements it.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//
//  1. NEVER trust the callback body. MTN does not sign callbacks, so anyone who
//     learns a reference could POST us a fake "SUCCESSFUL". The callback is
//     treated purely as a nudge; the authoritative answer always comes from
//     asking MTN directly with getPaymentStatus(). A forged callback therefore
//     achieves nothing except making us re-check a payment.
//
//  2. Settlement is IDEMPOTENT. Callbacks get retried and the client polls at
//     the same time, so the same reference will arrive more than once — often
//     concurrently. Every path below returns early if the work is already done,
//     and the state change runs inside a transaction.
// =============================================================================

import { prisma } from "@/lib/db";
import { getPaymentProvider } from "@/lib/payments";
import { activateDeposit } from "@/lib/finance/deposits";
import { activateSubscription } from "@/lib/subscriptions/checkout";
import { sendSms } from "@/lib/sms";
import { createNotification } from "@/lib/notifications";
import { formatRWF } from "@/lib/currency";
import { NotificationType } from "@prisma/client";

export type SettlementOutcome =
  | "CONFIRMED"
  | "FAILED"
  | "PENDING"
  | "ALREADY_SETTLED"
  | "UNKNOWN_REFERENCE";

export interface SettlementResult {
  outcome: SettlementOutcome;
  kind: "BOOKING" | "SUBSCRIPTION" | null;
  /** Booking or subscription id, when we found one. */
  targetId: string | null;
  reason?: string;
}

/**
 * Settles whatever a MoMo reference belongs to.
 *
 * A reference is either a booking payment or a subscription payment — never
 * both — so we look in each place and dispatch. An unknown reference is not an
 * error: MTN can call back about something we never recorded, and shouting
 * about it would just fill the logs.
 */
export async function settleMoMoReference(
  referenceId: string,
): Promise<SettlementResult> {
  const payment = await prisma.payment.findFirst({
    where: { momoReference: referenceId, isVoided: false },
    select: { id: true },
  });

  if (payment) return settleBookingPayment(referenceId);

  const subscription = await prisma.ownerSubscription.findFirst({
    where: { momoReference: referenceId },
    select: { id: true },
  });

  if (subscription) return settleSubscriptionPayment(referenceId);

  return { outcome: "UNKNOWN_REFERENCE", kind: null, targetId: null };
}

/**
 * Confirms a booking whose MoMo payment went through.
 *
 * Mirrors the deposit rule the rest of the finance code follows: a deposit only
 * becomes HELD once the money has actually arrived, so activateDeposit() runs
 * here and nowhere earlier.
 */
export async function settleBookingPayment(
  referenceId: string,
): Promise<SettlementResult> {
  const payment = await prisma.payment.findFirst({
    where: { momoReference: referenceId, isVoided: false },
    include: {
      booking: {
        include: {
          client: { select: { id: true, name: true, phone: true } },
          car: {
            select: {
              make: true,
              model: true,
              owner: {
                select: {
                  user: { select: { id: true, name: true, phone: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!payment) {
    return { outcome: "UNKNOWN_REFERENCE", kind: "BOOKING", targetId: null };
  }

  const { booking } = payment;

  // Already done — a retried callback or a concurrent poll.
  if (payment.status === "CONFIRMED") {
    return {
      outcome: "ALREADY_SETTLED",
      kind: "BOOKING",
      targetId: booking.id,
    };
  }

  // Rule 1: ask the provider, don't believe the caller.
  const result = await getPaymentProvider().getStatus(referenceId);

  if (result.status === "PENDING") {
    return { outcome: "PENDING", kind: "BOOKING", targetId: booking.id };
  }

  if (result.status === "FAILED") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", failureReason:
          result.reason ?? `Declined at ${getPaymentProvider().displayName}` },
    });
    return {
      outcome: "FAILED",
      kind: "BOOKING",
      targetId: booking.id,
      reason: result.reason,
    };
  }

  const confirmedAt = new Date();

  // Guarded update: only transition a payment that is still PENDING. If a
  // concurrent poll won the race, updateMany matches nothing and we stop,
  // rather than double-confirming and firing a second set of SMS.
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: { status: "CONFIRMED", confirmedAt },
  });

  if (claimed.count === 0) {
    return {
      outcome: "ALREADY_SETTLED",
      kind: "BOOKING",
      targetId: booking.id,
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "AWAITING_OWNER_CONFIRMATION",
        paymentConfirmedAt: confirmedAt,
      },
    });

    // The money has arrived, so the deposit is now genuinely held.
    await activateDeposit(tx, booking.id);
  });

  await notifyBookingPaid(booking, payment.totalAmount);

  return { outcome: "CONFIRMED", kind: "BOOKING", targetId: booking.id };
}

/** Activates a subscription whose MoMo payment went through. */
export async function settleSubscriptionPayment(
  referenceId: string,
): Promise<SettlementResult> {
  const subscription = await prisma.ownerSubscription.findFirst({
    where: { momoReference: referenceId },
    include: {
      plan: true,
      owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
    },
  });

  if (!subscription) {
    return { outcome: "UNKNOWN_REFERENCE", kind: "SUBSCRIPTION", targetId: null };
  }

  if (subscription.status === "ACTIVE") {
    return {
      outcome: "ALREADY_SETTLED",
      kind: "SUBSCRIPTION",
      targetId: subscription.id,
    };
  }

  const result = await getPaymentProvider().getStatus(referenceId);

  if (result.status === "PENDING") {
    return { outcome: "PENDING", kind: "SUBSCRIPTION", targetId: subscription.id };
  }

  if (result.status === "FAILED") {
    await prisma.ownerSubscription.update({
      where: { id: subscription.id },
      data: {
        rejectionReason:
          result.reason ?? `Declined at ${getPaymentProvider().displayName}`,
      },
    });
    return {
      outcome: "FAILED",
      kind: "SUBSCRIPTION",
      targetId: subscription.id,
      reason: result.reason,
    };
  }

  // Same guard as above — claim the pending row before doing the work.
  const claimed = await prisma.ownerSubscription.updateMany({
    where: { id: subscription.id, status: "PENDING_PAYMENT" },
    data: { paymentConfirmedAt: new Date() },
  });

  if (claimed.count === 0) {
    return {
      outcome: "ALREADY_SETTLED",
      kind: "SUBSCRIPTION",
      targetId: subscription.id,
    };
  }

  const activation = await prisma.$transaction((tx) =>
    activateSubscription(tx, subscription.id),
  );

  const user = subscription.owner.user;
  const relistNote =
    activation.relisted > 0
      ? ` ${activation.relisted} of your cars are back online.`
      : "";

  await createNotification({
    userId: user.id,
    type: "PAYMENT_CONFIRMED",
    title: `${activation.planName} is active`,
    body: `Renews ${activation.expiresAt.toLocaleDateString("en-RW")}.${relistNote}`,
    titleKey: "planActiveTitle",
    bodyKey: activation.relisted > 0 ? "planActiveRelistedBody" : "planActiveBody",
    params: {
      plan: activation.planName,
      date: activation.expiresAt.toISOString(),
      count: activation.relisted,
    },
    actionUrl: "/owner/subscription",
  });

  if (user.phone) {
    await sendSms({
      to: user.phone,
      type: NotificationType.PAYMENT_CONFIRMED,
      userId: user.id,
      messageKey:
      activation.relisted > 0 ? "planActiveRelisted" : "planActive",
    params: {
      plan: activation.planName,
      date: activation.expiresAt,
      count: activation.relisted,
    },
    });
  }

  return {
    outcome: "CONFIRMED",
    kind: "SUBSCRIPTION",
    targetId: subscription.id,
  };
}

/**
 * Tells both parties a booking has been paid for.
 *
 * Failures here are swallowed: an SMS provider being down must never roll back
 * a payment we have already taken and recorded.
 */
async function notifyBookingPaid(
  booking: {
    id: string;
    reference: string;
    startDate: Date;
    endDate: Date;
    client: { id: string; name: string | null; phone: string | null };
    car: {
      make: string;
      model: string;
      owner: { user: { id: string; name: string | null; phone: string | null } };
    };
  },
  totalPaid: number,
): Promise<void> {
  const carName = `${booking.car.make} ${booking.car.model}`;
  const ownerUser = booking.car.owner.user;

  try {
    if (booking.client.phone) {
      await sendSms({
        to: booking.client.phone,
        messageKey: "paymentConfirmed",
        params: {
          amount: formatRWF(totalPaid),
          car: carName,
          reference: booking.reference,
        },
      });
    }

    if (ownerUser.phone) {
      await sendSms({
        to: ownerUser.phone,
        messageKey: "newBookingRequest",
        params: {
          owner: ownerUser.name ?? "Owner",
          car: carName,
          start: booking.startDate,
          end: booking.endDate,
          amount: formatRWF(totalPaid),
          reference: booking.reference,
        },
      });
    }
  } catch (error) {
    console.error("[settle] Notification failed after a confirmed payment", {
      bookingId: booking.id,
      error,
    });
  }
}
