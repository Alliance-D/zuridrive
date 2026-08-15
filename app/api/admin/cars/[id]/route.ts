/**
 * app/api/admin/cars/[id]/route.ts
 *
 * POST /api/admin/cars/[id] — Fleet Manager moderation.
 *
 *   approve   PENDING_APPROVAL → LIVE
 *   reject    PENDING_APPROVAL → DRAFT, with a reason the owner sees
 *   suspend   LIVE             → SUSPENDED, with a reason
 *   reinstate SUSPENDED        → LIVE
 *   feature / unfeature        — homepage placement
 *
 * A car with an active or upcoming booking cannot be suspended out from under
 * the client who booked it — those trips have to be dealt with first.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { NotificationType, type BookingStatus } from '@prisma/client'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().min(10).max(500) }),
  z.object({ action: z.literal('suspend'), reason: z.string().min(10).max(500) }),
  z.object({ action: z.literal('reinstate') }),
  z.object({
    action: z.literal('feature'),
    featuredUntil: z.string().datetime().optional(),
  }),
  z.object({ action: z.literal('unfeature') }),
])

/** Bookings that would be broken by pulling a car offline. */
// Not `as const` — Prisma's `in` filter needs a mutable array.
const LIVE_BOOKING_STATUSES: BookingStatus[] = [
  'PAYMENT_CONFIRMED',
  'AWAITING_OWNER_CONFIRMATION',
  'CONFIRMED',
  'ACTIVE',
]

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const hasAccess = await requireModuleAccess(session.user.id, 'FLEET_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request — a reason of at least 10 characters is required.' },
        { status: 400 },
      )
    }

    const car = await prisma.car.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
        _count: {
          select: {
            bookings: { where: { status: { in: LIVE_BOOKING_STATUSES } } },
          },
        },
      },
    })

    if (!car) {
      return NextResponse.json({ error: 'Car not found.' }, { status: 404 })
    }

    const { action } = parsed.data
    const carName = `${car.year} ${car.make} ${car.model}`
    const ownerUser = car.owner.user
    const now = new Date()

    // ── APPROVE ────────────────────────────────────────────────────────────
    if (action === 'approve') {
      if (car.status === 'LIVE') {
        return NextResponse.json(
          { error: 'This car is already live.' },
          { status: 409 },
        )
      }

      await prisma.car.update({
        where: { id: car.id },
        data: {
          status: 'LIVE',
          rejectionReason: null,
          publishedAt: car.publishedAt ?? now,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'CAR_APPROVED',
        targetType: 'Car',
        targetId: car.id,
        targetUserId: ownerUser.id,
        description: `Approved ${carName} (${car.licensePlate})`,
      })

      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.ADMIN_BROADCAST,
          userId: ownerUser.id,
          message: `ZuriDrive: Your ${carName} is now live and can be booked. Manage it from your fleet page.`,
        })
      }
      await createNotification({
        userId: ownerUser.id,
        type: 'ADMIN_BROADCAST',
        title: 'Your listing is live',
        body: `${carName} has been approved and is now visible to clients.`,
        titleKey: 'listingLiveTitle',
        bodyKey: 'listingLiveBody',
        params: { car: carName },
        actionUrl: '/owner/fleet',
      })

      return NextResponse.json({ success: true, status: 'LIVE' })
    }

    // ── REJECT ─────────────────────────────────────────────────────────────
    if (action === 'reject') {
      await prisma.car.update({
        where: { id: car.id },
        data: { status: 'DRAFT', rejectionReason: parsed.data.reason },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'CAR_SUSPENDED',
        targetType: 'Car',
        targetId: car.id,
        targetUserId: ownerUser.id,
        reason: parsed.data.reason,
        description: `Rejected ${carName} — sent back to draft`,
      })

      await createNotification({
        userId: ownerUser.id,
        type: 'ADMIN_BROADCAST',
        title: 'Listing needs changes',
        body: `${carName} wasn't approved. ${parsed.data.reason}`,
        titleKey: 'listingNeedsChangesTitle',
        bodyKey: 'listingNeedsChangesBody',
        params: { car: carName, reason: parsed.data.reason },
        actionUrl: `/owner/fleet/${car.id}/edit`,
      })

      return NextResponse.json({ success: true, status: 'DRAFT' })
    }

    // ── SUSPEND ────────────────────────────────────────────────────────────
    if (action === 'suspend') {
      // Don't strand clients who already have a trip on this car.
      if (car._count.bookings > 0) {
        return NextResponse.json(
          {
            error: `This car has ${car._count.bookings} active or upcoming booking${
              car._count.bookings === 1 ? '' : 's'
            }. Cancel or complete those first, otherwise clients are left stranded.`,
          },
          { status: 409 },
        )
      }

      await prisma.car.update({
        where: { id: car.id },
        data: {
          status: 'SUSPENDED',
          isFeatured: false,
          rejectionReason: parsed.data.reason,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'CAR_SUSPENDED',
        targetType: 'Car',
        targetId: car.id,
        targetUserId: ownerUser.id,
        reason: parsed.data.reason,
        description: `Suspended ${carName} (${car.licensePlate})`,
      })

      if (ownerUser.phone) {
        await sendSms({
          to: ownerUser.phone,
          type: NotificationType.ADMIN_BROADCAST,
          userId: ownerUser.id,
          message: `ZuriDrive: Your ${carName} listing has been suspended. ${parsed.data.reason} Contact support if you'd like to discuss this.`,
        })
      }

      return NextResponse.json({ success: true, status: 'SUSPENDED' })
    }

    // ── REINSTATE ──────────────────────────────────────────────────────────
    if (action === 'reinstate') {
      await prisma.car.update({
        where: { id: car.id },
        data: { status: 'LIVE', rejectionReason: null },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'CAR_APPROVED',
        targetType: 'Car',
        targetId: car.id,
        targetUserId: ownerUser.id,
        description: `Reinstated ${carName} (${car.licensePlate})`,
      })

      await createNotification({
        userId: ownerUser.id,
        type: 'ADMIN_BROADCAST',
        title: 'Listing reinstated',
        body: `${carName} is live again.`,
        titleKey: 'listingReinstatedTitle',
        bodyKey: 'listingReinstatedBody',
        params: { car: carName },
        actionUrl: '/owner/fleet',
      })

      return NextResponse.json({ success: true, status: 'LIVE' })
    }

    // ── FEATURE / UNFEATURE ────────────────────────────────────────────────
    if (action === 'feature') {
      if (car.status !== 'LIVE') {
        return NextResponse.json(
          { error: 'Only a live car can be featured.' },
          { status: 409 },
        )
      }

      await prisma.car.update({
        where: { id: car.id },
        data: {
          isFeatured: true,
          featuredUntil: parsed.data.featuredUntil
            ? new Date(parsed.data.featuredUntil)
            : null,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'CAR_FEATURED',
        targetType: 'Car',
        targetId: car.id,
        targetUserId: ownerUser.id,
        description: `Featured ${carName}`,
      })

      return NextResponse.json({ success: true, isFeatured: true })
    }

    await prisma.car.update({
      where: { id: car.id },
      data: { isFeatured: false, featuredUntil: null },
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'CAR_UNFEATURED',
      targetType: 'Car',
      targetId: car.id,
      targetUserId: ownerUser.id,
      description: `Unfeatured ${carName}`,
    })

    return NextResponse.json({ success: true, isFeatured: false })
  } catch (error) {
    console.error('[POST /api/admin/cars/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
