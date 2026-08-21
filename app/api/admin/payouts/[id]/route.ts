/**
 * app/api/admin/payouts/[id]/route.ts
 *
 * POST /api/admin/payouts/[id] — Finance Manager actions on a payout.
 *
 *   approve    PENDING_REQUEST → APPROVED
 *   mark_paid  APPROVED        → PAID   (requires transfer proof)
 *   fail       APPROVED        → FAILED (releases the funds back to balance)
 *
 * The state machine is enforced here, not just in the UI: an approve on an
 * already-paid payout must not silently re-open it.
 *
 * Payouts flagged requiresSuperAdminApproval need a SUPER_ADMIN to approve;
 * a Finance Manager alone cannot release them.
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
import { NotificationType, type PayoutStatus } from '@prisma/client'
import { uploadedFileUrl } from '@/lib/validation/urls'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({
    action: z.literal('mark_paid'),
    proofUrl: uploadedFileUrl,
    referenceNumber: z.string().max(100).optional(),
  }),
  z.object({
    action: z.literal('fail'),
    reason: z.string().min(5).max(500),
  }),
])

/** Which statuses each action may be applied to. */
const ALLOWED_FROM: Record<string, PayoutStatus[]> = {
  approve: ['PENDING_REQUEST'],
  mark_paid: ['APPROVED'],
  fail: ['APPROVED', 'PENDING_REQUEST'],
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

    const hasAccess = await requireModuleAccess(session.user.id, 'FINANCE_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const payout = await prisma.payout.findUnique({
      where: { id: params.id },
      include: {
        owner: {
          select: {
            id: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
        _count: { select: { items: true } },
      },
    })

    if (!payout) {
      return NextResponse.json({ error: 'Payout not found.' }, { status: 404 })
    }

    const { action } = parsed.data

    if (!ALLOWED_FROM[action].includes(payout.status)) {
      return NextResponse.json(
        {
          error: `Can't ${action.replace('_', ' ')} a payout that is ${payout.status
            .toLowerCase()
            .replace('_', ' ')}.`,
        },
        { status: 409 },
      )
    }

    const ownerUser = payout.owner.user
    const now = new Date()

    // ── APPROVE ────────────────────────────────────────────────────────────
    if (action === 'approve') {
      // Large payouts need a Super Admin, not just a Finance Manager.
      if (payout.requiresSuperAdminApproval) {
        const actor = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { role: true },
        })
        if (actor?.role !== 'SUPER_ADMIN') {
          return NextResponse.json(
            {
              error:
                'This payout is above the large-payout threshold and needs Super Admin approval.',
            },
            { status: 403 },
          )
        }
      }

      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          approvedById: session.user.id,
          ...(payout.requiresSuperAdminApproval
            ? { superAdminApprovedAt: now, superAdminApprovedById: session.user.id }
            : {}),
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'PAYOUT_APPROVED',
        targetType: 'Payout',
        targetId: payout.id,
        targetUserId: ownerUser.id,
        description: `Approved ${formatMoney(payout.netAmount)} payout`,
        metadata: { netAmount: payout.netAmount, trips: payout._count.items },
      })

      await createNotification({
        userId: ownerUser.id,
        type: 'PAYOUT_PROCESSED',
        title: 'Payout approved',
      titleKey: 'payoutApprovedTitle',
      bodyKey: 'payoutApprovedBody',
      params: { amount: formatMoney(payout.netAmount) },
        body: `Your ${formatMoney(payout.netAmount)} payout has been approved and is being processed.`,
        actionUrl: '/owner/payouts',
      })

      return NextResponse.json({ success: true, status: 'APPROVED' })
    }

    // ── MARK PAID ──────────────────────────────────────────────────────────
    if (action === 'mark_paid') {
      await prisma.payout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          paidAt: now,
          paidById: session.user.id,
          proofUrl: parsed.data.proofUrl,
          referenceNumber: parsed.data.referenceNumber,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'PAYOUT_MARKED_PAID',
        targetType: 'Payout',
        targetId: payout.id,
        targetUserId: ownerUser.id,
        description: `Marked ${formatMoney(payout.netAmount)} payout as paid`,
        metadata: {
          netAmount: payout.netAmount,
          reference: parsed.data.referenceNumber,
        },
      })

      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.PAYOUT_PROCESSED,
          userId: ownerUser.id,
          messageKey: 'payoutSent',
          params: {
            amount: formatMoney(payout.netAmount),
            method: payout.method,
          },
        })
      }

      await createNotification({
        userId: ownerUser.id,
        type: 'PAYOUT_PROCESSED',
        title: 'Payout sent',
      titleKey: 'payoutSentTitle',
      bodyKey: 'payoutSentBody',
      params: { amount: formatMoney(payout.netAmount) },
        body: `${formatMoney(payout.netAmount)} is on its way to you.`,
        actionUrl: '/owner/payouts',
      })

      return NextResponse.json({ success: true, status: 'PAID' })
    }

    // ── FAIL ───────────────────────────────────────────────────────────────
    // FAILED payouts are excluded from the "already requested" total, so the
    // owner's balance becomes available again automatically.
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: 'FAILED',
        failureReason: parsed.data.reason,
      },
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'PAYOUT_FAILED',
      targetType: 'Payout',
      targetId: payout.id,
      targetUserId: ownerUser.id,
      reason: parsed.data.reason,
      description: `Marked ${formatMoney(payout.netAmount)} payout as failed`,
    })

    if (ownerUser.phone) {
      await sendSms({
        to: ownerUser.phone,
        type: NotificationType.PAYOUT_PROCESSED,
        userId: ownerUser.id,
        messageKey: 'payoutFailed',
        params: {
          amount: formatMoney(payout.netAmount),
          reason: parsed.data.reason,
        },
      })
    }

    return NextResponse.json({ success: true, status: 'FAILED' })
  } catch (error) {
    console.error('[POST /api/admin/payouts/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
