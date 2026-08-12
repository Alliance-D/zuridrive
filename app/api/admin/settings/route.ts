/**
 * app/api/admin/settings/route.ts
 *
 * PATCH /api/admin/settings — update platform settings.
 *
 * SUPER_ADMIN only. These values change how money is calculated and how long
 * evidence is kept, so no sub-admin module grants access — not even
 * FINANCE_MANAGER.
 *
 * Every change is diffed against the previous values and written to the admin
 * audit log with both the old and new figure, so a rate change is always
 * traceable to a person and a moment.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/admin-logger'
import {
  SETTINGS_ID,
  SETTING_LIMITS,
  ensurePlatformSettings,
} from '@/lib/platform-settings'
import { z } from 'zod'

const L = SETTING_LIMITS

const UpdateSchema = z.object({
  commissionRatePercent: z
    .number()
    .int()
    .min(L.commissionRatePercent.min)
    .max(L.commissionRatePercent.max),
  largePayoutThreshold: z
    .number()
    .int()
    .min(L.largePayoutThreshold.min)
    .max(L.largePayoutThreshold.max),
  autoPublishListings: z.boolean(),
  freeTierMaxListings: z
    .number()
    .int()
    .min(L.freeTierMaxListings.min)
    .max(L.freeTierMaxListings.max),
  lateCancellationWindowHours: z
    .number()
    .int()
    .min(L.lateCancellationWindowHours.min)
    .max(L.lateCancellationWindowHours.max),
  lateCancellationFeePercent: z
    .number()
    .int()
    .min(L.lateCancellationFeePercent.min)
    .max(L.lateCancellationFeePercent.max),
  photoRetentionDays: z
    .number()
    .int()
    .min(L.photoRetentionDays.min)
    .max(L.photoRetentionDays.max),
  ownerConfirmWindowHours: z
    .number()
    .int()
    .min(L.ownerConfirmWindowHours.min)
    .max(L.ownerConfirmWindowHours.max),
  autoCompleteHours: z
    .number()
    .int()
    .min(L.autoCompleteHours.min)
    .max(L.autoCompleteHours.max),
})

const LABELS: Record<string, string> = {
  commissionRatePercent: 'Commission rate',
  largePayoutThreshold: 'Large payout threshold',
  autoPublishListings: 'Auto-publish listings',
  freeTierMaxListings: 'Free-tier listing allowance',
  lateCancellationWindowHours: 'Late-cancellation window',
  lateCancellationFeePercent: 'Late-cancellation fee',
  photoRetentionDays: 'Photo retention',
  ownerConfirmWindowHours: 'Owner confirmation window',
  autoCompleteHours: 'Auto-complete window',
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    // Platform settings are Super Admin only — no module grants this.
    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, isSuspended: true },
    })

    if (!actor || actor.isSuspended || actor.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only a Super Admin can change platform settings.' },
        { status: 403 },
      )
    }

    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Some values are outside the allowed range.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const previous = await ensurePlatformSettings()
    const next = parsed.data

    // Diff so the audit entry says what actually changed.
    const changes: string[] = []
    for (const key of Object.keys(next) as (keyof typeof next)[]) {
      if (previous[key] !== next[key]) {
        changes.push(`${LABELS[key]}: ${previous[key]} → ${next[key]}`)
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ success: true, changed: false })
    }

    await prisma.platformSetting.update({
      where: { id: SETTINGS_ID },
      data: { ...next, updatedById: session.user.id },
    })

    const rateChanged =
      previous.commissionRatePercent !== next.commissionRatePercent

    await logAdminAction({
      actorId: session.user.id,
      // A commission change gets its own action type — it is the highest-impact
      // setting on the platform.
      action: rateChanged ? 'COMMISSION_RATE_UPDATED' : 'PLATFORM_SETTINGS_UPDATED',
      targetType: 'PlatformSetting',
      targetId: SETTINGS_ID,
      description: changes.join('; '),
      metadata: { previous: { ...previous }, next },
    })

    return NextResponse.json({ success: true, changed: true, changes })
  } catch (error) {
    console.error('[PATCH /api/admin/settings]', error)
    return NextResponse.json(
      { error: 'We couldn’t save these settings. Please try again.' },
      { status: 500 },
    )
  }
}
