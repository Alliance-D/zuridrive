/**
 * app/api/admin/payments/[id]/confirm/route.ts
 *
 * POST /api/admin/payments/[id]/confirm
 *
 * Finance Manager manually confirms a bank transfer, or voids a payment.
 *
 * Confirming a payment moves the booking on to AWAITING_OWNER_CONFIRMATION —
 * the same state a successful MoMo payment produces — so the rest of the
 * lifecycle is identical regardless of how the client paid.
 *
 * Payment rows are never edited destructively: a rejection sets isVoided
 * rather than deleting or rewriting the record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { activateDeposit, voidPendingDeposit } from '@/lib/finance/deposits'
import { formatRWF } from '@/lib/currency'
import { NotificationType } from '@prisma/client'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('confirm'),
    reference: z.string().max(100).optional(),
  }),
  z.object({
    action: z.literal('void'),
    reason: z.string().min(5).max(500),
  }),
])

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'FINANCE_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const payment = await prisma.payment.findUnique({
      where: { id: params.id },
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            status: true,
            clientId: true,
            client: { select: { name: true, phone: true } },
            car: {
              select: {
                make: true,
                model: true,
                owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
              },
            },
            startDate: true,
            endDate: true,
            subtotal: true,
          },
        },
      },
    })

    if (!payment) {
      return NextResponse.json({ error: 'Payment not found.' }, { status: 404 })
    }

    if (payment.isVoided) {
      return NextResponse.json(
        { error: 'This payment has already been voided.' },
        { status: 400 },
      )
    }

    const carName = `${payment.booking.car.make} ${payment.booking.car.model}`

    // ── CONFIRM ────────────────────────────────────────────────────────────
    if (parsed.data.action === 'confirm') {
      if (payment.status === 'CONFIRMED') {
        return NextResponse.json(
          { error: 'This payment is already confirmed.' },
          { status: 400 },
        )
      }

      const confirmReference = parsed.data.reference

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            confirmedById: session.user.id,
            momoReference: confirmReference ?? payment.momoReference,
          },
        })

        await tx.booking.update({
          where: { id: payment.booking.id },
          data: {
            status: 'AWAITING_OWNER_CONFIRMATION',
            paymentConfirmedAt: new Date(),
          },
        })

        // Money has arrived — the deposit is now genuinely held.
        await activateDeposit(tx, payment.booking.id, session.user.id)
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'PAYMENT_CONFIRMED_MANUAL',
        targetType: 'Payment',
        targetId: payment.id,
        description: `Confirmed ${formatRWF(payment.totalAmount)} bank transfer for ${payment.booking.reference}`,
        metadata: {
          bookingRef: payment.booking.reference,
          amount: payment.totalAmount,
        },
      })

      // Tell the client, then nudge the owner to accept.
      if (payment.booking.client.phone) {
        await sendSms({
          to: payment.booking.client.phone,
          type: NotificationType.PAYMENT_CONFIRMED,
          userId: payment.booking.clientId,
          messageKey: 'paymentConfirmed',
          params: {
            amount: formatRWF(payment.totalAmount),
            car: carName,
            reference: payment.booking.reference,
          },
        })
      }

      const ownerUser = payment.booking.car.owner.user
      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.BOOKING_REQUEST,
          userId: ownerUser.id,
          messageKey: 'newBookingRequest',
          params: {
            owner: ownerUser.name ?? 'Owner',
            car: carName,
            start: payment.booking.startDate,
            end: payment.booking.endDate,
            amount: formatRWF(payment.booking.subtotal),
            reference: payment.booking.reference,
          },
        })
      }

      return NextResponse.json({ success: true, status: 'CONFIRMED' })
    }

    // ── VOID ───────────────────────────────────────────────────────────────
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedById: session.user.id,
        voidReason: parsed.data.reason,
        status: 'FAILED',
        failureReason: parsed.data.reason,
      },
    })

    // No money was ever collected, so cancel the pending deposit too.
    await voidPendingDeposit(
      prisma,
      payment.booking.id,
      session.user.id,
      parsed.data.reason,
    )

    await logAdminAction({
      actorId: session.user.id,
      action: 'PAYMENT_REFUNDED',
      targetType: 'Payment',
      targetId: payment.id,
      reason: parsed.data.reason,
      description: `Voided payment for ${payment.booking.reference}`,
      metadata: { bookingRef: payment.booking.reference, amount: payment.totalAmount },
    })

    await createNotification({
      userId: payment.booking.clientId,
      type: 'BANK_TRANSFER_PENDING',
      title: 'Problem with your payment',
      titleKey: 'paymentProblemTitle',
      bodyKey: 'paymentProblemBody',
      params: {
        reference: payment.booking.reference,
        reason: parsed.data.reason,
      },
      body: `We couldn't verify your payment for ${payment.booking.reference}. ${parsed.data.reason}`,
      actionUrl: `/dashboard/bookings/${payment.booking.id}`,
    })

    return NextResponse.json({ success: true, status: 'VOIDED' })
  } catch (error) {
    console.error('[POST /api/admin/payments/[id]/confirm]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
