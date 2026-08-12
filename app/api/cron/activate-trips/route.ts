/**
 * app/api/cron/activate-trips/route.ts
 *
 * GET /api/cron/activate-trips
 * Runs every hour via Vercel Cron.
 *
 * Moves CONFIRMED bookings to ACTIVE when the start date arrives.
 * Sends trip-starting-today SMS to both parties.
 * Also sends "trip starts tomorrow" reminder the day before.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/sms'

const CRON_SECRET = process.env.CRON_SECRET!

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const dayAfterTomorrow = new Date(tomorrow)
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1)

  let activated = 0
  let remindersSent = 0

  // ── 1. Activate trips whose start date has arrived ───────────────────────
  const toActivate = await db.booking.findMany({
    where: {
      status: 'CONFIRMED',
      startDate: { lte: now },
    },
    include: {
      client: { select: { phone: true, name: true } },
      car: {
        include: {
          owner: { include: { user: { select: { phone: true } } } },
        },
      },
    },
  })

  for (const booking of toActivate) {
    await db.booking.update({
      where: { id: booking.id },
      data: { status: 'ACTIVE', tripStartedAt: now },
    })

    const carName = `${booking.car.make} ${booking.car.model}`

    if (booking.client.phone) {
      await sendSms({
        to: booking.client.phone,
        message: `ZuriDrive: Your trip with ${carName} is now active! (${booking.reference}). Remember to take pre-trip condition photos before driving. Have a great trip!`,
      })
    }

    if (booking.car.owner.user.phone) {
      await sendSms({
        to: booking.car.owner.user.phone,
        message: `ZuriDrive: Booking ${booking.reference} for ${carName} is now active. The client's trip has started.`,
      })
    }

    activated++
  }

  // ── 2. Send "trip starts tomorrow" reminders ─────────────────────────────
  const tomorrowTrips = await db.booking.findMany({
    where: {
      status: 'CONFIRMED',
      startDate: { gte: tomorrow, lt: dayAfterTomorrow },
      reminderSmsSentAt: null,
    },
    include: {
      client: { select: { phone: true, name: true } },
      car: {
        include: {
          owner: { include: { user: { select: { phone: true } } } },
        },
      },
      location: {
        include: { platformLocation: true, ownerLocation: true },
      },
    },
  })

  for (const booking of tomorrowTrips) {
    const carName = `${booking.car.make} ${booking.car.model}`
    const pickup =
      booking.location?.platformLocation?.name ??
      booking.location?.ownerLocation?.name ??
      booking.location?.customDescription ??
      'your agreed location'

    if (booking.client.phone) {
      await sendSms({
        to: booking.client.phone,
        message: `ZuriDrive: Reminder — your ${carName} trip starts tomorrow! Pickup: ${pickup}. Ref: ${booking.reference}. Don't forget to take condition photos at pickup.`,
      })
    }

    if (booking.car.owner.user.phone) {
      await sendSms({
        to: booking.car.owner.user.phone,
        message: `ZuriDrive: Reminder — your ${carName} is being picked up tomorrow. Booking: ${booking.reference}. Client: ${booking.client.name}.`,
      })
    }

    await db.booking.update({
      where: { id: booking.id },
      data: { reminderSmsSentAt: now },
    })

    remindersSent++
  }

  console.log(`[cron/activate-trips] Activated: ${activated}, Reminders: ${remindersSent}`)

  return NextResponse.json({
    ok: true,
    activated,
    remindersSent,
    timestamp: now.toISOString(),
  })
}
