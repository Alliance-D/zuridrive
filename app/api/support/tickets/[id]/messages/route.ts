/**
 * app/api/support/tickets/[id]/messages/route.ts
 *
 * POST — add a message to a ticket. Used by both sides of the conversation.
 *
 * Two things happen on the first staff reply and nowhere else:
 *   • firstRespondedAt is stamped, which stops the response clock. It is set
 *     once and never overwritten — the target is about the FIRST reply, so a
 *     later message must not reset it and make a missed target look met.
 *   • The status flips to AWAITING_USER, so the queue stops showing it as
 *     waiting on us.
 *
 * A user replying to a resolved ticket reopens it. That is deliberate: making
 * someone open a second ticket to say "this didn't work" loses the history.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, hasAdminModule } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createNotification, notifyAdminsWithModule } from '@/lib/notifications'
import { uploadedFileUrls } from '@/lib/validation/urls'
import { z } from 'zod'

const MessageSchema = z.object({
  body: z.string().min(2).max(4000),
  attachments: uploadedFileUrls(5).default([]),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const parsed = MessageSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Please write a message before sending.' },
        { status: 400 },
      )
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        reference: true,
        subject: true,
        userId: true,
        status: true,
        firstRespondedAt: true,
        isPriority: true,
      },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    }

    const isOwnerOfTicket = ticket.userId === session.user.id
    const isStaff = await hasAdminModule('SUPPORT_AGENT')

    if (!isOwnerOfTicket && !isStaff) {
      return NextResponse.json(
        { error: 'You don’t have access to this ticket.' },
        { status: 403 },
      )
    }

    if (ticket.status === 'CLOSED') {
      return NextResponse.json(
        {
          error:
            'This ticket is closed. Please open a new one and we’ll pick it up from there.',
        },
        { status: 409 },
      )
    }

    // A staff member who also raised the ticket writes as themselves, not as
    // support — otherwise the clock could be stopped by the requester.
    const replyingAsStaff = isStaff && !isOwnerOfTicket

    await prisma.$transaction(async (tx) => {
      await tx.supportMessage.create({
        data: {
          ticketId: ticket.id,
          authorId: session.user.id,
          body: parsed.data.body,
          attachments: parsed.data.attachments,
          isStaff: replyingAsStaff,
        },
      })

      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: {
          status: replyingAsStaff ? 'AWAITING_USER' : 'OPEN',
          // Set once, never overwritten.
          firstRespondedAt:
            replyingAsStaff && ticket.firstRespondedAt === null
              ? new Date()
              : ticket.firstRespondedAt,
          // A reply to a resolved ticket reopens it.
          resolvedAt: null,
        },
      })
    })

    if (replyingAsStaff) {
      await createNotification({
        userId: ticket.userId,
        type: 'SUPPORT_TICKET_REPLY',
        title: `Support replied — ${ticket.reference}`,
        body: ticket.subject,
        titleKey: 'supportRepliedTitle',
        bodyKey: 'ticketSubjectBody',
        params: { reference: ticket.reference, subject: ticket.subject },
        actionUrl: `/owner/support/${ticket.id}`,
      })
    } else {
      await notifyAdminsWithModule('SUPPORT_AGENT', {
        type: 'SUPPORT_TICKET_REPLY',
        title: `${ticket.isPriority ? 'Priority reply' : 'Reply'} — ${ticket.reference}`,
        body: ticket.subject,
        titleKey: ticket.isPriority
          ? 'ticketPriorityReplyTitle'
          : 'ticketReplyTitle',
        bodyKey: 'ticketSubjectBody',
        params: { reference: ticket.reference, subject: ticket.subject },
        actionUrl: `/admin/support/${ticket.id}`,
        metadata: { ticketId: ticket.id },
      })
    }

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/support/tickets/[id]/messages]', error)
    return NextResponse.json(
      { error: 'We couldn’t send your message. Please try again.' },
      { status: 500 },
    )
  }
}
