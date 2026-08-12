/**
 * app/api/cron/auto-confirm/route.ts
 *
 * GET /api/cron/auto-confirm
 * Called by Vercel Cron every 15 minutes.
 *
 * Auto-confirms bookings that have been in AWAITING_OWNER_CONFIRMATION
 * for more than 2 hours with no owner response.
 *
 * Also handles: auto-complete trips that are past end date.
 *
 * Secured with CRON_SECRET header — never callable by users.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSms, SMS_TEMPLATES } from '@/lib/sms'
import { setRetentionOnCompletion } from '@/lib/photos/retention'

const CRON_SECRET = process.env.CRON_SECRET!
const AUTO_CONFIRM_HOURS = 2

export async function GET(req: NextRequest) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const autoConfirmCutoff = new Date(now.getTime() - AUTO_CONFIRM_HOURS * 60 * 60 * 1000)

  let autoConfirmed = 0
  let autoCompleted = 0

  // ── 1. Auto-confirm bookings waiting too long ────────────────────────────
  const pendingBookings = await db.booking.findMany({
    where: {
      status: 'AWAITING_OWNER_CONFIRMATION',
      paymentConfirmedAt: { lte: autoConfirmCutoff },
    },
    include: {
      car: {
        include: {
          owner: { include: { user: { select: { phone: true, name: true } } } },
        },
      },
      client: { select: { phone: true, name: true } },
    },
  })

  for (const booking of pendingBookings) {
    await db.booking.update({
      where: { id: booking.id },
      data: {
        status: 'CONFIRMED',
        ownerConfirmedAt: now,
        autoConfirmedAt: now,
      },
    })

    const carName = `${booking.car.make} ${booking.car.model}`

    // Notify client
    if (booking.client.phone) {
      await sendSms({
        to: booking.client.phone,
        message: SMS_TEMPLATES.bookingAutoConfirmed({
          clientName: booking.client.name ?? 'there',
          bookingRef: booking.reference,
          carName,
          startDate: booking.startDate.toLocaleDateString('en-RW'),
        }),
      })
    }

    // Notify owner (they missed the window)
    if (booking.car.owner.user.phone) {
      await sendSms({
        to: booking.car.owner.user.phone,
        message: `ZuriDrive: Booking ${booking.reference} for your ${carName} was auto-confirmed because you didn't respond within 2 hours. Please check your dashboard.`,
      })
    }

    autoConfirmed++
  }

  // ── 2. Auto-complete trips past their end date ───────────────────────────
  // (Only if return hasn't been confirmed by either party yet)
  const overdueTrips = await db.booking.findMany({
    where: {
      status: 'ACTIVE',
      endDate: { lte: now },
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

  for (const booking of overdueTrips) {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'COMPLETED', tripEndedAt: now, autoCompletedAt: now },
      })

      // Auto-release deposit
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
            reason: 'Trip end date passed — deposit auto-released.',
            actorId: 'SYSTEM',
          },
        })
      }
    })

    await setRetentionOnCompletion(booking.id)

    autoCompleted++
  }

  console.log(`[cron/auto-confirm] Confirmed: ${autoConfirmed}, Completed: ${autoCompleted}`)

  return NextResponse.json({
    ok: true,
    autoConfirmed,
    autoCompleted,
    timestamp: now.toISOString(),
  })
}
