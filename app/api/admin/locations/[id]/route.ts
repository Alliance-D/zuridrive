/**
 * app/api/admin/locations/[id]/route.ts
 *
 * POST /api/admin/locations/[id] — Content Moderator reviews an owner's
 * custom pickup point.
 *
 *   approve — clients can now choose it at booking
 *   reject  — removed, with a reason the owner sees
 *
 * Owner locations are created isApproved:false by the listing wizard, so
 * without this endpoint they can never become selectable. Rejection deletes
 * the row rather than leaving an unreachable record — nothing references it
 * until a booking uses it, and an approved-only location can't have been used.
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
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().min(10).max(500) }),
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
        { error: 'A reason of at least 10 characters is required to reject.' },
        { status: 400 },
      )
    }

    const location = await prisma.ownerLocation.findUnique({
      where: { id: params.id },
      include: {
        car: {
          select: {
            make: true,
            model: true,
            owner: { select: { user: { select: { id: true } } } },
          },
        },
        _count: { select: { bookingLocations: true } },
      },
    })

    if (!location) {
      return NextResponse.json({ error: 'Location not found.' }, { status: 404 })
    }

    const ownerUserId = location.car.owner.user.id
    const carName = `${location.car.make} ${location.car.model}`

    if (parsed.data.action === 'approve') {
      await prisma.ownerLocation.update({
        where: { id: location.id },
        data: {
          isApproved: true,
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'OWNER_LOCATION_APPROVED',
        targetType: 'OwnerLocation',
        targetId: location.id,
        targetUserId: ownerUserId,
        description: `Approved pickup point "${location.name}" on ${carName}`,
      })

      await createNotification({
        userId: ownerUserId,
        type: 'ADMIN_BROADCAST',
        title: 'Pickup point approved',
      titleKey: 'pickupApprovedTitle',
      bodyKey: 'pickupApprovedBody',
      params: { location: location.name, car: carName },
        body: `"${location.name}" is now available for clients booking your ${carName}.`,
        actionUrl: '/owner/locations',
      })

      return NextResponse.json({ success: true, isApproved: true })
    }

    // ── REJECT ─────────────────────────────────────────────────────────────
    // A location already used by a booking is history — hide it instead of
    // deleting, so the booking's pickup point doesn't vanish.
    if (location._count.bookingLocations > 0) {
      await prisma.ownerLocation.update({
        where: { id: location.id },
        data: { isApproved: false, approvedById: null, approvedAt: null },
      })
    } else {
      await prisma.ownerLocation.delete({ where: { id: location.id } })
    }

    await logAdminAction({
      actorId: session.user.id,
      action: 'OWNER_LOCATION_REJECTED',
      targetType: 'OwnerLocation',
      targetId: location.id,
      targetUserId: ownerUserId,
      reason: parsed.data.reason,
      description: `Rejected pickup point "${location.name}" on ${carName}`,
    })

    await createNotification({
      userId: ownerUserId,
      type: 'ADMIN_BROADCAST',
      title: 'Pickup point not approved',
      titleKey: 'pickupRejectedTitle',
      bodyKey: 'pickupRejectedBody',
      params: { location: location.name, reason: parsed.data.reason },
      body: `"${location.name}" wasn't approved. ${parsed.data.reason}`,
      actionUrl: '/owner/locations',
    })

    return NextResponse.json({ success: true, isApproved: false })
  } catch (error) {
    console.error('[POST /api/admin/locations/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
