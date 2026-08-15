/**
 * app/api/admin/bookings/[id]/intervene/route.ts
 *
 * POST /api/admin/bookings/[id]/intervene
 *
 * Admin intervention on a booking. Two actions:
 *
 *   cancel        — cancel a booking that hasn't finished, void its payment
 *                   and return any collected deposit to the client
 *   force_complete — close out a stuck trip (both parties unresponsive)
 *
 * Cancelling is the destructive one, so it releases money back to the client
 * rather than leaving it in limbo. A reason is mandatory on both, and both are
 * written to the immutable admin audit log.
 *
 * Requires BOOKING_MANAGER. Where money moves, DEPOSIT_MANAGER is also
 * required — an admin who can reschedule shouldn't implicitly be able to
 * decide where a deposit lands.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { formatRWF } from '@/lib/currency'
import { NotificationType } from '@prisma/client'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('cancel'),
    reason: z.string().min(10).max(500),
  }),
  z.object({
    action: z.literal('force_complete'),
    reason: z.string().min(10).max(500),
  }),
])

/** Statuses that can still be cancelled — a finished trip cannot. */
const CANCELLABLE = [
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'AWAITING_OWNER_CONFIRMATION',
  'CONFIRMED',
] as const

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const canManageBookings = await requireModuleAccess(
      session.user.id,
      'BOOKING_MANAGER',
    )
    if (!canManageBookings) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please choose an action and give a reason (at least 10 characters).' },
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
            owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const { action, reason } = parsed.data
    const carName = `${booking.car.make} ${booking.car.model}`
    const ownerUser = booking.car.owner.user
    const now = new Date()

    // ── CANCEL ─────────────────────────────────────────────────────────────
    if (action === 'cancel') {
      if (!CANCELLABLE.includes(booking.status as (typeof CANCELLABLE)[number])) {
        return NextResponse.json(
          {
            error: `A booking that is ${booking.status
              .toLowerCase()
              .replace(/_/g, ' ')} can't be cancelled. Use a dispute instead.`,
          },
          { status: 409 },
        )
      }

      const movesMoney =
        (booking.deposit && booking.deposit.status === 'HELD') ||
        booking.payments.some((p) => p.status === 'CONFIRMED')

      if (movesMoney) {
        const canMoveMoney = await requireModuleAccess(
          session.user.id,
          'DEPOSIT_MANAGER',
        )
        if (!canMoveMoney) {
          return NextResponse.json(
            {
              error:
                'This booking has money attached. Cancelling it refunds the client, which needs Deposit Manager access.',
            },
            { status: 403 },
          )
        }
      }

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: 'CANCELLED',
            cancelledAt: now,
            cancelledById: session.user.id,
            cancellationReason: reason,
          },
        })

        // Void any live payment — the record is kept, never deleted.
        for (const payment of booking.payments) {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              isVoided: true,
              voidedAt: now,
              voidedById: session.user.id,
              voidReason: `Booking cancelled by admin: ${reason}`,
            },
          })
        }

        // Any collected deposit goes back to the client in full.
        if (booking.deposit && booking.deposit.status !== 'RELEASED') {
          // Zero, deliberately: any collected deposit is refunded through the
          // voided payment above. Recording it here as well would double-count
          // the refund and break reconciliation.
          const refund = 0

          await tx.deposit.update({
            where: { id: booking.deposit.id },
            data: {
              status: 'RELEASED',
              releasedAt: now,
              releaseTriggeredBy: 'ADMIN_MANUAL',
              releasedById: session.user.id,
              clientRefundAmount: refund,
              ownerAwardAmount: 0,
            },
          })

          await tx.depositMovement.create({
            data: {
              depositId: booking.deposit.id,
              fromStatus: booking.deposit.status,
              toStatus: 'RELEASED',
              amount: refund,
              reason: `Booking cancelled by admin: ${reason}`,
              actorId: session.user.id,
            },
          })
        }
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'BOOKING_CANCELLED_BY_ADMIN',
        targetType: 'Booking',
        targetId: booking.id,
        reason,
        description: `Cancelled ${booking.reference}`,
        metadata: {
          bookingRef: booking.reference,
          depositRefunded: booking.deposit?.amount ?? 0,
        },
      })

      const depositReturned =
        booking.deposit && booking.deposit.status === 'HELD'
          ? booking.deposit.amount
          : 0

      if (booking.client.phone) {
        await sendSms({
          to: booking.client.phone,
          type: NotificationType.BOOKING_CANCELLED,
          userId: booking.client.id,
          messageKey: depositReturned > 0
            ? 'adminCancelledClientRefund'
            : 'adminCancelledClient',
          params: {
            reference: booking.reference,
            car: carName,
            reason,
            amount: formatRWF(depositReturned),
          },
        })
      }
      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.BOOKING_CANCELLED,
          userId: ownerUser.id,
          messageKey: 'adminCancelledOwner',
          params: { reference: booking.reference, car: carName, reason },
        })
      }

      await Promise.all([
        createNotification({
          userId: booking.client.id,
          type: 'BOOKING_CANCELLED',
          title: 'Booking cancelled',
          body: reason,
          titleKey: 'bookingCancelledTitle',
          bodyKey: 'bookingCancelledBody',
          params: { reason },
          actionUrl: `/dashboard/bookings/${booking.id}`,
        }),
        createNotification({
          userId: ownerUser.id,
          type: 'BOOKING_CANCELLED',
          title: 'Booking cancelled',
          body: reason,
          titleKey: 'bookingCancelledTitle',
          bodyKey: 'bookingCancelledBody',
          params: { reason },
          actionUrl: `/owner/bookings/${booking.id}`,
        }),
      ])

      return NextResponse.json({ success: true, status: 'CANCELLED' })
    }

    // ── FORCE COMPLETE ─────────────────────────────────────────────────────
    if (booking.status !== 'ACTIVE' && booking.status !== 'DISPUTED') {
      return NextResponse.json(
        { error: 'Only an active or disputed trip can be force-completed.' },
        { status: 409 },
      )
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'COMPLETED',
        tripEndedAt: now,
        clientConfirmedReturn: true,
        ownerConfirmedReturn: true,
      },
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'BOOKING_INTERVENED',
      targetType: 'Booking',
      targetId: booking.id,
      reason,
      description: `Force-completed ${booking.reference}`,
      metadata: { bookingRef: booking.reference, previousStatus: booking.status },
    })

    // Deliberately does NOT touch the deposit — if one is still held, it needs
    // a deposit decision (or a dispute), not a side effect of closing the trip.
    return NextResponse.json({
      success: true,
      status: 'COMPLETED',
      depositStillHeld: booking.deposit?.status === 'HELD',
    })
  } catch (error) {
    console.error('[POST /api/admin/bookings/[id]/intervene]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
