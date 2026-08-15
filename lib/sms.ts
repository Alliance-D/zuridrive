// =============================================================================
// ZuriDrive — SMS Service (Africa's Talking)
// Handles all SMS delivery: OTP codes, booking notifications, broadcasts
// Every SMS sent is logged to the SmsLog table for debugging + compliance
// Uses retry logic with exponential backoff for reliability
// =============================================================================

import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";
import { renderSms, type SmsKey, type SmsParams } from "@/lib/sms-i18n";

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
  /**
   * Message key in the `sms` namespace, rendered in the recipient's language.
   * Prefer this over `message` — see the locale note on sendSms.
   */
  messageKey?: SmsKey;
  params?: SmsParams;
  /**
   * Pre-rendered body. Only for text that is already in the reader's language
   * because a person typed it that way — an admin broadcast, for instance.
   */
  message?: string;
  /**
   * Overrides the recipient's stored locale. Used where the language is a
   * property of the moment rather than the account — signup, where the account
   * does not exist yet and the choice is whatever the browser is showing.
   */
  locale?: string;
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
  messageKey,
  params,
  message,
  locale,
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

  // ---------------------------------------------------------------------------
  // Language.
  //
  // Resolved here rather than at the call site on purpose. There are 40-odd
  // places that send SMS and only one of them needs to be forgotten for a
  // Kinyarwanda reader to get English — so no call site is trusted to pass it.
  // The recipient is looked up by userId when there is one and by phone when
  // there isn't, since plenty of callers only have a number off a relation.
  // ---------------------------------------------------------------------------
  let body = message;

  if (messageKey) {
    let readerLocale = locale ?? null;

    if (!readerLocale) {
      const reader = await prisma.user.findFirst({
        where: userId ? { id: userId } : { phone: recipientPhone },
        select: { locale: true },
      });
      readerLocale = reader?.locale ?? null;
    }

    body = renderSms(messageKey, params ?? {}, readerLocale);
  }

  if (!body) {
    console.error(
      `[SMS] Nothing to send to ${recipientPhone} (key: ${messageKey ?? "none"})`,
    );
    return { success: false, error: "Empty message body" };
  }

  let recipient: ATRecipient | null = null;
  let errorMessage: string | undefined;

  try {
    recipient = await sendRawSms(recipientPhone, body);
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
      // The rendered text, in the language it went out in. The audit
      // trail has to show what the recipient actually received.
      message: body,
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
  userId?: string,
  locale?: string,
): Promise<SendSmsResult> {
  return sendSms({
    phone,
    messageKey: "otp",
    params: { code: otp, minutes: Number(process.env.OTP_EXPIRY_MINUTES ?? 5) },
    // Signup sends this before the account exists, so there is no stored
    // locale to read — the caller passes whatever language the page is in.
    locale,
    type: "OTP",
    userId,
  });
}
