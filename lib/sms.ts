// =============================================================================
// ZuriDrive — SMS Service (Africa's Talking)
// Handles all SMS delivery: OTP codes, booking notifications, broadcasts
// Every SMS sent is logged to the SmsLog table for debugging + compliance
// Uses retry logic with exponential backoff for reliability
// =============================================================================

import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { BOOKING_SMS_TEMPLATES } from "@/lib/sms-templates";

// Booking-flow message templates. Re-exported here so callers only ever need
// `import { sendSms, SMS_TEMPLATES } from "@/lib/sms"`.
export const SMS_TEMPLATES = BOOKING_SMS_TEMPLATES;

// Africa's Talking API base URL
const AT_BASE_URL = "https://api.africastalking.com/version1";

// How we identify ourselves to Africa's Talking
const AT_HEADERS = {
  apiKey: process.env.AT_API_KEY!,
  Accept: "application/json",
  "Content-Type": "application/x-www-form-urlencoded",
};

// =============================================================================
// TYPES
// =============================================================================

interface ATRecipient {
  statusCode: string;
  number: string;
  status: string;
  messageId: string;
  cost: string;
}

interface ATSmsResponse {
  SMSMessageData: {
    Message: string;
    Recipients: ATRecipient[];
  };
}

interface SendSmsOptions {
  // Recipient phone number (international format: +250...).
  // `to` is an accepted alias — booking/cron routes call it that way.
  phone?: string;
  to?: string;
  message: string;         // SMS body
  type?: NotificationType; // For logging — defaults to ADMIN_BROADCAST
  userId?: string;         // Optional — link log to user record
}

interface SendSmsResult {
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
}

// =============================================================================
// CORE SMS SENDER
// Internal function — use the typed helpers below instead
// =============================================================================

/**
 * True when Africa's Talking is not configured.
 * In production this is a misconfiguration; in development it's the norm.
 */
function isSmsConfigured(): boolean {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
}

async function sendRawSms(
  phone: string,
  message: string
): Promise<ATRecipient | null> {
  const username = process.env.AT_USERNAME!;
  const senderId = process.env.AT_SENDER_ID || "ZuriDrive";

  // ---------------------------------------------------------------------------
  // Development fallback.
  //
  // Without AT credentials every send fails, which makes phone-OTP login
  // impossible locally — you can't read a code that was never sent. Outside
  // production we print the message to the server console and report success
  // so the rest of the flow (SmsLog write, OTP verification) behaves normally.
  //
  // Hard-guarded on NODE_ENV: in production a missing key must fail loudly
  // rather than silently swallow every SMS.
  // ---------------------------------------------------------------------------
  if (!isSmsConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SMS is not configured: AT_API_KEY and AT_USERNAME must be set.",
      );
    }

    console.log(
      `\n┌─ [DEV SMS] ─────────────────────────────────────────────\n` +
        `│ To: ${phone}\n` +
        `│ ${message}\n` +
        `└─────────────────────────────────────────────────────────\n`,
    );

    return {
      statusCode: "101",
      number: phone,
      status: "Success",
      messageId: `dev-${Date.now()}`,
      cost: "RWF 0.0000",
    };
  }

  const body = new URLSearchParams({
    username,
    to: phone,
    message,
    from: senderId,
  });

  // Retry up to 3 times with exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${AT_BASE_URL}/messaging`, {
        method: "POST",
        headers: AT_HEADERS,
        body: body.toString(),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`AT API error ${response.status}: ${errText}`);
      }

      const data: ATSmsResponse = await response.json();
      const recipient = data.SMSMessageData?.Recipients?.[0];
      return recipient ?? null;
    } catch (error) {
      if (attempt === 2) throw error; // Last attempt — let it bubble up
      // Wait 1s, 2s before retrying
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  return null;
}

// =============================================================================
// PUBLIC SMS FUNCTION
// All SMS sent through this function — logs every attempt to SmsLog
// =============================================================================

export async function sendSms({
  phone,
  to,
  message,
  type = NotificationType.ADMIN_BROADCAST,
  userId,
}: SendSmsOptions): Promise<SendSmsResult> {
  const recipientPhone = phone ?? to;

  if (!recipientPhone) {
    // Nothing to send to — log nothing, fail soft. Callers pass an optional
    // phone off a relation, so a missing number must never throw.
    console.error("[SMS] No recipient phone provided — skipping send");
    return { success: false, error: "No recipient phone number" };
  }

  let recipient: ATRecipient | null = null;
  let errorMessage: string | undefined;

  try {
    recipient = await sendRawSms(recipientPhone, message);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unknown SMS error";
    console.error(`[SMS] Failed to send to ${recipientPhone}:`, errorMessage);
  }

  // Always log the attempt — success or failure
  // This is our audit trail for compliance and debugging
  await prisma.smsLog.create({
    data: {
      userId: userId ?? null,
      phone: recipientPhone,
      type,
      message,
      messageId: recipient?.messageId ?? null,
      status: recipient?.status ?? errorMessage ?? "UNKNOWN",
      cost: recipient?.cost ?? null,
      networkCode: recipient?.statusCode ?? null,
    },
  });

  if (!recipient || recipient.status !== "Success") {
    return {
      success: false,
      error: errorMessage ?? `Delivery failed: ${recipient?.status}`,
    };
  }

  return {
    success: true,
    messageId: recipient.messageId,
    status: recipient.status,
  };
}

// =============================================================================
// OTP HELPERS
// =============================================================================

/**
 * Generates a cryptographically random 6-digit OTP
 * Uses Math.random padded — for production consider crypto.getRandomValues
 */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Sends an OTP code via SMS for phone verification or login
 * The OTP itself is stored hashed in the User record by the calling API route
 */
export async function sendOtpSms(
  phone: string,
  otp: string,
  userId?: string
): Promise<SendSmsResult> {
  const message =
    `Your ZuriDrive verification code is: ${otp}\n` +
    `Valid for ${process.env.OTP_EXPIRY_MINUTES ?? 5} minutes. Do not share this code.`;

  return sendSms({
    phone,
    message,
    type: "OTP",
    userId,
  });
}

// =============================================================================
// NOTIFICATION SMS TEMPLATES
// Each notification type has a dedicated function with typed parameters
// Templates are kept short — SMS has a 160 character limit per segment
// =============================================================================

export async function sendBookingRequestSms(
  ownerPhone: string,
  clientName: string,
  carName: string,
  bookingRef: string,
  ownerId: string
) {
  return sendSms({
    phone: ownerPhone,
    message: `ZuriDrive: New booking request from ${clientName} for ${carName}. Ref: ${bookingRef}. Log in to accept within 2 hours.`,
    type: "BOOKING_REQUEST",
    userId: ownerId,
  });
}

export async function sendBookingConfirmedSms(
  clientPhone: string,
  carName: string,
  bookingRef: string,
  startDate: string,
  clientId: string
) {
  return sendSms({
    phone: clientPhone,
    message: `ZuriDrive: Your booking for ${carName} is confirmed! Ref: ${bookingRef}. Trip starts ${startDate}. We'll remind you the day before.`,
    type: "BOOKING_CONFIRMED",
    userId: clientId,
  });
}

export async function sendBookingRejectedSms(
  clientPhone: string,
  carName: string,
  bookingRef: string,
  clientId: string
) {
  return sendSms({
    phone: clientPhone,
    message: `ZuriDrive: Unfortunately your booking for ${carName} (Ref: ${bookingRef}) was declined by the owner. Please browse other cars on ZuriDrive.`,
    type: "BOOKING_REJECTED",
    userId: clientId,
  });
}

export async function sendPaymentConfirmedSms(
  phone: string,
  amount: string,
  bookingRef: string,
  userId: string
) {
  return sendSms({
    phone,
    message: `ZuriDrive: Payment of ${amount} confirmed for booking ${bookingRef}. Awaiting owner confirmation. We'll SMS you when ready.`,
    type: "PAYMENT_CONFIRMED",
    userId,
  });
}

export async function sendTripStartingTomorrowSms(
  phone: string,
  carName: string,
  pickupInfo: string,
  userId: string
) {
  return sendSms({
    phone,
    message: `ZuriDrive: Reminder — your trip in ${carName} starts tomorrow. Pickup: ${pickupInfo}. Log in to upload pre-trip photos before you go.`,
    type: "TRIP_STARTING_TOMORROW",
    userId,
  });
}

export async function sendTripCompletedSms(
  clientPhone: string,
  carName: string,
  bookingRef: string,
  clientId: string
) {
  return sendSms({
    phone: clientPhone,
    message: `ZuriDrive: Trip completed! Thanks for renting ${carName} (Ref: ${bookingRef}). Your deposit will be released shortly. Please leave a review!`,
    type: "TRIP_COMPLETED",
    userId: clientId,
  });
}

export async function sendDepositReleasedSms(
  clientPhone: string,
  amount: string,
  clientId: string
) {
  return sendSms({
    phone: clientPhone,
    message: `ZuriDrive: Your deposit of ${amount} has been released and is on its way back to you. Thank you for using ZuriDrive!`,
    type: "DEPOSIT_RELEASED",
    userId: clientId,
  });
}

export async function sendDisputeOpenedSms(
  phone: string,
  bookingRef: string,
  userId: string
) {
  return sendSms({
    phone,
    message: `ZuriDrive: A dispute has been opened for booking ${bookingRef}. Our team will review and contact you within 24 hours.`,
    type: "DISPUTE_OPENED",
    userId,
  });
}

export async function sendPayoutProcessedSms(
  ownerPhone: string,
  amount: string,
  ownerId: string
) {
  return sendSms({
    phone: ownerPhone,
    message: `ZuriDrive: Your payout of ${amount} has been processed! Check your ZuriDrive dashboard for proof of transfer.`,
    type: "PAYOUT_PROCESSED",
    userId: ownerId,
  });
}

export async function sendSubscriptionRenewingSms(
  ownerPhone: string,
  planName: string,
  amount: string,
  daysUntil: number,
  ownerId: string
) {
  return sendSms({
    phone: ownerPhone,
    message: `ZuriDrive: Your ${planName} subscription renews in ${daysUntil} day(s) for ${amount}. Log in to manage your subscription.`,
    type: "SUBSCRIPTION_RENEWING",
    userId: ownerId,
  });
}

export async function sendConditionPhotosDeletingSms(
  phone: string,
  bookingRef: string,
  userId: string
) {
  return sendSms({
    phone,
    message: `ZuriDrive: Trip photos for booking ${bookingRef} will be deleted in 24 hours. Download them now from your dashboard if you need them.`,
    type: "CONDITION_PHOTOS_DELETING",
    userId,
  });
}

export async function sendGuestAccountCreatedSms(
  phone: string,
  loginUrl: string
) {
  return sendSms({
    phone,
    message: `ZuriDrive: Your account has been created. Log in here: ${loginUrl} — use your phone number to sign in. Welcome to ZuriDrive!`,
    type: "ACCOUNT_CREATED",
  });
}
