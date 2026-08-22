/**
 * app/api/bookings/[id]/note/route.ts
 *
 * PUT /api/bookings/[id]/note — the renter revises what they told the owner.
 *
 * Plans change. A flight moves, an arrival slips, somebody realises they will
 * need a child seat after all. The note is only useful if it can still be
 * corrected while it still matters, which is until the car is handed over.
 *
 * Only the renter writes it. The owner reads it, and replying is a different
 * thing — a conversation — which this deliberately is not.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasContactDetails } from '@/lib/contact-detection'
import { z } from 'zod'

const NoteSchema = z.object({
  note: z.string().max(500),
})

/** Once the car has changed hands, the note has done its job. */
const EDITABLE_FROM: string[] = [
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'AWAITING_OWNER_CONFIRMATION',
  'CONFIRMED',
]

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const parsed = NoteSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please keep your note under 500 characters.' },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      select: { id: true, clientId: true, status: true },
    })

    if (!booking || booking.clientId !== session.user.id) {
      // 404 rather than 403 for someone else's booking: confirming it exists
      // is itself a small leak.
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (!EDITABLE_FROM.includes(booking.status)) {
      return NextResponse.json(
        { error: 'The trip has started, so this note can no longer be changed.' },
        { status: 409 },
      )
    }

    const note = parsed.data.note.trim()

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        renterNote: note || null,
        renterNoteHasContact: note ? hasContactDetails(note) : false,
      },
      select: { renterNote: true },
    })

    return NextResponse.json({ note: updated.renterNote })
  } catch (error) {
    console.error('[PUT /api/bookings/[id]/note]', error)
    return NextResponse.json(
      { error: 'We couldn’t save your note. Please try again.' },
      { status: 500 },
    )
  }
}
