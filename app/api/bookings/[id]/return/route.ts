/**
 * app/api/bookings/[bookingId]/return/route.ts
 *
 * POST /api/bookings/[bookingId]/return
 *
 * Handles the return confirmation flow for ACTIVE bookings.
 * Either the owner OR the client can initiate return confirmation.
 *
 * Flow:
 *   1. First party clicks "Car Has Been Returned" → sets their confirmation flag
 *   2. Other party notified via SMS + in-app
 *   3. Both confirmed → COMPLETED → deposit auto-released
 *   4. If 48hrs pass with only one confirmation → auto-complete (handled by cron)
 *   5. Either party clicks "Report a Problem" → DISPUTED → admin notified
 *
 * Actions:
 *   "confirm_return"  — mark this party as having confirmed return
 *   "report_problem"  — open a dispute, halt deposit release
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/sms'
import { logAdminAction } from '@/lib/admin-logger'
import { createNotification } from '@/lib/notifications'
import { NotificationType } from '@prisma/client'
import { formatRWF } from '@/lib/currency'
import { setRetentionOnCompletion } from '@/lib/photos/retention'
import type { DisputeType } from '@prisma/client'
import { z } from 'zod'

const DISPUTE_CATEGORIES = [
  'DAMAGE',
  'FUEL_LEVEL',
  'MISSING_ITEMS',
  'LATE_RETURN',
  'OTHER',
] as const

/**
 * The UI offers more categories than the DisputeType enum carries, so the
 * extra ones fold into the closest DB value. The original wording is kept in
 * the dispute description.
 */
const DISPUTE_TYPE_BY_CATEGORY: Record<
  (typeof DISPUTE_CATEGORIES)[number],
  DisputeType
> = {
  DAMAGE: 'DAMAGE',
  FUEL_LEVEL: 'FUEL',
  MISSING_ITEMS: 'OTHER',
  LATE_RETURN: 'LATE_RETURN',
  OTHER: 'OTHER',
}

const ReturnSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('confirm_return'),
  }),
  z.object({
    action: z.literal('report_problem'),
    description: z.string().min(10).max(2000),
    category: z.enum(DISPUTE_CATEGORIES),
  }),
])

/** Thrown when a concurrent confirmation completed this trip first. */
class AlreadyCompletedError extends Error {
  constructor() {
    super('ALREADY_COMPLETED')
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = ReturnSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    // Load booking with all related data
    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: {
        deposit: true,
        client: { select: { id: true, phone: true, name: true } },
        car: {
          include: {
            owner: {
              include: {
                user: { select: { id: true, phone: true, name: true } },
              },
            },
          },
        },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    if (booking.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'This booking is not currently active.' },
        { status: 400 },
      )
    }

    // Determine which party is acting
    const isClient = booking.client.id === session.user.id
    const isOwner = booking.car.owner.user.id === session.user.id

    if (!isClient && !isOwner) {
      return NextResponse.json(
        { error: 'You do not have permission to manage this booking.' },
        { status: 403 },
      )
    }

    const carName = `${booking.car.make} ${booking.car.model}`
    const { action } = parsed.data

    // ── ACTION: confirm_return ──────────────────────────────────────────────
    if (action === 'confirm_return') {
      const alreadyConfirmedByClient = booking.clientConfirmedReturn
      const alreadyConfirmedByOwner = booking.ownerConfirmedReturn

      // Prevent double-confirmation
      if (isClient && alreadyConfirmedByClient) {
        return NextResponse.json(
          { error: 'You have already confirmed the return.' },
          { status: 400 },
        )
      }
      if (isOwner && alreadyConfirmedByOwner) {
        return NextResponse.json(
          { error: 'You have already confirmed the return.' },
          { status: 400 },
        )
      }

      // Check if this completes both confirmations
      const bothConfirmed =
        (isClient && alreadyConfirmedByOwner) ||
        (isOwner && alreadyConfirmedByClient)

      if (bothConfirmed) {
        // Both parties confirmed → COMPLETED + release deposit
        await db.$transaction(async (tx) => {
          // Claim the completion. The status was read before this transaction
          // opened, so two confirmations arriving together would both reach
          // here and both release the deposit. Matching on the status too
          // means only one can win.
          const claimed = await tx.booking.updateMany({
            where: { id: booking.id, status: { not: 'COMPLETED' } },
            data: {
              status: 'COMPLETED',
              tripEndedAt: new Date(),
              clientConfirmedReturn: true,
              ownerConfirmedReturn: true,
            },
          })

          // Somebody else completed it first: stop before touching the money.
          if (claimed.count === 0) {
            throw new AlreadyCompletedError()
          }

          // Auto-release deposit
          if (booking.deposit && booking.deposit.status === 'HELD') {
            await tx.deposit.update({
              where: { id: booking.deposit.id },
              data: {
                status: 'RELEASED',
                releasedAt: new Date(),
                releaseTriggeredBy: 'BOTH_CONFIRMED',
                clientRefundAmount: booking.deposit.amount,
              },
            })

            await tx.depositMovement.create({
              data: {
                depositId: booking.deposit.id,
                fromStatus: booking.deposit.status,
                toStatus: 'RELEASED',
                amount: booking.deposit.amount,
                reason: 'Successful return confirmed by both parties.',
                actorId: 'SYSTEM',
              },
            })
          }

          // Create notification prompting review
          await tx.notification.create({
            data: {
              userId: booking.client.id,
              type: 'REVIEW_REMINDER',
              channel: 'IN_APP',
              title: 'How was your trip?',
              body: `Your ${carName} trip is complete. Leave a review to help other renters.`,
              titleKey: 'reviewReminderTitle',
              bodyKey: 'reviewReminderBody',
              params: { car: carName },
              actionUrl: `/dashboard/bookings/${booking.id}/review`,
              metadata: { bookingId: booking.id },
            },
          })
        })

        // Condition photos become deletable 3 days after completion.
        await setRetentionOnCompletion(booking.id)

        // SMS both parties
        if (booking.client.phone) {
          await sendSms({
            to: booking.client.phone,
            messageKey: 'tripCompleteClient',
          params: {
            car: carName,
            reference: booking.reference,
            amount: formatRWF(booking.deposit?.amount ?? 0),
          },
          })
        }
        if (booking.car.owner.user.phone) {
          await sendSms({
            to: booking.car.owner.user.phone,
            messageKey: 'tripCompleteOwner',
          params: { car: carName, reference: booking.reference },
          })
        }

        // The SMS already went out; this is the in-app half. A row in the
        // database costs nothing, so there is no reason for the notification
        // centre to be missing an event the platform already texted about.
        for (const userId of [booking.client.id, booking.car.owner.user.id]) {
          await createNotification({
            userId,
            type: NotificationType.TRIP_COMPLETED,
            title: 'Trip completed',
            body: `${carName} — ${booking.reference}.`,
            titleKey: 'tripCompletedTitle',
            bodyKey: 'tripCompletedBody',
            params: { car: carName, reference: booking.reference },
            actionUrl: `/dashboard/bookings/${booking.id}`,
          })
        }

        return NextResponse.json({ success: true, status: 'COMPLETED', depositReleased: true })
      } else {
        // Only one party confirmed — update flag and notify the other
        const updateData = isClient
          ? { clientConfirmedReturn: true, clientReturnConfirmedAt: new Date() }
          : { ownerConfirmedReturn: true, ownerReturnConfirmedAt: new Date() }

        await db.booking.update({ where: { id: booking.id }, data: updateData })

        // Notify the OTHER party to confirm
        const otherPhone = isClient
          ? booking.car.owner.user.phone
          : booking.client.phone
        const otherName = isClient
          ? booking.car.owner.user.name
          : booking.client.name
        const actorRole = isClient ? 'client' : 'owner'

        if (otherPhone) {
          await sendSms({
            to: otherPhone,
            messageKey: 'returnConfirmedByOther',
          params: {
            role: actorRole,
            car: carName,
            reference: booking.reference,
          },
          })
        }

        // In-app notification for the other party
        const notifyUserId = isClient
          ? booking.car.owner.user.id
          : booking.client.id

        await db.notification.create({
          data: {
            userId: notifyUserId,
            type: 'RETURN_CONFIRMED',
            channel: 'IN_APP',
            title: 'Please confirm car return',
            body: `The ${actorRole} has confirmed return of ${carName}. Your confirmation is needed to release the deposit.`,
            titleKey: 'confirmReturnTitle',
            bodyKey: 'confirmReturnBody',
            params: { role: actorRole, car: carName },
            actionUrl: `/dashboard/bookings/${booking.id}`,
            metadata: { bookingId: booking.id },
          },
        })

        return NextResponse.json({
          success: true,
          status: 'AWAITING_OTHER_CONFIRMATION',
          message: `Return confirmed. Waiting for the ${isClient ? 'owner' : 'client'} to confirm.`,
        })
      }
    }

    // ── ACTION: report_problem ──────────────────────────────────────────────
    if (action === 'report_problem') {
      const { description, category } = parsed.data

      await db.$transaction(async (tx) => {
        // Move booking to DISPUTED — halts deposit auto-release
        await tx.booking.update({
          where: { id: booking.id },
          data: { status: 'DISPUTED' },
        })

        // Create dispute record. The UI offers finer-grained categories than
        // the DisputeType enum, so map them here.
        await tx.dispute.create({
          data: {
            bookingId: booking.id,
            raisedById: session.user.id,
            type: DISPUTE_TYPE_BY_CATEGORY[category],
            description: `[${isClient ? 'CLIENT' : 'OWNER'}] ${description}`,
            status: 'OPEN',
          },
        })

        // Lock condition photos — retained indefinitely until admin unlocks
        await tx.bookingConditionPhoto.updateMany({
          where: { bookingId: booking.id },
          data: {
            retainUntil: null,   // null = retained indefinitely until admin sets a date
            isLocked: true,
          },
        })

        // Notify every admin — Notification.userId is required, so this fans
        // out one row per admin rather than a single null-user broadcast.
        const admins = await tx.user.findMany({
          where: { role: { in: ['SUPER_ADMIN', 'SUB_ADMIN'] }, isSuspended: false },
          select: { id: true },
        })

        if (admins.length > 0) {
          await tx.notification.createMany({
            data: admins.map((admin) => ({
              userId: admin.id,
              type: 'DISPUTE_OPENED' as const,
              channel: 'IN_APP' as const,
              title: `Dispute opened on booking ${booking.reference}`,
              body: `${isClient ? 'Client' : 'Owner'} reported: ${category} — ${description.slice(0, 100)}`,
              titleKey: 'disputeOpenedAdminTitle',
              bodyKey: 'disputeOpenedAdminBody',
              params: {
                reference: booking.reference,
                role: isClient ? 'client' : 'owner',
                category,
                description: description.slice(0, 100),
              },
              actionUrl: `/admin/disputes`,
            })),
          })
        }
      })

      // SMS both parties
      if (booking.client.phone) {
        await sendSms({
          to: booking.client.phone,
          messageKey: 'disputeOpenedClient',
          params: { reference: booking.reference, car: carName },
        })
      }
      if (booking.car.owner.user.phone) {
        await sendSms({
          to: booking.car.owner.user.phone,
          messageKey: 'disputeOpenedOwner',
          params: { reference: booking.reference, car: carName },
        })
      }

      return NextResponse.json({
        success: true,
        status: 'DISPUTED',
        message: 'Your report has been submitted. Our team will review within 24 hours.',
      })
    }
  } catch (error) {
    if (error instanceof AlreadyCompletedError) {
      return NextResponse.json(
        { error: 'This trip has already been completed.' },
        { status: 409 },
      )
    }

    console.error('[POST /api/bookings/[bookingId]/return]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}

/**
 * GET /api/bookings/[bookingId]/return
 * Returns current return confirmation status for both parties.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const booking = await db.booking.findUnique({
      where: { id: params.id },
      select: {
        status: true,
        clientConfirmedReturn: true,
        ownerConfirmedReturn: true,
        clientReturnConfirmedAt: true,
        ownerReturnConfirmedAt: true,
        deposit: { select: { status: true, amount: true } },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    return NextResponse.json(booking)
  } catch {
    return NextResponse.json({ error: 'Could not load return status.' }, { status: 500 })
  }
}
