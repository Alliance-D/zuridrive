/**
 * app/api/admin/users/[id]/route.ts
 *
 * POST /api/admin/users/[id] — User Manager actions.
 *
 *   suspend / unsuspend  — block or restore sign-in
 *   verify / unverify    — identity verification flag
 *   delete               — anonymise the account (see below)
 *
 * "Delete" never removes the row. A user is attached to bookings, payments,
 * commissions and audit entries; deleting them would tear holes in the
 * financial record. Instead the account is suspended and its personal details
 * are overwritten, which is what data-deletion actually requires while keeping
 * the ledger intact.
 *
 * Admin accounts are managed at /admin/team, not here — this endpoint refuses
 * to touch them so User Manager can't be used to escalate.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { NotificationType, type BookingStatus } from '@prisma/client'
import { z } from 'zod'

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend'), reason: z.string().min(10).max(500) }),
  z.object({ action: z.literal('unsuspend') }),
  z.object({ action: z.literal('verify') }),
  z.object({ action: z.literal('unverify') }),
  z.object({ action: z.literal('delete'), reason: z.string().min(10).max(500) }),
])

/** Bookings that must be settled before an account can be closed. */
// Not `as const` — Prisma's `in` filter needs a mutable array.
const OPEN_BOOKING_STATUSES: BookingStatus[] = [
  'PENDING_PAYMENT',
  'PAYMENT_CONFIRMED',
  'AWAITING_OWNER_CONFIRMATION',
  'CONFIRMED',
  'ACTIVE',
  'DISPUTED',
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

    const hasAccess = await requireModuleAccess(session.user.id, 'USER_MANAGER')
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    if (session.user.id === params.id) {
      return NextResponse.json(
        { error: 'You can’t action your own account.' },
        { status: 400 },
      )
    }

    const parsed = ActionSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request — a reason of at least 10 characters is required.' },
        { status: 400 },
      )
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        isSuspended: true,
        _count: {
          select: {
            bookingsAsClient: {
              where: { status: { in: OPEN_BOOKING_STATUSES } },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 })
    }

    // Admin accounts are managed at /admin/team by a Super Admin.
    if (user.role === 'SUPER_ADMIN' || user.role === 'SUB_ADMIN') {
      return NextResponse.json(
        { error: 'Admin accounts are managed from the Team page.' },
        { status: 403 },
      )
    }

    const { action } = parsed.data
    const name = user.name ?? user.phone

    // ── SUSPEND ────────────────────────────────────────────────────────────
    if (action === 'suspend') {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedById: session.user.id,
        },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'USER_SUSPENDED',
        targetType: 'User',
        targetId: user.id,
        targetUserId: user.id,
        reason: parsed.data.reason,
        description: `Suspended ${name}`,
      })

      if (user.phone) {
        await sendSms({
          to: user.phone,
          type: NotificationType.ADMIN_BROADCAST,
          userId: user.id,
          message: `ZuriDrive: Your account has been suspended. ${parsed.data.reason} Contact support if you believe this is a mistake.`,
        })
      }

      return NextResponse.json({ success: true, isSuspended: true })
    }

    // ── UNSUSPEND ──────────────────────────────────────────────────────────
    if (action === 'unsuspend') {
      await prisma.user.update({
        where: { id: user.id },
        data: { isSuspended: false, suspendedAt: null, suspendedById: null },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'USER_UNSUSPENDED',
        targetType: 'User',
        targetId: user.id,
        targetUserId: user.id,
        description: `Reinstated ${name}`,
      })

      return NextResponse.json({ success: true, isSuspended: false })
    }

    // ── VERIFY / UNVERIFY ──────────────────────────────────────────────────
    if (action === 'verify' || action === 'unverify') {
      const isVerified = action === 'verify'

      await prisma.user.update({
        where: { id: user.id },
        data: { isVerified },
      })

      await logAdminAction({
        actorId: session.user.id,
        action: 'USER_ROLE_CHANGED',
        targetType: 'User',
        targetId: user.id,
        targetUserId: user.id,
        description: `${isVerified ? 'Verified' : 'Removed verification from'} ${name}`,
      })

      return NextResponse.json({ success: true, isVerified })
    }

    // ── DELETE (anonymise) ─────────────────────────────────────────────────
    if (user._count.bookingsAsClient > 0) {
      return NextResponse.json(
        {
          error: `This account has ${user._count.bookingsAsClient} unfinished booking${
            user._count.bookingsAsClient === 1 ? '' : 's'
          }. Settle those first — closing the account now would strand money.`,
        },
        { status: 409 },
      )
    }

    // Overwrite personal data, keep the row so financial records stay intact.
    // phone and email are unique, so they're replaced with scoped placeholders.
    const stamp = Date.now()
    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: 'Deleted user',
        phone: `deleted-${stamp}-${user.id.slice(0, 6)}`,
        email: null,
        profilePhoto: null,
        passwordHash: null,
        otpCode: null,
        otpExpiresAt: null,
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedById: session.user.id,
      },
    })

    await logAdminAction({
      actorId: session.user.id,
      action: 'USER_DELETED',
      targetType: 'User',
      targetId: user.id,
      targetUserId: user.id,
      reason: parsed.data.reason,
      description: `Deleted (anonymised) account for ${name}`,
      metadata: { originalPhone: user.phone },
    })

    return NextResponse.json({ success: true, deleted: true })
  } catch (error) {
    console.error('[POST /api/admin/users/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
