/**
 * app/api/admin/reviews/[id]/route.ts
 *
 * POST /api/admin/reviews/[id] — Content Moderator actions.
 *
 *   remove  — hide a review that breaks the rules (isVisible = false)
 *   restore — put it back
 *
 * Removal is a soft hide, never a delete. The review, its ratings and the
 * removal reason all stay on the record so a decision can be reviewed later
 * and an owner can't quietly erase criticism.
 *
 * A removed review stops counting toward the car's average because every
 * rating query filters on isVisible.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('remove'),
    reason: z.string().min(10).max(500),
  }),
  z.object({ action: z.literal('restore') }),
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

    const hasAccess = await requireModuleAccess(
      session.user.id,
      'CONTENT_MODERATOR',
    )
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'A reason of at least 10 characters is required to remove a review.' },
        { status: 400 },
      )
    }

    const review = await prisma.review.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        isVisible: true,
        clientId: true,
        car: {
          select: {
            make: true,
            model: true,
            owner: { select: { user: { select: { id: true } } } },
          },
        },
      },
    })

    if (!review) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 })
    }

    const carName = `${review.car.make} ${review.car.model}`

    if (parsed.data.action === 'remove') {
      if (!review.isVisible) {
        return NextResponse.json(
          { error: 'This review is already hidden.' },
          { status: 409 },
        )
      }

      await prisma.review.update({
        where: { id: review.id },
        data: {
          isVisible: false,
          removedById: session.user.id,
          removedReason: parsed.data.reason,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'REVIEW_REMOVED',
        targetType: 'Review',
        targetId: review.id,
        targetUserId: review.clientId,
        reason: parsed.data.reason,
        description: `Removed a review on ${carName}`,
      })

      // The author is told — a review disappearing without explanation is worse
      // than being told why.
      await createNotification({
        userId: review.clientId,
        type: 'ADMIN_BROADCAST',
        title: 'Your review was removed',
        titleKey: 'reviewRemovedTitle',
        bodyKey: 'reviewRemovedBody',
        params: { car: carName, reason: parsed.data.reason },
        body: `Your review of the ${carName} was removed for breaking our content rules. ${parsed.data.reason}`,
      })

      return NextResponse.json({ success: true, isVisible: false })
    }

    // ── RESTORE ────────────────────────────────────────────────────────────
    await prisma.review.update({
      where: { id: review.id },
      data: { isVisible: true, removedById: null, removedReason: null },
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'REVIEW_REMOVED',
      targetType: 'Review',
      targetId: review.id,
      targetUserId: review.clientId,
      description: `Restored a review on ${carName}`,
    })

    return NextResponse.json({ success: true, isVisible: true })
  } catch (error) {
    console.error('[POST /api/admin/reviews/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
