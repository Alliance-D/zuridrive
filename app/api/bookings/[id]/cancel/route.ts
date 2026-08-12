/**
 * app/api/bookings/[id]/cancel/route.ts
 *
 * POST /api/bookings/[id]/cancel — the client or the owner cancels a booking.
 *
 * Who can cancel, and until when:
 *   Client — any time before the trip starts (up to CONFIRMED)
 *   Owner  — same window; rejecting an unconfirmed request goes through
 *            /confirm instead, which is the normal path
 *   Neither once the trip is ACTIVE — at that point the car has been handed
 *   over, so it's a return or a dispute, not a cancellation.
 *
 * Money - two paths, because the accounting differs:
 *
 *   EARLY (outside the fee window, or nothing collected)
 *     The whole payment is voided. That one reversal returns both the rental
 *     and the deposit, so the deposit ledger records a ZERO refund.
 *
 *   LATE (client cancels inside the window on a collected deposit)
 *     A share of the deposit is kept for the owner, so the payment CANNOT be
 *     voided - that would remove the deposit from collected while the ledger
 *     still shows it withheld. The original payment stands, the deposit moves
 *     to PARTIALLY_WITHHELD, and the rental returns as a separate refund row.
 *
 *   A client who thinks the fee is unfair can dispute it with a reason and
 *   proof - see /api/bookings/[id]/dispute-cancellation.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { formatRWF } from '@/lib/currency'
import { getPlatformSettings } from '@/lib/platform-settings'
import { NotificationType, type BookingStatus } from '@prisma/client'
import { z } from 'zod'

const CancelSchema = z.object({
  reason: z.string().min(5).max(500),
})

/** Statuses a booking can still be cancelled from. */
const CANCELLABLE: BookingStatus[] = [
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'AWAITING_OWNER_CONFIRMATION',
  'CONFIRMED',
]

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Please sign in to continue.' },
        { status: 401 },
      )
    }

    const parsed = CancelSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please tell us why you’re cancelling (at least 5 characters).' },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        client: { select: { id: true, name: true, phone: true } },
        deposit: true,
        payments: { where: { isVoided: false } },
        car: {
          select: {
            make: true,
            model: true,
            owner: {
              select: { user: { select: { id: true, name: true, phone: true } } },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const ownerUser = booking.car.owner.user
    const isClient = booking.clientId === session.user.id
    const isOwner = ownerUser.id === session.user.id

    if (!isClient && !isOwner) {
      return NextResponse.json(
        { error: 'You don’t have permission to cancel this booking.' },
        { status: 403 },
      )
    }

    if (!CANCELLABLE.includes(booking.status)) {
      const message =
        booking.status === 'ACTIVE'
          ? 'This trip has already started. Use "Report a problem" on the booking if something has gone wrong.'
          : `This booking is ${booking.status.toLowerCase().replace(/_/g, ' ')} and can no longer be cancelled.`
      return NextResponse.json({ error: message }, { status: 409 })
    }

    const carName = `${booking.car.make} ${booking.car.model}`
    const now = new Date()
    const cancelledByLabel = isClient ? 'the client' : 'the owner'

    const depositCollected =
      booking.deposit != null && booking.deposit.status === 'HELD'
    const depositAmount = depositCollected ? booking.deposit!.amount : 0

    const confirmedPayments = booking.payments.filter(
      (p) => p.status === 'CONFIRMED' && !p.isRefund,
    )
    const rentalCollected = confirmedPayments.reduce(
      (sum, p) => sum + p.rentalAmount,
      0,
    )

    // ── Does a late-cancellation fee apply? ───────────────────────────────
    const { lateCancellationWindowHours, lateCancellationFeePercent } =
      await getPlatformSettings()

    const hoursUntilStart =
      (booking.startDate.getTime() - now.getTime()) / (1000 * 60 * 60)

    // Only a CLIENT cancelling late on a collected deposit pays a fee. An
    // owner who pulls out must never profit from doing so.
    const isLate =
      isClient &&
      depositCollected &&
      hoursUntilStart <= lateCancellationWindowHours

    const cancellationFee = isLate
      ? Math.round((depositAmount * lateCancellationFeePercent) / 100)
      : 0

    const depositToClient = depositAmount - cancellationFee

    const refundAmount =
      cancellationFee > 0
        ? rentalCollected + depositToClient
        : confirmedPayments.reduce((sum, p) => sum + p.totalAmount, 0)

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledById: session.user.id,
          cancellationReason: parsed.data.reason,
        },
      })

      if (cancellationFee > 0) {
        // LATE — the original payment must STAND, so the deposit stays
        // counted as collected. Voiding it would remove the deposit from
        // "collected" while the ledger still shows part of it withheld, and
        // reconciliation would break. The rental goes back as its own row.
        if (rentalCollected > 0) {
          await tx.payment.create({
            data: {
              bookingId: booking.id,
              method: confirmedPayments[0].method,
              status: 'CONFIRMED',
              isRefund: true,
              originalPaymentId: confirmedPayments[0].id,
              rentalAmount: rentalCollected,
              depositAmount: 0,
              totalAmount: rentalCollected,
            },
          })
        }

        const toStatus = depositToClient > 0 ? 'PARTIALLY_WITHHELD' : 'FULLY_WITHHELD'

        await tx.deposit.update({
          where: { id: booking.deposit!.id },
          data: {
            status: toStatus,
            releasedAt: now,
            releaseTriggeredBy: 'ADMIN_MANUAL',
            releasedById: session.user.id,
            clientRefundAmount: depositToClient,
            ownerAwardAmount: cancellationFee,
          },
        })

        await tx.depositMovement.create({
          data: {
            depositId: booking.deposit!.id,
            fromStatus: booking.deposit!.status,
            toStatus,
            amount: cancellationFee,
            reason: `Late cancellation fee (${lateCancellationFeePercent}% of the deposit, cancelled ${Math.max(0, Math.round(hoursUntilStart))}h before pickup): ${parsed.data.reason}`,
            actorId: session.user.id,
          },
        })
      } else {
        // EARLY — void the payment. One reversal covers rental and deposit,
        // so the deposit ledger records a zero refund.
        for (const payment of booking.payments) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              isVoided: true,
              voidedAt: now,
              voidedById: session.user.id,
              voidReason: `Booking cancelled by ${cancelledByLabel}: ${parsed.data.reason}`,
            },
          })
        }

        if (booking.deposit && booking.deposit.status !== 'RELEASED') {
          await tx.deposit.update({
            where: { id: booking.deposit.id },
            data: {
              status: 'RELEASED',
              releasedAt: now,
              releaseTriggeredBy: 'ADMIN_MANUAL',
              releasedById: session.user.id,
              clientRefundAmount: 0,
              ownerAwardAmount: 0,
            },
          })

          await tx.depositMovement.create({
            data: {
              depositId: booking.deposit.id,
              fromStatus: booking.deposit.status,
              toStatus: 'RELEASED',
              amount: 0,
              reason: depositCollected
                ? `Cancelled by ${cancelledByLabel} — refunded via the voided payment: ${parsed.data.reason}`
                : `Cancelled by ${cancelledByLabel} — no deposit was collected: ${parsed.data.reason}`,
              actorId: session.user.id,
            },
          })
        }
      }
    })

    // ── Tell the other party ──────────────────────────────────────────────
    const refundNote =
      refundAmount > 0
        ? ` Your payment of ${formatRWF(refundAmount)} will be returned within 1-3 business days.`
        : ''

    if (isClient) {
      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.BOOKING_CANCELLED,
          userId: ownerUser.id,
          message: `ZuriDrive: ${booking.client.name ?? 'The client'} cancelled booking ${booking.reference} for your ${carName}. Reason: ${parsed.data.reason}`,
        })
      }
      await createNotification({
        userId: ownerUser.id,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled by the client',
        body: `${booking.reference} — ${parsed.data.reason}`,
        actionUrl: `/owner/bookings/${booking.id}`,
      })
    } else {
      if (booking.client.phone) {
        await sendSms({
          to: booking.client.phone,
          type: NotificationType.BOOKING_CANCELLED,
          userId: booking.client.id,
          message: `ZuriDrive: The owner cancelled booking ${booking.reference} for the ${carName}. Reason: ${parsed.data.reason}${refundNote}`,
        })
      }
      await createNotification({
        userId: booking.client.id,
        type: 'BOOKING_CANCELLED',
        title: 'Booking cancelled by the owner',
        body: `${booking.reference} — ${parsed.data.reason}`,
        actionUrl: `/dashboard/bookings/${booking.id}`,
      })
    }

    return NextResponse.json({
      success: true,
      status: 'CANCELLED',
      refundAmount,
      cancellationFee,
      canDisputeFee: cancellationFee > 0,
    })
  } catch (error) {
    console.error('[POST /api/bookings/[id]/cancel]', error)
    return NextResponse.json(
      { error: 'We couldn’t cancel this booking. Please try again.' },
      { status: 500 },
    )
  }
}
