/**
 * app/api/cron/trip-reminders/route.ts
 *
 * GET /api/cron/trip-reminders — runs each morning.
 *
 * Reminds both parties about a trip starting tomorrow, and folds the
 * condition-photo prompt into the same message.
 *
 * On cost. Every SMS is billed, so this deliberately sends one message per
 * person per booking and no more:
 *
 *   • One message, two jobs. "Your trip starts tomorrow" and "remember the
 *     photos" are the same conversation on the same day, so they are the same
 *     message rather than two.
 *   • Once per booking, ever. bookingReminderSmsSentAt is stamped when it goes
 *     out, so a re-run or a retry cannot bill twice for the same trip.
 *   • Both parties, because they have to meet: a reminder that reaches only
 *     the renter still leaves the owner not there.
 *
 * A no-show costs the owner a day's rental and the platform its commission,
 * which is worth many times the price of the two messages that prevent it.
 * Everything else that was missing from the notification list is in-app only,
 * where a row in the database costs nothing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { sendSms } from '@/lib/sms'
import { createNotification } from '@/lib/notifications'
import { NotificationType } from '@prisma/client'

const CRON_SECRET = process.env.CRON_SECRET!

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const tomorrowStart = new Date(now)
  tomorrowStart.setDate(tomorrowStart.getDate() + 1)
  tomorrowStart.setHours(0, 0, 0, 0)

  const tomorrowEnd = new Date(tomorrowStart)
  tomorrowEnd.setHours(23, 59, 59, 999)

  const starting = await db.booking.findMany({
    where: {
      // Only trips that are actually going ahead. A booking still waiting on
      // payment or on the owner is not something to promise anybody.
      status: 'CONFIRMED',
      startDate: { gte: tomorrowStart, lte: tomorrowEnd },
      bookingReminderSmsSentAt: null,
    },
    include: {
      client: { select: { id: true, name: true, phone: true } },
      car: {
        select: {
          make: true,
          model: true,
          owner: {
            select: { user: { select: { id: true, name: true, phone: true } } },
          },
        },
      },
    },
  })

  let messaged = 0

  for (const booking of starting) {
    const carName = `${booking.car.make} ${booking.car.model}`
    const ownerUser = booking.car.owner.user

    const params = {
      car: carName,
      reference: booking.reference,
      date: booking.startDate.toISOString(),
    }

    if (booking.client.phone) {
      await sendSms({
        to: booking.client.phone,
        userId: booking.client.id,
        messageKey: 'tripStartingTomorrowClient',
        params: { ...params, owner: ownerUser.name ?? '' },
      })
      messaged += 1
    }

    if (ownerUser.phone) {
      await sendSms({
        to: ownerUser.phone,
        userId: ownerUser.id,
        messageKey: 'tripStartingTomorrowOwner',
        params: { ...params, client: booking.client.name ?? '' },
      })
      messaged += 1
    }

    // The in-app copy costs nothing, so both parties get it regardless of
    // whether their phone number was on file.
    for (const userId of [booking.client.id, ownerUser.id]) {
      await createNotification({
        userId,
        type: NotificationType.TRIP_STARTING_TOMORROW,
        title: 'Your trip starts tomorrow',
        body: `${carName} — ${booking.reference}. Take condition photos at pickup.`,
        titleKey: 'tripStartingTomorrowTitle',
        bodyKey: 'tripStartingTomorrowBody',
        params: { car: carName, reference: booking.reference },
        actionUrl: `/dashboard/bookings/${booking.id}`,
      })
    }

    // Stamped after the sends, so a failure part-way leaves the booking
    // eligible tomorrow rather than silently skipped.
    await db.booking.update({
      where: { id: booking.id },
      data: { bookingReminderSmsSentAt: new Date() },
    })
  }

  return NextResponse.json({
    ok: true,
    tripsStartingTomorrow: starting.length,
    smsSent: messaged,
  })
}
