/**
 * app/api/notifications/route.ts
 *
 * GET   /api/notifications        — the signed-in user's notifications
 * PATCH /api/notifications        — mark one, or all, as read
 *
 * A user can only ever see or modify their own notifications; the id is
 * matched against their own userId, so passing someone else's id returns a 404
 * rather than revealing that it exists.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const PatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mark_read'), id: z.string() }),
  z.object({ action: z.literal('mark_all_read') }),
])

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const unreadOnly =
      new URL(req.url).searchParams.get('unread') === 'true'

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: session.user.id,
          ...(unreadOnly ? { isRead: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId: session.user.id, isRead: false },
      }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (error) {
    console.error('[GET /api/notifications]', error)
    return NextResponse.json(
      { error: 'Could not load notifications.' },
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

    const parsed = PatchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    if (parsed.data.action === 'mark_all_read') {
      const result = await prisma.notification.updateMany({
        where: { userId: session.user.id, isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
      return NextResponse.json({ success: true, updated: result.count })
    }

    // Scoped to the owner — you can't mark someone else's notification read.
    const result = await prisma.notification.updateMany({
      where: { id: parsed.data.id, userId: session.user.id },
      data: { isRead: true, readAt: new Date() },
    })

    if (result.count === 0) {
      return NextResponse.json(
        { error: 'Notification not found.' },
        { status: 404 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/notifications]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
