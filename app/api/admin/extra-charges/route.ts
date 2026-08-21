/**
 * app/api/admin/extra-charges/route.ts
 *
 * POST /api/admin/extra-charges — raise a post-trip charge against a booking
 *   (refuelling, damage, late return).
 *
 * PATCH /api/admin/extra-charges — collect or waive an existing charge.
 *
 * Raising a charge is a FINANCE_MANAGER action. Collecting one moves money out
 * of a client's deposit, so that half additionally requires DEPOSIT_MANAGER —
 * the same split used for disputes.
 *
 * Collection never exceeds what's actually held. A charge larger than the
 * remaining deposit is capped, and the shortfall is reported back so it can be
 * pursued separately rather than silently written off.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { formatMoney } from '@/lib/currency'
import { NotificationType } from '@prisma/client'
import { z } from 'zod'

const CreateSchema = z.object({
  bookingId: z.string().cuid(),
  type: z.enum([
    'REFUELING_FEE',
    'DAMAGE_FEE',
    'LATE_RETURN_FEE',
    'OTHER',
  ]),
  amount: z.number().int().positive(),
  description: z.string().min(10).max(500),
})

const UpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('collect'), id: z.string() }),
  z.object({
    action: z.literal('waive'),
    id: z.string(),
    reason: z.string().min(10).max(500),
  }),
])

const TYPE_LABEL: Record<string, string> = {
  REFUELING_FEE: 'Refuelling fee',
  DAMAGE_FEE: 'Damage fee',
  LATE_RETURN_FEE: 'Late return fee',
  OTHER: 'Additional charge',
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'FINANCE_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = CreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please give an amount and a description of at least 10 characters.' },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: parsed.data.bookingId },
      select: {
        id: true,
        reference: true,
        status: true,
        clientId: true,
        client: { select: { name: true, phone: true } },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    // These are post-trip charges — raising one on a live trip is premature.
    if (booking.status !== 'COMPLETED' && booking.status !== 'DISPUTED') {
      return NextResponse.json(
        { error: 'Extra charges can only be raised once a trip is complete or disputed.' },
        { status: 409 },
      )
    }

    const charge = await prisma.extraCharge.create({
      data: {
        bookingId: booking.id,
        type: parsed.data.type,
        amount: parsed.data.amount,
        description: parsed.data.description,
        status: 'PENDING',
        raisedById: session.user.id,
      },
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'PAYMENT_CONFIRMED_MANUAL',
      targetType: 'ExtraCharge',
      targetId: charge.id,
      targetUserId: booking.clientId,
      description: `Raised ${TYPE_LABEL[parsed.data.type]} of ${formatMoney(parsed.data.amount)} on ${booking.reference}`,
      metadata: { bookingRef: booking.reference, amount: parsed.data.amount },
    })

    await createNotification({
      userId: booking.clientId,
      type: 'DEPOSIT_WITHHELD',
      title: `${TYPE_LABEL[parsed.data.type]} raised`,
      body: `${formatMoney(parsed.data.amount)} on booking ${booking.reference}. ${parsed.data.description}`,
      titleKey: 'chargeRaisedTitle',
      bodyKey: 'chargeRaisedBody',
      params: {
        chargeType: TYPE_LABEL[parsed.data.type],
        amount: formatMoney(parsed.data.amount),
        reference: booking.reference,
        description: parsed.data.description,
      },
      actionUrl: `/dashboard/bookings/${booking.id}`,
    })

    return NextResponse.json({ success: true, chargeId: charge.id }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/admin/extra-charges]', error)
    return NextResponse.json(
      { error: 'We couldn’t raise that charge. Please try again.' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Waiving a charge needs a reason of at least 10 characters.' },
        { status: 400 },
      )
    }

    const charge = await prisma.extraCharge.findUnique({
      where: { id: parsed.data.id },
      include: {
        booking: {
          select: {
            id: true,
            reference: true,
            clientId: true,
            client: { select: { name: true, phone: true } },
            deposit: true,
          },
        },
      },
    })

    if (!charge) {
      return NextResponse.json({ error: 'Charge not found.' }, { status: 404 })
    }

    if (charge.status !== 'PENDING') {
      return NextResponse.json(
        { error: `This charge has already been ${charge.status.toLowerCase()}.` },
        { status: 409 },
      )
    }

    // ── WAIVE ──────────────────────────────────────────────────────────────
    if (parsed.data.action === 'waive') {
      const canWaive = await requireModuleAccess(session.user.id, 'FINANCE_MANAGER')
      if (!canWaive) {
        return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
      }

      await prisma.extraCharge.update({
        where: { id: charge.id },
        data: {
          status: 'WAIVED',
          waivedReason: parsed.data.reason,
          resolvedById: session.user.id,
          resolvedAt: new Date(),
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'PAYMENT_REFUNDED',
        targetType: 'ExtraCharge',
        targetId: charge.id,
        targetUserId: charge.booking.clientId,
        reason: parsed.data.reason,
        description: `Waived ${formatMoney(charge.amount)} charge on ${charge.booking.reference}`,
      })

      await createNotification({
        userId: charge.booking.clientId,
        type: 'DEPOSIT_RELEASED',
        title: 'Charge waived',
        titleKey: 'chargeWaivedTitle',
        bodyKey: 'chargeWaivedBody',
        params: {
          amount: formatMoney(charge.amount),
          reference: charge.booking.reference,
          reason: parsed.data.reason,
        },
        body: `The ${formatMoney(charge.amount)} charge on ${charge.booking.reference} has been waived. ${parsed.data.reason}`,
        actionUrl: `/dashboard/bookings/${charge.booking.id}`,
      })

      return NextResponse.json({ success: true, status: 'WAIVED' })
    }

    // ── COLLECT — moves money, so Deposit Manager is required ──────────────
    const canCollect = await requireModuleAccess(session.user.id, 'DEPOSIT_MANAGER')
    if (!canCollect) {
      return NextResponse.json(
        {
          error:
            'Collecting a charge takes money from the client’s deposit, which needs Deposit Manager access.',
        },
        { status: 403 },
      )
    }

    const deposit = charge.booking.deposit
    if (!deposit || deposit.status !== 'HELD') {
      return NextResponse.json(
        {
          error:
            'There is no held deposit on this booking to collect from. Pursue this charge separately.',
        },
        { status: 409 },
      )
    }

    // Never take more than is actually held.
    const collected = Math.min(charge.amount, deposit.amount)
    const shortfall = charge.amount - collected
    const remainingToClient = deposit.amount - collected

    await prisma.$transaction(async (tx) => {
      await tx.extraCharge.update({
        where: { id: charge.id },
        data: {
          status: 'COLLECTED',
          resolvedById: session.user.id,
          resolvedAt: new Date(),
        },
      })

      await tx.deposit.update({
        where: { id: deposit.id },
        data: {
          status: remainingToClient > 0 ? 'PARTIALLY_WITHHELD' : 'FULLY_WITHHELD',
          releasedAt: new Date(),
          releaseTriggeredBy: 'ADMIN_MANUAL',
          releasedById: session.user.id,
          ownerAwardAmount: collected,
          clientRefundAmount: remainingToClient,
        },
      })

      await tx.depositMovement.create({
        data: {
          depositId: deposit.id,
          fromStatus: deposit.status,
          toStatus: remainingToClient > 0 ? 'PARTIALLY_WITHHELD' : 'FULLY_WITHHELD',
          amount: collected,
          reason: `${TYPE_LABEL[charge.type]}: ${charge.description}`,
          actorId: session.user.id,
        },
      })
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'DEPOSIT_PARTIALLY_WITHHELD',
      targetType: 'ExtraCharge',
      targetId: charge.id,
      targetUserId: charge.booking.clientId,
      description: `Collected ${formatMoney(collected)} from the deposit on ${charge.booking.reference}`,
      metadata: { charged: charge.amount, collected, shortfall },
    })

    if (charge.booking.client.phone) {
      await sendSms({
        to: charge.booking.client.phone,
        type: NotificationType.DEPOSIT_WITHHELD,
        userId: charge.booking.clientId,
        messageKey: remainingToClient > 0
          ? 'depositDeductedRemainder'
          : 'depositDeducted',
        params: {
          amount: formatMoney(collected),
          reference: charge.booking.reference,
          description: charge.description,
          remaining: formatMoney(remainingToClient),
        },
      })
    }

    return NextResponse.json({
      success: true,
      status: 'COLLECTED',
      collected,
      shortfall,
      returnedToClient: remainingToClient,
    })
  } catch (error) {
    console.error('[PATCH /api/admin/extra-charges]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
