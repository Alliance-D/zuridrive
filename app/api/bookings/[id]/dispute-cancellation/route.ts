/**
 * app/api/bookings/[id]/dispute-cancellation/route.ts
 *
 * POST /api/bookings/[id]/dispute-cancellation
 *
 * A client who was charged a late-cancellation fee can challenge it with a
 * reason and supporting proof (a photo or document already uploaded via
 * /api/upload).
 *
 * This opens a normal Dispute, so it lands in the existing admin queue and is
 * resolved through the existing flow. An admin who finds for the client picks
 * RESOLVED_FOR_CLIENT, which returns the whole deposit — including the fee —
 * and keeps the ledgers balanced, because that path is already correct.
 *
 * Only the client can raise this, only on a cancelled booking, only where a
 * fee was actually taken, and only once.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyAdminsWithModule } from '@/lib/notifications'
import { formatRWF } from '@/lib/currency'
import { uploadedFileUrls } from '@/lib/validation/urls'
import { z } from 'zod'

const DisputeSchema = z.object({
  reason: z.string().min(20).max(2000),
  /** Cloudinary URLs from /api/upload. Optional but strongly encouraged. */
  proofUrls: uploadedFileUrls(5).default([]),
})

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

    const parsed = DisputeSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            'Please explain why the fee is unfair in at least 20 characters. Attaching proof makes your case much stronger.',
        },
        { status: 400 },
      )
    }

    const booking = await prisma.booking.findUnique({
      where: { id: params.id },
      include: {
        deposit: true,
        dispute: { select: { id: true } },
        car: { select: { make: true, model: true } },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (booking.clientId !== session.user.id) {
      return NextResponse.json(
        { error: 'Only the client on this booking can dispute the fee.' },
        { status: 403 },
      )
    }

    if (booking.status !== 'CANCELLED') {
      return NextResponse.json(
        { error: 'This booking wasn’t cancelled, so there is no fee to dispute.' },
        { status: 409 },
      )
    }

    const feeCharged = booking.deposit?.ownerAwardAmount ?? 0
    if (feeCharged <= 0) {
      return NextResponse.json(
        {
          error:
            'No cancellation fee was taken on this booking — your refund was already in full.',
        },
        { status: 409 },
      )
    }

    if (booking.dispute) {
      return NextResponse.json(
        { error: 'You’ve already raised a dispute on this booking.' },
        { status: 409 },
      )
    }

    // Proof URLs go into the description so they survive with the dispute
    // record. BookingConditionPhoto is tied to trip phases, which don't apply
    // to a booking that never started.
    const proofBlock =
      parsed.data.proofUrls.length > 0
        ? `\n\nProof supplied by the client:\n${parsed.data.proofUrls.join('\n')}`
        : '\n\n(No proof was attached.)'

    const dispute = await prisma.dispute.create({
      data: {
        bookingId: booking.id,
        raisedById: session.user.id,
        type: 'OTHER',
        status: 'OPEN',
        description:
          `[CANCELLATION FEE DISPUTE] The client is challenging a ` +
          `${formatRWF(feeCharged)} late-cancellation fee and is asking for a ` +
          `full refund.\n\nTheir reason:\n${parsed.data.reason}${proofBlock}`,
      },
    })

    // Move the booking back to DISPUTED so it shows in the open queue and the
    // deposit can't be quietly settled while this is unresolved.
    await prisma.booking.update({
      where: { id: booking.id },
      data: { status: 'DISPUTED' },
    })

    await notifyAdminsWithModule('DEPOSIT_MANAGER', {
      type: 'DISPUTE_OPENED',
      title: 'Cancellation fee disputed',
      body: `A client is challenging a ${formatRWF(feeCharged)} fee on ${booking.reference}. Resolving for the client returns the full deposit.`,
      actionUrl: `/admin/disputes/${dispute.id}`,
      metadata: { bookingId: booking.id, feeCharged },
    })

    return NextResponse.json(
      { success: true, disputeId: dispute.id, feeCharged },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/bookings/[id]/dispute-cancellation]', error)
    return NextResponse.json(
      { error: 'We couldn’t submit your dispute. Please try again.' },
      { status: 500 },
    )
  }
}
