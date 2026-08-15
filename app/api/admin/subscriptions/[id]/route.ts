/**
 * app/api/admin/subscriptions/[id]/route.ts
 *
 * PATCH /api/admin/subscriptions/[id]
 *
 *   CONFIRM  — Finance Manager verifies a bank transfer and the plan starts
 *   REJECT   — the money never arrived; the request is refused with a reason
 *   OVERRIDE — Super Admin grants or extends a plan with no payment at all
 *   CANCEL   — end a plan now
 *
 * Every one of these routes through activateSubscription() or applyPlanChange(),
 * so listings and search placement follow the plan automatically. None of them
 * touch cars directly — that would be the drift this design exists to prevent.
 *
 * OVERRIDE is Super Admin only. Confirming a payment is a finance job; handing
 * out a paid plan for free is not.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, hasAdminModule } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/admin-logger'
import { createNotification } from '@/lib/notifications'
import { sendSms } from '@/lib/sms'
import { activateSubscription } from '@/lib/subscriptions/checkout'
import { applyPlanChange } from '@/lib/subscriptions/limits'
import { formatRWF } from '@/lib/currency'
import { NotificationType } from '@prisma/client'
import { z } from 'zod'

const PatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('CONFIRM') }),
  z.object({
    action: z.literal('REJECT'),
    reason: z.string().min(5).max(500),
  }),
  z.object({
    action: z.literal('OVERRIDE'),
    note: z.string().min(5).max(500),
  }),
  z.object({
    action: z.literal('CANCEL'),
    reason: z.string().min(5).max(500),
  }),
])

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const parsed = PatchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Unknown action, or a reason is missing.' },
        { status: 400 },
      )
    }

    const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
    const isFinance = await hasAdminModule('FINANCE_MANAGER')

    if (parsed.data.action === 'OVERRIDE' && !isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only a Super Admin can grant a plan without payment.' },
        { status: 403 },
      )
    }

    if (!isFinance) {
      return NextResponse.json(
        { error: 'You don’t have the Finance Manager role.' },
        { status: 403 },
      )
    }

    const subscription = await prisma.ownerSubscription.findUnique({
      where: { id: params.id },
      include: {
        plan: true,
        owner: {
          select: {
            id: true,
            user: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription not found.' },
        { status: 404 },
      )
    }

    const ownerUser = subscription.owner.user
    const action = parsed.data.action

    // ── CONFIRM / OVERRIDE — both activate ────────────────────────────────
    if (action === 'CONFIRM' || action === 'OVERRIDE') {
      if (subscription.status === 'ACTIVE' && action === 'CONFIRM') {
        return NextResponse.json(
          { error: 'This subscription is already active.' },
          { status: 409 },
        )
      }

      const activation = await prisma.$transaction((tx) =>
        activateSubscription(tx, subscription.id, {
          confirmedById: session.user.id,
        }),
      )

      if (action === 'OVERRIDE') {
        await prisma.ownerSubscription.update({
          where: { id: subscription.id },
          data: {
            isManualOverride: true,
            overrideById: session.user.id,
            overrideNote: parsed.data.note,
          },
        })
      }

      await logAdminAction({
        actorId: session.user.id,
        action:
          action === 'OVERRIDE'
            ? 'SUBSCRIPTION_OVERRIDDEN'
            : 'PAYMENT_CONFIRMED_MANUAL',
        targetType: 'OwnerSubscription',
        targetId: subscription.id,
        targetUserId: ownerUser.id,
        description:
          action === 'OVERRIDE'
            ? `Granted ${activation.planName} without payment — ${parsed.data.note}`
            : `Confirmed ${activation.planName} payment (${formatRWF(subscription.pricePaid ?? subscription.plan.priceMonthly)})`,
        reason: action === 'OVERRIDE' ? parsed.data.note : undefined,
        metadata: {
          expiresAt: activation.expiresAt.toISOString(),
          isRenewal: activation.isRenewal,
          carsRelisted: activation.relisted,
          carsUnlisted: activation.unlisted,
        },
      })

      const relistNote =
        activation.relisted > 0
          ? ` ${activation.relisted} of your cars are back online.`
          : activation.unlisted > 0
            ? ` ${activation.unlisted} car${activation.unlisted === 1 ? ' was' : 's were'} unlisted to fit the new plan.`
            : ''

      await createNotification({
        userId: ownerUser.id,
        type: 'PAYMENT_CONFIRMED',
        title: `${activation.planName} is active`,
        body: `Renews ${activation.expiresAt.toLocaleDateString('en-RW')}.${relistNote}`,
        titleKey: 'planActiveTitle',
        // The note is a separate key rather than a param, because the
        // sentence pluralises differently in each language.
        bodyKey:
          activation.relisted > 0
            ? 'planActiveRelistedBody'
            : activation.unlisted > 0
              ? 'planActiveUnlistedBody'
              : 'planActiveBody',
        params: {
          plan: activation.planName,
          date: activation.expiresAt.toISOString(),
          count: activation.relisted > 0 ? activation.relisted : activation.unlisted,
        },
        actionUrl: '/owner/subscription',
      })

      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.PAYMENT_CONFIRMED,
          userId: ownerUser.id,
          message: `ZuriDrive: Your ${activation.planName} plan is active until ${activation.expiresAt.toLocaleDateString('en-RW')}.${relistNote}`,
        })
      }

      return NextResponse.json({ success: true, ...activation })
    }

    // ── REJECT — the money never arrived ──────────────────────────────────
    if (action === 'REJECT') {
      if (subscription.status !== 'PENDING_PAYMENT') {
        return NextResponse.json(
          { error: 'Only a pending payment can be rejected.' },
          { status: 409 },
        )
      }

      await prisma.ownerSubscription.update({
        where: { id: subscription.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          rejectionReason: parsed.data.reason,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'SUBSCRIPTION_OVERRIDDEN',
        targetType: 'OwnerSubscription',
        targetId: subscription.id,
        targetUserId: ownerUser.id,
        description: `Rejected ${subscription.plan.name} payment`,
        reason: parsed.data.reason,
      })

      await createNotification({
        userId: ownerUser.id,
        type: 'PAYMENT_CONFIRMED',
        title: 'We couldn’t confirm your subscription payment',
      titleKey: 'planPaymentFailedTitle',
      bodyKey: 'planPaymentFailedBody',
      params: { plan: subscription.plan.name, reason: parsed.data.reason },
        body: `${subscription.plan.name} — ${parsed.data.reason}`,
        actionUrl: '/owner/subscription',
      })

      return NextResponse.json({ success: true })
    }

    // ── CANCEL — end a live plan now ──────────────────────────────────────
    await prisma.ownerSubscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        rejectionReason: parsed.data.reason,
      },
    })

    // Falls back to the free tier, which may take cars offline. Booked cars
    // are protected inside applyPlanChange().
    const change = await applyPlanChange(prisma, subscription.owner.id)

    await logAdminAction({
      actorId: session.user.id,
      action: 'SUBSCRIPTION_OVERRIDDEN',
      targetType: 'OwnerSubscription',
      targetId: subscription.id,
      targetUserId: ownerUser.id,
      description: `Cancelled ${subscription.plan.name}`,
      reason: parsed.data.reason,
      metadata: { carsUnlisted: change.unlisted },
    })

    await createNotification({
      userId: ownerUser.id,
      type: 'SUBSCRIPTION_EXPIRED',
      title: `${subscription.plan.name} has ended`,
      body:
        change.unlisted > 0
          ? `${parsed.data.reason} — ${change.unlisted} car${change.unlisted === 1 ? '' : 's'} unlisted. Cars with bookings stay live.`
          : parsed.data.reason,
      titleKey: 'planEndedTitle',
      bodyKey:
        change.unlisted > 0 ? 'planEndedWithUnlistedBody' : 'planEndedBody',
      params: {
        plan: subscription.plan.name,
        reason: parsed.data.reason,
        count: change.unlisted,
      },
      actionUrl: '/owner/subscription',
    })

    return NextResponse.json({ success: true, unlisted: change.unlisted })
  } catch (error) {
    console.error('[PATCH /api/admin/subscriptions/[id]]', error)
    return NextResponse.json(
      { error: 'We couldn’t update this subscription.' },
      { status: 500 },
    )
  }
}
