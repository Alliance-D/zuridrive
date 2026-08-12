/**
 * app/api/support/tickets/route.ts
 *
 * GET  — the signed-in user's own tickets.
 * POST — open a new ticket.
 *
 * Priority is decided here, once, and written onto the ticket. See lib/support
 * for why it is snapshotted rather than recomputed on read.
 *
 * A user can only ever see their own tickets through this route; the admin
 * queue is a separate surface with its own permission check.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyAdminsWithModule } from '@/lib/notifications'
import {
  resolvePriority,
  generateTicketReference,
  FIRST_RESPONSE_HOURS,
} from '@/lib/support'
import { uploadedFileUrls } from '@/lib/validation/urls'
import { z } from 'zod'

const CreateSchema = z.object({
  subject: z.string().min(5).max(150),
  category: z.enum([
    'PAYOUT',
    'BOOKING',
    'LISTING',
    'SUBSCRIPTION',
    'ACCOUNT',
    'OTHER',
  ]),
  message: z.string().min(20).max(4000),
  attachments: uploadedFileUrls(5).default([]),
  /** Optional — links the ticket to a specific trip. */
  bookingId: z.string().optional(),
})

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json({ tickets })
  } catch (error) {
    console.error('[GET /api/support/tickets]', error)
    return NextResponse.json(
      { error: 'We couldn’t load your tickets.' },
      { status: 500 },
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const parsed = CreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            'Please give your request a short subject and describe the problem in at least 20 characters.',
        },
        { status: 400 },
      )
    }

    const { subject, category, message, attachments, bookingId } = parsed.data

    // A booking can only be attached if this user is actually on it — the
    // ticket thread would otherwise leak someone else's trip reference.
    let linkedBookingId: string | null = null
    if (bookingId) {
      const booking = await prisma.booking.findFirst({
        where: {
          id: bookingId,
          OR: [
            { clientId: session.user.id },
            { car: { owner: { userId: session.user.id } } },
          ],
        },
        select: { id: true },
      })
      if (!booking) {
        return NextResponse.json(
          { error: 'That booking isn’t one of yours.' },
          { status: 403 },
        )
      }
      linkedBookingId = booking.id
    }

    const priority = await resolvePriority(session.user.id)
    const reference = await generateTicketReference()

    const ticket = await prisma.supportTicket.create({
      data: {
        reference,
        userId: session.user.id,
        subject,
        category,
        bookingId: linkedBookingId,
        isPriority: priority.isPriority,
        priorityPlanName: priority.planName,
        firstResponseDueAt: priority.firstResponseDueAt,
        messages: {
          create: {
            authorId: session.user.id,
            body: message,
            attachments,
            isStaff: false,
          },
        },
      },
    })

    await notifyAdminsWithModule('SUPPORT_AGENT', {
      type: 'SUPPORT_TICKET_REPLY',
      title: priority.isPriority
        ? `Priority ticket — ${ticket.reference}`
        : `New ticket — ${ticket.reference}`,
      body: subject,
      actionUrl: `/admin/support/${ticket.id}`,
      metadata: { ticketId: ticket.id, isPriority: priority.isPriority },
    })

    return NextResponse.json(
      {
        success: true,
        ticket: {
          id: ticket.id,
          reference: ticket.reference,
          isPriority: ticket.isPriority,
          firstResponseHours: priority.isPriority
            ? FIRST_RESPONSE_HOURS.priority
            : FIRST_RESPONSE_HOURS.standard,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/support/tickets]', error)
    return NextResponse.json(
      { error: 'We couldn’t open your ticket. Please try again.' },
      { status: 500 },
    )
  }
}
