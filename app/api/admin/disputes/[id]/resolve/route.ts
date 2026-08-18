/**
 * app/api/admin/disputes/[id]/resolve/route.ts
 *
 * POST /api/admin/disputes/[id]/resolve
 *
 * Resolving a dispute is the one place where an admin decides who gets a
 * client's deposit. Every safeguard here exists for that reason:
 *
 * - The split must be exact: clientRefund + ownerAward === deposit amount.
 *   A rounding slip here shows up in reconciliation as a real discrepancy.
 * - Notes are mandatory — a decision about someone's money must be explained.
 * - Deposit, DisputeResolution, Dispute and Booking all move in ONE
 *   transaction. A partial write would leave money in an undefined state.
 * - The DepositMovement row records who decided and why, permanently.
 *
 * Requires DEPOSIT_MANAGER (the deposit moves) — BOOKING_MANAGER alone can
 * view and triage disputes but not decide where the money goes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { setRetentionOnDisputeResolution } from '@/lib/photos/retention'
import { formatRWF } from '@/lib/currency'
import { NotificationType, type DepositStatus } from '@prisma/client'
import { z } from 'zod'

const ResolveSchema = z.object({
  outcome: z.enum([
    'RESOLVED_FOR_CLIENT',
    'RESOLVED_FOR_OWNER',
    'SPLIT',
    'DISMISSED',
  ]),
  notes: z.string().min(10).max(2000),
  /** Only read for SPLIT — other outcomes derive the amounts. */
  clientRefundAmount: z.number().int().min(0).optional(),
  ownerAwardAmount: z.number().int().min(0).optional(),
})

/** Thrown when another admin resolved this dispute first. */
class AlreadyResolvedError extends Error {
  constructor() {
    super('ALREADY_RESOLVED')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'DEPOSIT_MANAGER')
    if (!hasAccess) {
      return NextResponse.json(
        { error: 'Resolving a dispute moves a deposit — you need Deposit Manager access.' },
        { status: 403 },
      )
    }

    const parsed = ResolveSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please choose an outcome and explain your decision (at least 10 characters).',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: params.id },
      include: {
        resolution: true,
        booking: {
          select: {
            id: true,
            reference: true,
            clientId: true,
            client: { select: { name: true, phone: true } },
            car: {
              select: {
                make: true,
                model: true,
                owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
              },
            },
            deposit: true,
          },
        },
      },
    })

    if (!dispute) {
      return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 })
    }

    if (dispute.resolution) {
      return NextResponse.json(
        { error: 'This dispute has already been resolved.' },
        { status: 409 },
      )
    }

    const { outcome, notes } = parsed.data
    const deposit = dispute.booking.deposit
    const depositAmount = deposit?.amount ?? 0

    // ── Work out the split ────────────────────────────────────────────────
    let clientRefundAmount = 0
    let ownerAwardAmount = 0
    let depositAction: DepositStatus

    switch (outcome) {
      case 'RESOLVED_FOR_CLIENT':
      case 'DISMISSED':
        clientRefundAmount = depositAmount
        depositAction = 'RELEASED'
        break

      case 'RESOLVED_FOR_OWNER':
        ownerAwardAmount = depositAmount
        depositAction = 'FULLY_WITHHELD'
        break

      case 'SPLIT': {
        clientRefundAmount = parsed.data.clientRefundAmount ?? 0
        ownerAwardAmount = parsed.data.ownerAwardAmount ?? 0

        // The split must account for the deposit exactly — no more, no less.
        if (clientRefundAmount + ownerAwardAmount !== depositAmount) {
          return NextResponse.json(
            {
              error: `The split must add up to exactly ${formatRWF(depositAmount)}. You allocated ${formatRWF(
                clientRefundAmount + ownerAwardAmount,
              )}.`,
            },
            { status: 400 },
          )
        }

        depositAction =
          ownerAwardAmount === 0
            ? 'RELEASED'
            : clientRefundAmount === 0
              ? 'FULLY_WITHHELD'
              : 'PARTIALLY_WITHHELD'
        break
      }
    }

    // A deposit that was never collected can't be awarded to anyone.
    if (deposit && deposit.status === 'PENDING' && depositAmount > 0) {
      return NextResponse.json(
        {
          error:
            'This booking’s deposit was never collected, so there is nothing to award. Resolve the payment first.',
        },
        { status: 409 },
      )
    }

    const now = new Date()

    // ── Everything moves together, or not at all ──────────────────────────
    await prisma.$transaction(async (tx) => {
      await tx.disputeResolution.create({
        data: {
          disputeId: dispute.id,
          resolvedById: session.user.id,
          outcome,
          notes,
          depositAction,
          clientRefundAmount,
          ownerAwardAmount,
        },
      })

      // Claim the resolution. The dispute's status was read before this
      // transaction opened, so two admins acting at once would both reach here
      // and both move deposit money. Matching on the status means only one
      // resolution takes effect.
      const claimed = await tx.dispute.updateMany({
        where: { id: dispute.id, status: { not: 'RESOLVED' } },
        data: { status: 'RESOLVED', assignedToId: session.user.id },
      })

      if (claimed.count === 0) {
        throw new AlreadyResolvedError()
      }

      if (deposit && deposit.status !== 'PENDING') {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: depositAction,
            releasedAt: now,
            releaseTriggeredBy: 'ADMIN_MANUAL',
            releasedById: session.user.id,
            clientRefundAmount,
            ownerAwardAmount,
          },
        })

        await tx.depositMovement.create({
          data: {
            depositId: deposit.id,
            fromStatus: deposit.status,
            toStatus: depositAction,
            amount: ownerAwardAmount > 0 ? ownerAwardAmount : clientRefundAmount,
            reason: `Dispute ${outcome.toLowerCase().replace(/_/g, ' ')}: ${notes}`,
            actorId: session.user.id,
          },
        })
      }

      // The trip is finished with — take it out of DISPUTED.
      await tx.booking.update({
        where: { id: dispute.booking.id },
        data: { status: 'COMPLETED', tripEndedAt: now },
      })
    })

    // Photos were locked when the dispute opened; give them 3 more days.
    await setRetentionOnDisputeResolution(dispute.booking.id)

    await logAdminAction({
      actorId: session.user.id,
      action: 'DISPUTE_RESOLVED',
      targetType: 'Dispute',
      targetId: dispute.id,
      reason: notes,
      description: `Resolved dispute on ${dispute.booking.reference} — ${outcome
        .toLowerCase()
        .replace(/_/g, ' ')}`,
      metadata: {
        bookingRef: dispute.booking.reference,
        outcome,
        clientRefundAmount,
        ownerAwardAmount,
        depositAmount,
      },
    })

    // ── Tell both parties ─────────────────────────────────────────────────
    const carName = `${dispute.booking.car.make} ${dispute.booking.car.model}`
    const ownerUser = dispute.booking.car.owner.user

    if (dispute.booking.client.phone) {
      await sendSms({
        to: dispute.booking.client.phone,
        type: NotificationType.DISPUTE_RESOLVED,
        userId: dispute.booking.clientId,
        messageKey:
          clientRefundAmount > 0
            ? 'disputeResolvedClientRefund'
            : 'disputeResolvedClientNone',
        params: {
          reference: dispute.booking.reference,
          amount: formatRWF(clientRefundAmount),
        },
      })
    }

    if (ownerUser.phone) {
      await sendSms({
        to: ownerUser.phone,
        type: NotificationType.DISPUTE_RESOLVED,
        userId: ownerUser.id,
        messageKey:
          ownerAwardAmount > 0
            ? 'disputeResolvedOwnerAward'
            : 'disputeResolvedOwnerNone',
        params: {
          car: carName,
          reference: dispute.booking.reference,
          amount: formatRWF(ownerAwardAmount),
        },
      })
    }

    await Promise.all([
      createNotification({
        userId: dispute.booking.clientId,
        type: 'DISPUTE_RESOLVED',
        title: 'Dispute resolved',
        body: notes,
        titleKey: 'disputeResolvedTitle',
        bodyKey: 'disputeResolvedBody',
        params: { notes },
        actionUrl: `/dashboard/bookings/${dispute.booking.id}`,
      }),
      createNotification({
        userId: ownerUser.id,
        type: 'DISPUTE_RESOLVED',
        title: 'Dispute resolved',
        body: notes,
        titleKey: 'disputeResolvedTitle',
        bodyKey: 'disputeResolvedBody',
        params: { notes },
        actionUrl: `/owner/bookings/${dispute.booking.id}`,
      }),
    ])

    return NextResponse.json({
      success: true,
      outcome,
      clientRefundAmount,
      ownerAwardAmount,
    })
  } catch (error) {
    if (error instanceof AlreadyResolvedError) {
      return NextResponse.json(
        { error: 'This dispute has already been resolved.' },
        { status: 409 },
      )
    }

    console.error('[POST /api/admin/disputes/[id]/resolve]', error)
    return NextResponse.json(
      { error: 'We couldn’t resolve this dispute. Please try again.' },
      { status: 500 },
    )
  }
}
