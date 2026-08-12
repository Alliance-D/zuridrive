/**
 * lib/booking/status.ts
 *
 * Centralised booking status state machine.
 * Defines all valid transitions and guards against invalid ones.
 * Used by API routes before any status update to prevent illegal transitions.
 *
 * Booking statuses (from spec):
 * PENDING_PAYMENT → PAYMENT_CONFIRMED → AWAITING_OWNER_CONFIRMATION
 *   → CONFIRMED → ACTIVE → COMPLETED
 *                        → DISPUTED
 *                → CANCELLED (from any pre-ACTIVE status)
 */

export type BookingStatus =
  | 'PENDING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'AWAITING_OWNER_CONFIRMATION'
  | 'CONFIRMED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED'

// Valid transitions: from → allowed next statuses
const VALID_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT:              ['PAYMENT_CONFIRMED', 'CANCELLED'],
  PAYMENT_CONFIRMED:            ['AWAITING_OWNER_CONFIRMATION', 'CANCELLED'],
  AWAITING_OWNER_CONFIRMATION:  ['CONFIRMED', 'CANCELLED'],
  CONFIRMED:                    ['ACTIVE', 'CANCELLED'],
  ACTIVE:                       ['COMPLETED', 'DISPUTED', 'CANCELLED'],
  COMPLETED:                    [],  // terminal — no further transitions
  CANCELLED:                    [],  // terminal
  DISPUTED:                     ['COMPLETED', 'CANCELLED'],  // admin resolves
}

/**
 * Check whether a status transition is valid.
 */
export function isValidTransition(from: BookingStatus, to: BookingStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Assert a transition is valid — throws a descriptive error if not.
 * Use this before any db.booking.update() call that changes status.
 */
export function assertValidTransition(from: BookingStatus, to: BookingStatus): void {
  if (!isValidTransition(from, to)) {
    throw new Error(
      `Invalid booking status transition: ${from} → ${to}. ` +
      `Allowed from ${from}: ${VALID_TRANSITIONS[from]?.join(', ') || 'none (terminal status)'}`,
    )
  }
}

/**
 * Human-readable status labels for UI display.
 */
export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_PAYMENT:              'Pending Payment',
  PAYMENT_CONFIRMED:            'Payment Confirmed',
  AWAITING_OWNER_CONFIRMATION:  'Awaiting Owner Confirmation',
  CONFIRMED:                    'Confirmed',
  ACTIVE:                       'Active',
  COMPLETED:                    'Completed',
  CANCELLED:                    'Cancelled',
  DISPUTED:                     'Under Review',
}

/**
 * Returns true if the booking is in a "live" state — not yet done.
 */
export function isLiveBooking(status: BookingStatus): boolean {
  return !['COMPLETED', 'CANCELLED'].includes(status)
}

/**
 * Returns true if a booking can have a payout requested.
 * Only COMPLETED bookings not in DISPUTED state.
 */
export function isPayoutEligible(status: BookingStatus): boolean {
  return status === 'COMPLETED'
}
