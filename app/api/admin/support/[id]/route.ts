/**
 * app/api/admin/support/[id]/route.ts
 *
 * PATCH — a support agent changes a ticket's state.
 *
 * Resolving does NOT stop the response clock. If a ticket was answered late,
 * closing it later must not make the record look on time — firstRespondedAt is
 * the only thing that stops the clock, and only a reply sets it.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, hasAdminModule } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/admin-logger'
import { createNotification } from '@/lib/notifications'
import { z } from 'zod'

const PatchSchema = z.object({
  action: z.enum(['ASSIGN_TO_ME', 'RESOLVE', 'CLOSE', 'REOPEN']),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    if (!(await hasAdminModule('SUPPORT_AGENT'))) {
      return NextResponse.json(
        { error: 'You don’t have the Support Agent role.' },
        { status: 403 },
      )
    }

    const parsed = PatchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
    }

    const ticket = await prisma.supportTicket.findUnique({
      where: { id: params.id },
      select: { id: true, reference: true, subject: true, userId: true },
    })

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 })
    }

    const now = new Date()

    const data =
      parsed.data.action === 'ASSIGN_TO_ME'
        ? { assignedToId: session.user.id }
        : parsed.data.action === 'RESOLVE'
          ? { status: 'RESOLVED' as const, resolvedAt: now }
          : parsed.data.action === 'CLOSE'
            ? { status: 'CLOSED' as const, closedAt: now }
            : { status: 'OPEN' as const, resolvedAt: null, closedAt: null }

    await prisma.supportTicket.update({ where: { id: ticket.id }, data })

    await logAdminAction({
      actorId: session.user.id,
      action: 'SUPPORT_TICKET_UPDATED',
      targetType: 'SupportTicket',
      targetId: ticket.id,
      targetUserId: ticket.userId,
      description: `${parsed.data.action.replace(/_/g, ' ').toLowerCase()} — ${ticket.reference}`,
    })

    // Tell the person waiting. An assignment is internal, so it stays quiet.
    if (parsed.data.action === 'RESOLVE') {
      await createNotification({
        userId: ticket.userId,
        type: 'SUPPORT_TICKET_REPLY',
        title: `Marked resolved — ${ticket.reference}`,
        body: `${ticket.subject} — reply on the ticket if it isn’t sorted.`,
        titleKey: 'ticketResolvedTitle',
        bodyKey: 'ticketResolvedBody',
        params: { reference: ticket.reference, subject: ticket.subject },
        actionUrl: `/owner/support/${ticket.id}`,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/admin/support/[id]]', error)
    return NextResponse.json(
      { error: 'We couldn’t update this ticket.' },
      { status: 500 },
    )
  }
}
