/**
 * app/api/cron/auto-complete/route.ts
 *
 * GET /api/cron/auto-complete
 * Runs every hour via Vercel Cron.
 *
 * Handles:
 * 1. Auto-complete ACTIVE bookings where ONE party confirmed return
 *    but the other has not responded in 48 hours.
 * 2. Release deposits for auto-completed bookings.
 * 3. SMS both parties 24 hours before condition photos are deleted.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/sms'
import { formatRWF } from '@/lib/currency'
import { setRetentionOnCompletion } from '@/lib/photos/retention'
import { getPlatformSettings } from '@/lib/platform-settings'

const CRON_SECRET = process.env.CRON_SECRET!

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let autoCompleted = 0
  let photoWarningsSent = 0

  // ── 1. Auto-complete one-sided confirmations after 48 hours ──────────────
  const { autoCompleteHours } = await getPlatformSettings()
  const cutoff = new Date(now.getTime() - autoCompleteHours * 60 * 60 * 1000)

  const oneSidedBookings = await db.booking.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        // Client confirmed but owner hasn't — and it's been 48hrs
        {
          clientConfirmedReturn: true,
          ownerConfirmedReturn: false,
          clientReturnConfirmedAt: { lte: cutoff },
        },
        // Owner confirmed but client hasn't — and it's been 48hrs
        {
          ownerConfirmedReturn: true,
          clientConfirmedReturn: false,
          ownerReturnConfirmedAt: { lte: cutoff },
        },
      ],
    },
    include: {
      deposit: true,
      client: { select: { phone: true, name: true } },
      car: {
        include: {
          owner: { include: { user: { select: { phone: true } } } },
        },
      },
    },
  })

  for (const booking of oneSidedBookings) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'COMPLETED',
          tripEndedAt: now,
          autoCompletedAt: now,
        },
      })

      // Release deposit
      if (booking.deposit && booking.deposit.status === 'HELD') {
        await tx.deposit.update({
          where: { id: booking.deposit.id },
          data: {
            status: 'RELEASED',
            releasedAt: now,
            releaseTriggeredBy: 'AUTO_48H',
            clientRefundAmount: booking.deposit.amount,
            ownerAwardAmount: 0,
          },
        })

        await tx.depositMovement.create({
          data: {
            depositId: booking.deposit.id,
            fromStatus: booking.deposit.status,
            toStatus: 'RELEASED',
            amount: booking.deposit.amount,
            reason: 'Auto-released after 48-hour confirmation window expired.',
            actorId: 'SYSTEM',
          },
        })
      }

      // Prompt client review
      await tx.notification.create({
        data: {
          userId: booking.clientId,
          type: 'REVIEW_REMINDER',
          channel: 'IN_APP',
          title: 'How was your trip?',
          body: `Your trip with ${booking.car.make} ${booking.car.model} is complete. Leave a review!`,
          titleKey: 'reviewReminderTitle',
          bodyKey: 'reviewReminderBody',
          params: { car: `${booking.car.make} ${booking.car.model}` },
          actionUrl: `/dashboard/bookings/${booking.id}/review`,
          metadata: { bookingId: booking.id },
        },
      })
    })

    // Photos become deletable 3 days after completion.
    await setRetentionOnCompletion(booking.id)

    const carName = `${booking.car.make} ${booking.car.model}`
    const depositAmount = booking.deposit?.amount ?? 0

    if (booking.client.phone) {
      await sendSms({
        to: booking.client.phone,
        messageKey: depositAmount > 0
          ? 'autoCompleteClientDeposit'
          : 'autoCompleteClient',
        params: {
          car: carName,
          reference: booking.reference,
          amount: formatRWF(depositAmount),
        },
      })
    }
    if (booking.car.owner.user.phone) {
      await sendSms({
        to: booking.car.owner.user.phone,
        messageKey: 'autoCompleteOwner',
        params: { reference: booking.reference, car: carName },
      })
    }

    autoCompleted++
  }

  // ── 2. Send 24-hour photo deletion warnings ──────────────────────────────
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000)

  // Find bookings whose photos are scheduled to delete in 24-48 hours.
  // Retention is tracked per photo (retainUntil), not on the booking.
  const photoDeletionBookings = await db.booking.findMany({
    where: {
      photoWarningSmsSentAt: null,  // Don't send twice
      conditionPhotos: {
        some: {
          isDeleted: false,
          isLocked: false,
          retainUntil: { gte: tomorrow, lte: dayAfterTomorrow },
        },
      },
    },
    include: {
      client: { select: { phone: true } },
      car: {
        include: {
          owner: { include: { user: { select: { phone: true } } } },
        },
      },
    },
  })

  for (const booking of photoDeletionBookings) {
    const carName = `${booking.car.make} ${booking.car.model}`
    const photoWarning = {
      messageKey: 'photosDeleting',
      params: { car: carName, reference: booking.reference },
    } as const

    if (booking.client.phone) {
      await sendSms({ to: booking.client.phone, ...photoWarning })
    }
    if (booking.car.owner.user.phone) {
      await sendSms({ to: booking.car.owner.user.phone, ...photoWarning })
    }

    await db.booking.update({
      where: { id: booking.id },
      data: { photoWarningSmsSentAt: now },
    })

    photoWarningsSent++
  }

  console.log(
    `[cron/auto-complete] Completed: ${autoCompleted}, Photo warnings: ${photoWarningsSent}`,
  )

  return NextResponse.json({
    ok: true,
    autoCompleted,
    photoWarningsSent,
    timestamp: now.toISOString(),
  })
}
