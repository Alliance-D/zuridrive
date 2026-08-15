/**
 * lib/booking/pricing.ts
 * 
 * Server-side price calculation for ZuriDrive bookings.
 * Commission (20%) applies ONLY to base rental + driver surcharge.
 * Deposit and delivery fees are NEVER subject to commission.
 * All values are integers in RWF — no decimals ever.
 */

import { RentalType, TripScope } from '@prisma/client'
import { DEFAULT_COMMISSION_RATE_PERCENT } from '@/lib/platform-settings'

export interface PricingInput {
  rentalType: RentalType          // PER_DAY | PER_WEEK | PER_MONTH
  tripScope: TripScope | null     // IN_CITY | OUTSIDE_CITY — null for monthly
  startDate: Date
  endDate: Date
  withDriver: boolean
  deliveryFee: number             // 0 if no custom delivery
  /**
   * Platform commission as a percent integer. Defaults to the platform value.
   * Injectable so the Super Admin settings (step 13) can change it without
   * making this pure function async — it runs client-side for live previews.
   */
  commissionRatePercent?: number
  pricingMatrix: {
    perDayInCity: number
    perDayOutsideCity: number
    perWeekInCity: number
    perWeekOutsideCity: number
    perMonth: number
    driverSurchargePerDay: number
    depositAmount: number
    depositEnabled: boolean
  }
}

export interface PricingBreakdown {
  // Duration
  durationDays: number
  durationWeeks: number
  durationMonths: number

  // Rates applied
  /**
   * The parts of "3 days × RWF 25,000 (in-city)", not the sentence. The
   * sentence has to be built in the reader's language, and this function is
   * called from API routes and cron with no locale to hand.
   */
  baseRateDetail: {
    unit: 'DAY' | 'WEEK' | 'MONTH'
    count: number
    rate: number
    scope: 'IN_CITY' | 'OUTSIDE_CITY' | null
  }
  baseRate: number                // rate per unit
  baseAmount: number              // total base

  // Driver
  driverSurcharge: { count: number; rate: number } | null
  driverSurchargePerDay: number
  driverSurchargeTotal: number

  // Delivery
  deliveryFee: number

  // Subtotal (commissionable)
  commissionableSubtotal: number  // base + driver only

  // Commission
  commissionRate: number          // Percent, e.g. 20 — matches Commission.rate (Int)
  commissionAmount: number        // what platform takes

  // Deposit (completely separate, never commissionable)
  depositAmount: number
  depositEnabled: boolean

  // Totals
  subtotalBeforeDeposit: number   // base + driver + delivery
  totalChargedNow: number         // subtotal + deposit
  ownerEarnings: number           // 80% of commissionable subtotal
}

// Stored as a percent integer so it round-trips cleanly into Commission.rate
// and Booking.commissionRate, both of which are Int columns.
// The default lives in lib/platform-settings.ts.

/**
 * Calculate the number of days between two dates (inclusive of start day)
 */
export function calcDurationDays(start: Date, end: Date): number {
  const ms = end.getTime() - start.getTime()
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)))
}

/**
 * Main pricing calculator — pure function, no DB calls.
 * Called both client-side (preview) and server-side (booking creation).
 */
export function calculateBookingPrice(input: PricingInput): PricingBreakdown {
  const { rentalType, tripScope, startDate, endDate, withDriver, deliveryFee, pricingMatrix } = input
  const commissionRatePercent =
    input.commissionRatePercent ?? DEFAULT_COMMISSION_RATE_PERCENT

  const durationDays = calcDurationDays(startDate, endDate)
  const durationWeeks = Math.ceil(durationDays / 7)
  const durationMonths = Math.ceil(durationDays / 30)

  let baseRate = 0
  let baseAmount = 0
  let baseRateDetail: PricingBreakdown['baseRateDetail']

  // --- Determine base rate based on rental type and scope ---
  if (rentalType === 'PER_DAY') {
    baseRate = tripScope === 'OUTSIDE_CITY'
      ? pricingMatrix.perDayOutsideCity
      : pricingMatrix.perDayInCity
    baseAmount = baseRate * durationDays
    baseRateDetail = { unit: 'DAY', count: durationDays, rate: baseRate, scope: tripScope }
  } else if (rentalType === 'PER_WEEK') {
    baseRate = tripScope === 'OUTSIDE_CITY'
      ? pricingMatrix.perWeekOutsideCity
      : pricingMatrix.perWeekInCity
    baseAmount = baseRate * durationWeeks
    baseRateDetail = { unit: 'WEEK', count: durationWeeks, rate: baseRate, scope: tripScope }
  } else {
    // MONTH — flat rate, no city distinction, client goes anywhere
    baseRate = pricingMatrix.perMonth
    baseAmount = baseRate * durationMonths
    baseRateDetail = { unit: 'MONTH', count: durationMonths, rate: baseRate, scope: null }
  }

  // --- Driver surcharge (per day always, even on weekly/monthly bookings) ---
  const driverSurchargePerDay = pricingMatrix.driverSurchargePerDay
  const driverSurchargeTotal = withDriver ? driverSurchargePerDay * durationDays : 0
  const driverSurcharge = withDriver
    ? { count: durationDays, rate: driverSurchargePerDay }
    : null

  // --- Commissionable subtotal: base + driver ONLY ---
  const commissionableSubtotal = baseAmount + driverSurchargeTotal
  const commissionAmount = Math.round(
    (commissionableSubtotal * commissionRatePercent) / 100,
  )
  const ownerEarnings = commissionableSubtotal - commissionAmount

  // --- Deposit (separate, never commissionable) ---
  const depositAmount = pricingMatrix.depositEnabled ? pricingMatrix.depositAmount : 0

  // --- Final totals ---
  const subtotalBeforeDeposit = baseAmount + driverSurchargeTotal + deliveryFee
  const totalChargedNow = subtotalBeforeDeposit + depositAmount

  return {
    durationDays,
    durationWeeks,
    durationMonths,
    baseRateDetail,
    baseRate,
    baseAmount,
    driverSurcharge,
    driverSurchargePerDay,
    driverSurchargeTotal,
    deliveryFee,
    commissionableSubtotal,
    commissionRate: commissionRatePercent,
    commissionAmount,
    depositAmount,
    depositEnabled: pricingMatrix.depositEnabled,
    subtotalBeforeDeposit,
    totalChargedNow,
    ownerEarnings,
  }
}
