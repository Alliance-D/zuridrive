/**
 * app/api/admin/broadcast/route.ts
 *
 * POST /api/admin/broadcast — send an announcement to a group of users.
 *
 * Requires COMMUNICATIONS.
 *
 * Safeguards, because this reaches real people's phones and costs money per
 * SMS:
 *  - `confirmRecipientCount` must match what the server counts. If the
 *    audience changed between previewing and sending, the send is rejected
 *    rather than going to a different group than the one shown.
 *  - Suspended users are never included.
 *  - SMS sends are chunked and every one is logged to SmsLog.
 *  - A hard ceiling stops a runaway send.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import {
  NotificationChannel,
  NotificationType,
  Prisma,
  type UserRole,
} from '@prisma/client'
import { z } from 'zod'

/** Refuse to send beyond this in one go. */
const MAX_RECIPIENTS = 5000

const BroadcastSchema = z.object({
  audience: z.enum(['ALL', 'CLIENTS', 'OWNERS', 'ACTIVE_OWNERS']),
  channel: z.enum(['IN_APP', 'SMS', 'BOTH']),
  title: z.string().min(3).max(120),
  body: z.string().min(10).max(700),
  /** Must equal the server's own count, or the send is rejected. */
  confirmRecipientCount: z.number().int().min(0),
})

function audienceWhere(audience: string): Prisma.UserWhereInput {
  const base: Prisma.UserWhereInput = { isSuspended: false }

  switch (audience) {
    case 'CLIENTS':
      return { ...base, role: 'CLIENT' as UserRole }
    case 'OWNERS':
      return { ...base, role: 'OWNER' as UserRole }
    case 'ACTIVE_OWNERS':
      // Owners with at least one live car
      return {
        ...base,
        role: 'OWNER' as UserRole,
        carOwnerProfile: { cars: { some: { status: 'LIVE', isActive: true } } },
      }
    default:
      return { ...base, role: { in: ['CLIENT', 'OWNER'] } }
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'COMMUNICATIONS')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = BroadcastSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please check the message and audience.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const { audience, channel, title, body, confirmRecipientCount } = parsed.data

    const recipients = await prisma.user.findMany({
      where: audienceWhere(audience),
      select: { id: true, phone: true },
    })

    if (recipients.length === 0) {
      return NextResponse.json(
        { error: 'That audience has no one in it.' },
        { status: 400 },
      )
    }

    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        {
          error: `That's ${recipients.length} recipients, above the ${MAX_RECIPIENTS} limit for a single send.`,
        },
        { status: 400 },
      )
    }

    // The audience must be exactly what the sender was shown.
    if (recipients.length !== confirmRecipientCount) {
      return NextResponse.json(
        {
          error: `The audience changed — it's now ${recipients.length} people, not ${confirmRecipientCount}. Review and send again.`,
          actualCount: recipients.length,
        },
        { status: 409 },
      )
    }

    let inAppSent = 0
    let smsSent = 0
    let smsFailed = 0

    if (channel === 'IN_APP' || channel === 'BOTH') {
      const result = await prisma.notification.createMany({
        data: recipients.map((r) => ({
          userId: r.id,
          type: NotificationType.ADMIN_BROADCAST,
          channel: NotificationChannel.IN_APP,
          title,
          body,
        })),
      })
      inAppSent = result.count
    }

    if (channel === 'SMS' || channel === 'BOTH') {
      // Sequential in small batches — Africa's Talking rate-limits, and every
      // send writes its own SmsLog row.
      const withPhone = recipients.filter((r) => r.phone && !r.phone.startsWith('deleted-'))

      for (const r of withPhone) {
        const res = await sendSms({
          to: r.phone,
          userId: r.id,
          type: NotificationType.ADMIN_BROADCAST,
          message: `ZuriDrive: ${body}`,
        })
        if (res.success) smsSent++
        else smsFailed++
      }
    }

    await logAdminAction({
      actorId: session.user.id,
      action: 'PLATFORM_SETTINGS_UPDATED',
      targetType: 'Broadcast',
      description: `Broadcast "${title}" to ${audience} (${recipients.length} people) via ${channel}`,
      metadata: { audience, channel, inAppSent, smsSent, smsFailed, title },
    })

    return NextResponse.json({
      success: true,
      recipients: recipients.length,
      inAppSent,
      smsSent,
      smsFailed,
    })
  } catch (error) {
    console.error('[POST /api/admin/broadcast]', error)
    return NextResponse.json(
      { error: 'The broadcast failed to send. Please try again.' },
      { status: 500 },
    )
  }
}

/** GET — audience sizes, so the UI can show counts before sending. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'COMMUNICATIONS')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const [all, clients, owners, activeOwners] = await Promise.all([
      prisma.user.count({ where: audienceWhere('ALL') }),
      prisma.user.count({ where: audienceWhere('CLIENTS') }),
      prisma.user.count({ where: audienceWhere('OWNERS') }),
      prisma.user.count({ where: audienceWhere('ACTIVE_OWNERS') }),
    ])

    return NextResponse.json({
      ALL: all,
      CLIENTS: clients,
      OWNERS: owners,
      ACTIVE_OWNERS: activeOwners,
    })
  } catch (error) {
    console.error('[GET /api/admin/broadcast]', error)
    return NextResponse.json(
      { error: 'Could not load audience sizes.' },
      { status: 500 },
    )
  }
}
