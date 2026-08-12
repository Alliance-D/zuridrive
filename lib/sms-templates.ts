/**
 * lib/sms-templates.ts
 *
 * All SMS message templates for ZuriDrive booking flow.
 * Keep messages concise — Africa's Talking charges per 160-char SMS.
 * Always include booking reference for easy support lookup.
 *
 * Extend the SMS_TEMPLATES object in lib/sms.ts to include these.
 */

export const BOOKING_SMS_TEMPLATES = {
  // ── Owner notifications ────────────────────────────────────────────────────

  newBookingRequest: ({
    ownerName,
    bookingRef,
    carName,
    startDate,
    endDate,
    totalAmount,
  }: {
    ownerName: string
    bookingRef: string
    carName: string
    startDate: string
    endDate: string
    totalAmount: string
  }) =>
    `ZuriDrive: Hi ${ownerName}, new booking request! ${carName} — ${startDate} to ${endDate}. Amount: ${totalAmount}. Ref: ${bookingRef}. Log in to accept or decline within 2 hours.`,

  // ── Client notifications ───────────────────────────────────────────────────

  paymentConfirmed: ({
    clientName,
    bookingRef,
    carName,
    totalPaid,
  }: {
    clientName: string
    bookingRef: string
    carName: string
    totalPaid: string
  }) =>
    `ZuriDrive: Payment confirmed! ${totalPaid} received for ${carName}. Ref: ${bookingRef}. Your owner will confirm within 2 hours. We'll SMS you.`,

  bookingConfirmedByOwner: ({
    clientName,
    bookingRef,
    carName,
    startDate,
    ownerName,
  }: {
    clientName: string
    bookingRef: string
    carName: string
    startDate: string
    ownerName: string
  }) =>
    `ZuriDrive: Great news ${clientName}! ${ownerName} confirmed your ${carName} booking. Pickup: ${startDate}. Ref: ${bookingRef}. See your dashboard for details.`,

  bookingRejectedByOwner: ({
    clientName,
    bookingRef,
    carName,
    reason,
  }: {
    clientName: string
    bookingRef: string
    carName: string
    reason: string
  }) =>
    `ZuriDrive: Sorry ${clientName}, your ${carName} booking (${bookingRef}) was declined. Reason: ${reason}. A full refund will be processed within 24-48 hours.`,

  bookingAutoConfirmed: ({
    clientName,
    bookingRef,
    carName,
    startDate,
  }: {
    clientName: string
    bookingRef: string
    carName: string
    startDate: string
  }) =>
    `ZuriDrive: Your ${carName} booking is confirmed! ${clientName}, pickup on ${startDate}. Ref: ${bookingRef}. Check your dashboard for owner contact details.`,

  tripStartingTomorrow: ({
    clientName,
    bookingRef,
    carName,
    pickupLocation,
  }: {
    clientName: string
    bookingRef: string
    carName: string
    pickupLocation: string
  }) =>
    `ZuriDrive: Reminder ${clientName} — your ${carName} trip starts tomorrow! Pickup: ${pickupLocation}. Ref: ${bookingRef}. Remember to take condition photos at pickup.`,

  // ── Guest account creation ─────────────────────────────────────────────────

  guestAccountCreated: ({
    name,
    phone,
    loginUrl,
  }: {
    name: string
    phone: string
    loginUrl: string
  }) =>
    `ZuriDrive: Hi ${name}! Your account has been created. Login with your phone number (${phone}) at: ${loginUrl} — no password needed, we'll send a verification code.`,

  // ── Deposit notifications ──────────────────────────────────────────────────

  depositReleased: ({
    clientName,
    amount,
    bookingRef,
  }: {
    clientName: string
    amount: string
    bookingRef: string
  }) =>
    `ZuriDrive: Your deposit of ${amount} for booking ${bookingRef} has been released. It will reflect in your account within 1-3 business days.`,

  depositWithheld: ({
    clientName,
    amount,
    bookingRef,
    reason,
  }: {
    clientName: string
    amount: string
    bookingRef: string
    reason: string
  }) =>
    `ZuriDrive: ${clientName}, a portion of your deposit (${amount}) for booking ${bookingRef} has been withheld. Reason: ${reason}. Contact support to dispute this.`,
}
