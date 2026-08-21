/**
 * app/api/deposits/[depositId]/route.ts
 *
 * POST /api/deposits/[depositId]
 *
 * Deposit Manager actions:
 *   "release"           — release full deposit back to client
 *   "withhold_partial"  — withhold part, return remainder to client
 *   "withhold_full"     — withhold entire deposit (transfer to owner)
 *
 * Rules:
 * - Deposit record is NEVER edited — only status updated + DepositMovement appended
 * - Every action requires a reason (immutable audit trail)
 * - Only Deposit Manager or Super Admin can take these actions
 * - All actions logged via logAdminAction()
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { formatMoney } from '@/lib/currency'
import { z } from 'zod'

const DepositActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('release'),
    reason: z.string().min(5).max(500),
  }),
  z.object({
    action: z.literal('withhold_partial'),
    withholdAmount: z.number().int().positive(),
    reason: z.string().min(5).max(500),
  }),
  z.object({
    action: z.literal('withhold_full'),
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

    // Only Deposit Manager or Super Admin
    const hasAccess = await requireModuleAccess(session.user.id, 'DEPOSIT_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = DepositActionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request.', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const deposit = await db.deposit.findUnique({
      where: { id: params.id },
      // Deposit has no direct client/owner relations — both hang off booking.
      include: {
        booking: {
          select: {
            reference: true,
            carId: true,
            client: { select: { id: true, phone: true, name: true } },
            car: {
              select: {
                owner: {
                  select: { user: { select: { id: true, phone: true, name: true } } },
                },
              },
            },
          },
        },
      },
    })

    if (!deposit) {
      return NextResponse.json({ error: 'Deposit not found.' }, { status: 404 })
    }

    const client = deposit.booking.client
    const ownerUser = deposit.booking.car.owner.user

    // Can only act on HELD deposits
    if (deposit.status !== 'HELD') {
      return NextResponse.json(
        { error: `This deposit has already been ${deposit.status.toLowerCase()}.` },
        { status: 400 },
      )
    }

    const { action } = parsed.data
    const now = new Date()

    // ── RELEASE ─────────────────────────────────────────────────────────────
    if (action === 'release') {
      await db.$transaction(async (tx) => {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: 'RELEASED',
            releasedAt: now,
            releaseTriggeredBy: 'ADMIN_MANUAL',
            releasedById: session.user.id,
            clientRefundAmount: deposit.amount,
            ownerAwardAmount: 0,
          },
        })

        // The reason lives on the movement — Deposit itself stays a summary row.
        await tx.depositMovement.create({
          data: {
            depositId: deposit.id,
            fromStatus: deposit.status,
            toStatus: 'RELEASED',
            amount: deposit.amount,
            reason: parsed.data.reason,
            actorId: session.user.id,
          },
        })
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'DEPOSIT_RELEASED',
        targetType: 'Deposit',
        targetId: deposit.id,
        reason: parsed.data.reason,
        metadata: { amount: deposit.amount, bookingRef: deposit.booking.reference },
      })

      if (client.phone) {
        await sendSms({
          to: client.phone,
          messageKey: 'depositReleased',
          params: {
            amount: formatMoney(deposit.amount),
            reference: deposit.booking.reference,
          },
        })
      }

      return NextResponse.json({ success: true, status: 'RELEASED' })
    }

    // ── WITHHOLD PARTIAL ────────────────────────────────────────────────────
    if (action === 'withhold_partial') {
      const { withholdAmount, reason } = parsed.data

      if (withholdAmount >= deposit.amount) {
        return NextResponse.json(
          { error: 'Withheld amount must be less than the total deposit. Use "withhold full" instead.' },
          { status: 400 },
        )
      }

      const returnAmount = deposit.amount - withholdAmount

      await db.$transaction(async (tx) => {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: 'PARTIALLY_WITHHELD',
            releasedAt: now,
            releaseTriggeredBy: 'ADMIN_MANUAL',
            releasedById: session.user.id,
            ownerAwardAmount: withholdAmount,
            clientRefundAmount: returnAmount,
          },
        })

        // Two movements: one withheld, one released
        await tx.depositMovement.create({
          data: {
            depositId: deposit.id,
            fromStatus: deposit.status,
            toStatus: 'PARTIALLY_WITHHELD',
            amount: withholdAmount,
            reason: `Withheld: ${reason}`,
            actorId: session.user.id,
          },
        })

        await tx.depositMovement.create({
          data: {
            depositId: deposit.id,
            fromStatus: 'PARTIALLY_WITHHELD',
            toStatus: 'PARTIALLY_WITHHELD',
            amount: returnAmount,
            reason: `Remainder returned to client: ${reason}`,
            actorId: session.user.id,
          },
        })
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'DEPOSIT_PARTIALLY_WITHHELD',
        targetType: 'Deposit',
        targetId: deposit.id,
        reason,
        metadata: { withholdAmount, returnAmount, bookingRef: deposit.booking.reference },
      })

      // SMS client
      if (client.phone) {
        await sendSms({
          to: client.phone,
          messageKey: 'depositPartialWithheldClient',
          params: {
            withheld: formatMoney(withholdAmount),
            reference: deposit.booking.reference,
            returned: formatMoney(returnAmount),
            reason,
          },
        })
      }
      // SMS owner
      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          messageKey: 'depositDeductionOwner',
          params: {
            amount: formatMoney(withholdAmount),
            reference: deposit.booking.reference,
          },
        })
      }

      return NextResponse.json({ success: true, status: 'PARTIALLY_WITHHELD', withholdAmount, returnAmount })
    }

    // ── WITHHOLD FULL ───────────────────────────────────────────────────────
    if (action === 'withhold_full') {
      const { reason } = parsed.data

      await db.$transaction(async (tx) => {
        await tx.deposit.update({
          where: { id: deposit.id },
          data: {
            status: 'FULLY_WITHHELD',
            releasedAt: now,
            releaseTriggeredBy: 'ADMIN_MANUAL',
            releasedById: session.user.id,
            ownerAwardAmount: deposit.amount,
            clientRefundAmount: 0,
          },
        })

        await tx.depositMovement.create({
          data: {
            depositId: deposit.id,
            fromStatus: deposit.status,
            toStatus: 'FULLY_WITHHELD',
            amount: deposit.amount,
            reason,
            actorId: session.user.id,
          },
        })
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'DEPOSIT_FULLY_WITHHELD',
        targetType: 'Deposit',
        targetId: deposit.id,
        reason,
        metadata: { amount: deposit.amount, bookingRef: deposit.booking.reference },
      })

      if (client.phone) {
        await sendSms({
          to: client.phone,
          messageKey: 'depositFullWithheld',
          params: {
            amount: formatMoney(deposit.amount),
            reference: deposit.booking.reference,
            reason,
          },
        })
      }

      return NextResponse.json({ success: true, status: 'FULLY_WITHHELD' })
    }
  } catch (error) {
    console.error('[POST /api/deposits/[depositId]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/deposits/[depositId]
 * Returns deposit details + full movement history.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const deposit = await db.deposit.findUnique({
      where: { id: params.id },
      include: {
        movements: { orderBy: { createdAt: 'asc' } },
        booking: {
          select: {
            reference: true,
            startDate: true,
            endDate: true,
            status: true,
            car: { select: { make: true, model: true, year: true } },
            client: { select: { name: true, phone: true } },
          },
        },
      },
    })

    if (!deposit) {
      return NextResponse.json({ error: 'Deposit not found.' }, { status: 404 })
    }

    return NextResponse.json(deposit)
  } catch {
    return NextResponse.json({ error: 'Could not load deposit.' }, { status: 500 })
  }
}
