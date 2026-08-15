/**
 * app/api/bookings/[bookingId]/confirm/route.ts
 *
 * POST /api/bookings/[bookingId]/confirm
 *
 * Owner accepts or rejects a booking in AWAITING_OWNER_CONFIRMATION status.
 * Auto-accept logic: if owner doesn't respond within 2 hours, booking auto-confirms.
 * (The auto-confirm cron job is in lib/cron/auto-confirm.ts)
 *
 * Actions:
 *   "accept"  → status: CONFIRMED, SMS to client
 *   "reject"  → status: CANCELLED, refund triggered, SMS to client
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireRole } from '@/lib/api-guard'
import { getPhoneVerification } from '@/lib/phone-verification'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { formatRWF } from '@/lib/currency'
import { z } from 'zod'

const ConfirmSchema = z.object({
  action: z.enum(['accept', 'reject']),
  rejectReason: z.string().max(500).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ConfirmSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const { action, rejectReason } = parsed.data

    // Accepting a booking commits the owner to a handover, so both sides need
    // a working number. No-op while no SMS provider is configured.
    if (action === 'accept') {
      const verification = await getPhoneVerification(session.user.id)
      if (verification.blocked) {
        return NextResponse.json(
          {
            error:
              'Please confirm your phone number before accepting a booking — the renter needs to be able to reach you.',
            needsPhoneVerification: true,
          },
          { status: 403 },
        )
      }
    }

    // Load booking — verify the current user is the owner
    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: {
        car: {
          include: {
            owner: { include: { user: { select: { id: true, name: true } } } },
          },
        },
        client: { select: { id: true, phone: true, name: true } },
        payments: { where: { isVoided: false }, orderBy: { createdAt: 'desc' } },
        deposit: true,
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    // Only the car's owner can confirm/reject
    if (booking.car.owner.user.id !== session.user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to manage this booking.' },
        { status: 403 },
      )
    }

    if (booking.status !== 'AWAITING_OWNER_CONFIRMATION') {
      return NextResponse.json(
        { error: 'This booking is no longer waiting for your confirmation.' },
        { status: 400 },
      )
    }

    const carName = `${booking.car.make} ${booking.car.model}`

    if (action === 'accept') {
      await db.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          ownerConfirmedAt: new Date(),
        },
      })

      // SMS to client
      if (booking.client.phone) {
        await sendSms({
          to: booking.client.phone,
          messageKey: 'bookingConfirmedByOwner',
          params: {
            client: booking.client.name ?? 'there',
            owner: booking.car.owner.user.name ?? 'your owner',
            car: carName,
            start: booking.startDate,
            reference: booking.reference,
          },
        })
      }

      return NextResponse.json({ success: true, status: 'CONFIRMED' })
    }

    if (action === 'reject') {
      // Reject: cancel booking, trigger refund
      await db.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            cancellationReason: rejectReason ?? 'Owner declined the booking.',
            cancelledAt: new Date(),
            cancelledById: session.user.id,
          },
        })

        // Void the payment so Finance picks it up for refund. The original
        // record is never edited away — voiding keeps the audit trail intact.
        for (const payment of booking.payments) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              isVoided: true,
              voidedAt: new Date(),
              voidedById: session.user.id,
              voidReason: rejectReason ?? 'Owner declined booking.',
            },
          })
        }

        // Release deposit immediately on owner rejection
        if (booking.deposit) {
          await tx.deposit.update({
            where: { id: booking.deposit.id },
            data: {
              status: 'RELEASED',
              releasedAt: new Date(),
              releaseTriggeredBy: 'ADMIN_MANUAL',
              clientRefundAmount: booking.deposit.amount,
            },
          })

          await tx.depositMovement.create({
            data: {
              depositId: booking.deposit.id,
              fromStatus: booking.deposit.status,
              toStatus: 'RELEASED',
              amount: booking.deposit.amount,
              reason: 'Owner rejected booking — full deposit released.',
              actorId: session.user.id,
            },
          })
        }
      })

      // SMS to client
      if (booking.client.phone) {
        await sendSms({
          to: booking.client.phone,
          // A reason the owner typed goes through verbatim; the no-reason
          // case is our sentence, so it gets its own key rather than an
          // English default spliced into a translated frame.
          messageKey: rejectReason
            ? 'bookingRejectedByOwner'
            : 'bookingRejectedByOwnerNoReason',
          params: {
            client: booking.client.name ?? 'there',
            car: carName,
            reference: booking.reference,
            reason: rejectReason ?? '',
          },
        })
      }

      return NextResponse.json({ success: true, status: 'CANCELLED' })
    }
  } catch (error) {
    console.error('[POST /api/bookings/[bookingId]/confirm]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
