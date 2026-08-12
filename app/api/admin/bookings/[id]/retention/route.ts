/**
 * app/api/admin/bookings/[bookingId]/photos/retention/route.ts
 *
 * POST /api/admin/bookings/[bookingId]/photos/retention
 *
 * Admin-only: extend or lock photo retention for a booking.
 * Used when admin needs to keep evidence for a dispute or investigation.
 *
 * Actions:
 *   "lock"    — lock photos indefinitely (retainUntil = null, lockedByDispute = true)
 *   "unlock"  — release the lock, set retainUntil to 3 days from now
 *   "extend"  — extend retainUntil by N days
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { z } from 'zod'

const RetentionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('lock'), reason: z.string().min(5) }),
  z.object({ action: z.literal('unlock'), reason: z.string().min(5) }),
  z.object({ action: z.literal('extend'), days: z.number().int().min(1).max(365), reason: z.string().min(5) }),
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

    // Booking Manager or Super Admin
    const hasAccess = await requireModuleAccess(session.user.id, 'BOOKING_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const body = await req.json()
    const parsed = RetentionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const booking = await db.booking.findUnique({
      where: { id: params.id },
      select: { id: true, reference: true },
    })
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const { action } = parsed.data
    let updateData: { retainUntil: Date | null; isLocked: boolean } = {
      retainUntil: null,
      isLocked: false,
    }

    if (action === 'lock') {
      // Lock indefinitely
      updateData = { retainUntil: null, isLocked: true }
    } else if (action === 'unlock') {
      // Release lock — retain for 3 more days then delete
      updateData = {
        retainUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        isLocked: false,
      }
    } else if (action === 'extend') {
      const { days } = parsed.data
      updateData = {
        retainUntil: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        isLocked: false,
      }
    }

    // Update all non-deleted photos for this booking
    const updated = await db.bookingConditionPhoto.updateMany({
      where: { bookingId: params.id, isDeleted: false },
      data: updateData,
    })

    await logAdminAction({
      actorId: session.user.id,
      // 'extend' is a softer form of locking — both keep photos alive past
      // their normal window, so they share the LOCKED action type.
      action: action === 'unlock'
        ? 'CONDITION_PHOTOS_UNLOCKED'
        : 'CONDITION_PHOTOS_LOCKED',
      description: `Photo retention: ${action}`,
      targetType: 'Booking',
      targetId: params.id,
      reason: parsed.data.reason,
      metadata: {
        bookingRef: booking.reference,
        photosAffected: updated.count,
        ...(action === 'extend' ? { days: parsed.data.days } : {}),
      },
    })

    return NextResponse.json({
      success: true,
      photosAffected: updated.count,
      action,
    })
  } catch (error) {
    console.error('[POST /api/admin/bookings/[bookingId]/photos/retention]', error)
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 })
  }
}
