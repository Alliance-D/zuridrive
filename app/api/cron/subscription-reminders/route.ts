/**
 * app/api/cron/subscription-reminders/route.ts
 *
 * GET /api/cron/subscription-reminders — runs daily.
 *
 * Two jobs:
 *  1. Warn owners whose subscription renews in the next 7 days.
 *  2. Mark subscriptions that have passed their expiry as LAPSED, and tell the
 *     owner.
 *
 * Lapsing drops the plan perks — search priority returns to standard, the
 * verified badge is removed, and listings are brought down to the free-tier
 * allowance.
 *
 * A car with an active or upcoming booking is NEVER unlisted, whatever the
 * allowance says. Someone has paid for that trip; taking the listing offline
 * would strand them. Unlisted cars are marked so renewing puts back exactly
 * those, and not the ones the owner paused themselves.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { formatMoney } from '@/lib/currency'
import { NotificationType } from '@prisma/client'
import { applyPlanChange } from '@/lib/subscriptions/limits'

const CRON_SECRET = process.env.CRON_SECRET!

/** Warn this many days before renewal. */
const REMINDER_WINDOW_DAYS = 7

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const windowEnd = new Date(
    now.getTime() + REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )

  let remindersSent = 0
  let lapsed = 0
  let carsUnlisted = 0

  // ── 1. Renewal reminders ────────────────────────────────────────────────
  const renewingSoon = await db.ownerSubscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'TRIAL'] },
      expiresAt: { gt: now, lte: windowEnd },
    },
    include: {
      plan: true,
      owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
    },
  })

  for (const sub of renewingSoon) {
    const user = sub.owner.user
    const daysLeft = Math.max(
      1,
      Math.ceil((sub.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
    )

    if (user.phone) {
      await sendSms({
        to: user.phone,
        type: NotificationType.SUBSCRIPTION_RENEWING,
        userId: user.id,
        messageKey: 'subscriptionRenewing',
        params: {
          plan: sub.plan.name,
          price: formatMoney(sub.plan.priceMonthly),
          days: daysLeft,
        },
      })
    }

    await createNotification({
      userId: user.id,
      type: 'SUBSCRIPTION_RENEWING',
      title: 'Subscription renewing soon',
      body: `Your ${sub.plan.name} plan renews on ${sub.expiresAt.toLocaleDateString('en-RW')}.`,
      titleKey: 'renewingSoonTitle',
      bodyKey: 'renewingSoonBody',
      params: {
        plan: sub.plan.name,
        date: sub.expiresAt.toISOString(),
      },
      actionUrl: '/owner/subscription',
    })

    remindersSent++
  }

  // ── 2. Lapse expired subscriptions ──────────────────────────────────────
  const expired = await db.ownerSubscription.findMany({
    where: { status: { in: ['ACTIVE', 'TRIAL'] }, expiresAt: { lte: now } },
    include: {
      plan: true,
      owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
    },
  })

  for (const sub of expired) {
    const user = sub.owner.user

    await db.ownerSubscription.update({
      where: { id: sub.id },
      data: { status: 'LAPSED' },
    })

    // One call drops the perks (standard placement, no badge) and brings
    // listings down to the free-tier allowance. Cars with an active or
    // upcoming booking are never touched — someone has paid for those trips.
    // Renewal goes through the same function in the other direction, which is
    // why a lapse and a renewal can't disagree about what a plan is worth.
    const { unlisted, protectedByBooking } = await applyPlanChange(db, sub.ownerId)
    carsUnlisted += unlisted

    if (user.phone) {
      await sendSms({
        to: user.phone,
        type: NotificationType.SUBSCRIPTION_EXPIRED,
        userId: user.id,
        messageKey: unlisted > 0
          ? 'subscriptionExpiredUnlisted'
          : 'subscriptionExpiredLive',
        params: { plan: sub.plan.name, count: unlisted },
      })
    }

    await createNotification({
      userId: user.id,
      type: 'SUBSCRIPTION_EXPIRED',
      title: 'Subscription expired',
      titleKey: 'subscriptionExpiredTitle',
      bodyKey:
        unlisted > 0
          ? 'subscriptionLapsedUnlistedBody'
          : 'subscriptionLapsedLiveBody',
      params: {
        plan: sub.plan.name,
        count: unlisted,
        protectedCount: protectedByBooking,
      },
      body: unlisted > 0
        ? `Your ${sub.plan.name} plan has lapsed. ${unlisted} car${unlisted === 1 ? ' was' : 's were'} unlisted to fit the free tier${protectedByBooking > 0 ? `, though ${protectedByBooking} with bookings stayed live` : ''}. Renewing puts them straight back.`
        : `Your ${sub.plan.name} plan has lapsed. Your cars stay live, but you've dropped to standard search placement and can't list new ones until you renew.`,
      actionUrl: '/owner/subscription',
    })

    lapsed++
  }

  console.log(
    `[cron/subscription-reminders] Reminders: ${remindersSent}, lapsed: ${lapsed}, cars unlisted: ${carsUnlisted}`,
  )

  return NextResponse.json({
    ok: true,
    remindersSent,
    lapsed,
    carsUnlisted,
    timestamp: now.toISOString(),
  })
}
