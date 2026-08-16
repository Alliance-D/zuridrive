/**
 * lib/booking/availability.ts
 *
 * Checks whether a date range is available for a given car.
 * Considers: owner's AvailabilityBlock records + existing confirmed bookings.
 * Returns detailed conflict info so the UI can show helpful messages.
 */

import { db } from '@/lib/db'

/**
 * Booking states that actually occupy the car.
 *
 * Exported because search filters on the same thing. Two copies of this list
 * would drift, and the way it fails is that search offers a car the booking
 * endpoint then refuses - the visitor picks dates, gets a result, and is told
 * no at the last step.
 */
export const OCCUPYING_BOOKING_STATUSES = [
  'PAYMENT_CONFIRMED',
  'AWAITING_OWNER_CONFIRMATION',
  'CONFIRMED',
  'ACTIVE',
] as const

export interface AvailabilityCheckResult {
  available: boolean
  reason?: 'OWNER_BLOCKED' | 'BOOKING_CONFLICT' | 'BELOW_MINIMUM_DURATION'
  message?: string
}

/**
 * Check if a car is available for a given date range.
 * Called server-side before creating a booking.
 */
export async function checkCarAvailability(
  carId: string,
  startDate: Date,
  endDate: Date,
): Promise<AvailabilityCheckResult> {
  // 1. Check owner's minimum booking duration
  const car = await db.car.findUnique({
    where: { id: carId },
    // minBookingDays lives on Car — PricingMatrix has no such column.
    select: { minBookingDays: true },
  })

  if (car?.minBookingDays) {
    const requestedDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
    )
    if (requestedDays < car.minBookingDays) {
      return {
        available: false,
        reason: 'BELOW_MINIMUM_DURATION',
        message: `This car requires a minimum booking of ${car.minBookingDays} day${car.minBookingDays > 1 ? 's' : ''}.`,
      }
    }
  }

  // 2. Check owner's manual availability blocks
  const ownerBlock = await db.availabilityBlock.findFirst({
    where: {
      carId,
      // Overlap condition: block starts before end AND block ends after start
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  })

  if (ownerBlock) {
    return {
      available: false,
      reason: 'OWNER_BLOCKED',
      message: 'The owner has marked these dates as unavailable.',
    }
  }

  // 3. Check existing confirmed/active bookings for conflicts
  const conflictingBooking = await db.booking.findFirst({
    where: {
      carId,
      // Only statuses that actually occupy the car
      status: { in: [...OCCUPYING_BOOKING_STATUSES] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  })

  if (conflictingBooking) {
    return {
      available: false,
      reason: 'BOOKING_CONFLICT',
      message: 'These dates overlap with an existing booking. Please choose different dates.',
    }
  }

  return { available: true }
}

/**
 * Get all blocked date ranges for a car (for calendar UI rendering).
 * Returns owner blocks + booked ranges merged into a single array.
 */
export async function getBlockedDates(
  carId: string,
): Promise<Array<{ start: Date; end: Date; reason: 'OWNER_BLOCKED' | 'BOOKED' }>> {
  const [ownerBlocks, bookings] = await Promise.all([
    db.availabilityBlock.findMany({
      where: { carId },
      select: { startDate: true, endDate: true },
    }),
    db.booking.findMany({
      where: {
        carId,
        status: { in: [...OCCUPYING_BOOKING_STATUSES] },
      },
      select: { startDate: true, endDate: true },
    }),
  ])

  return [
    ...ownerBlocks.map((b) => ({ start: b.startDate, end: b.endDate, reason: 'OWNER_BLOCKED' as const })),
    ...bookings.map((b) => ({ start: b.startDate, end: b.endDate, reason: 'BOOKED' as const })),
  ]
}
