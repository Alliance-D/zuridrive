/**
 * app/api/bookings/[id]/id-check/route.ts
 *
 * POST /api/bookings/[id]/id-check — the owner records the handover check.
 *
 * This is the other half of the renter's checkout attestation, and together
 * they replace storing identity documents entirely.
 *
 * The renter promised, at checkout, that they hold a valid licence and would
 * present it with their ID. Here the owner — standing in front of them, with
 * the documents in hand — records whether that turned out to be true.
 *
 * WHY THIS IS BETTER THAN AN UPLOADED SCAN
 * A photo of a licence proves somebody once had a licence. It does not prove
 * the person collecting the car is that somebody. A physical check by the
 * person handing over the keys does, and a timestamped record of it is
 * stronger evidence in a dispute than an image would have been — while holding
 * none of the breach liability that storing identity papers carries.
 *
 * Only the owner of the car can record this. Not the renter, obviously, and
 * not an admin — an admin was not there.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

const CheckSchema = z.discriminatedUnion('result', [
  z.object({ result: z.literal('MATCHED') }),
  z.object({
    result: z.literal('FAILED'),
    reason: z.string().min(10).max(500),
  }),
])

/** Statuses where a handover check makes sense. */
const CHECKABLE = ['CONFIRMED', 'ACTIVE'] as const

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Please sign in to continue.' },
        { status: 401 },
      )
    }

    const parsed = CheckSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            'Tell us whether the documents matched. If they did not, please say what was wrong.',
        },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        reference: true,
        status: true,
        clientId: true,
        idCheckedByOwnerAt: true,
        car: {
          select: {
            make: true,
            model: true,
            owner: { select: { userId: true } },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    // Only the owner. They are the one who was physically present.
    if (booking.car.owner.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the car owner can record the handover check.' },
        { status: 403 },
      )
    }

    if (!CHECKABLE.includes(booking.status as (typeof CHECKABLE)[number])) {
      return NextResponse.json(
        {
          error:
            'This booking is not at handover, so there is nothing to check yet.',
        },
        { status: 409 },
      )
    }

    if (booking.idCheckedByOwnerAt) {
      return NextResponse.json(
        { error: 'You have already recorded the check for this booking.' },
        { status: 409 },
      )
    }

    const now = new Date()

    if (parsed.data.result === 'MATCHED') {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { idCheckedByOwnerAt: now, idCheckFailedReason: null },
      })

      return NextResponse.json({ success: true, result: 'MATCHED' })
    }

    // FAILED — record it and tell the renter. We deliberately do NOT cancel
    // the booking automatically: the owner may still choose to go ahead, and
    // an automatic cancellation here would hand either party a way to end a
    // booking unilaterally with no evidence and no recourse.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        idCheckedByOwnerAt: now,
        idCheckFailedReason: parsed.data.reason,
      },
    })

    await createNotification({
      userId: booking.clientId,
      type: 'BOOKING_REJECTED',
      title: 'A problem with your documents at handover',
      titleKey: 'documentProblemTitle',
      bodyKey: 'cancelledWithReasonBody',
      params: {
        reference: booking.reference,
        reason: parsed.data.reason,
      },
      body: `${booking.reference} — ${parsed.data.reason}`,
      actionUrl: `/dashboard/bookings/${booking.id}`,
    })

    return NextResponse.json({ success: true, result: 'FAILED' })
  } catch (error) {
    console.error('[POST /api/bookings/[id]/id-check]', error)
    return NextResponse.json(
      { error: 'We couldn’t record that. Please try again.' },
      { status: 500 },
    )
  }
}
