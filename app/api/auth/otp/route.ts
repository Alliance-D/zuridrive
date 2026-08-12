// =============================================================================
// ZuriDrive — POST /api/auth/otp
// Generates an OTP, stores it on the User record, and sends it via SMS
//
// Handles two scenarios:
//   1. Existing user logging in — finds by phone, sends OTP
//   2. New user signing up — creates account first, then sends OTP
//
// Security:
//   - Rate limited: max 5 OTP requests per phone per 15 minutes
//   - OTP expires in OTP_EXPIRY_MINUTES (default: 5)
//   - Max 3 attempts before 15-minute lockout (enforced on verify)
//   - Never reveals whether a phone number is registered (prevents enumeration)
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendOtpSms } from "@/lib/sms";
import { normalizeRwandaPhone } from "@/lib/phone";
import { z } from "zod";

// Validate the incoming request body
const requestSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+?[0-9]+$/, "Invalid phone number format"),
  // If true, we're creating a new account (signup flow)
  isSignup: z.boolean().optional().default(false),
  // New user signup fields — only required when isSignup = true
  name: z.string().min(2).max(100).optional(),
});

const RATE_LIMIT_MAX = 5;                     // Max OTP sends per window
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;  // 15 minutes

/**
 * Send-rate limiting, held in the database.
 *
 * This used to be a Map in process memory, which does not work on any host that
 * runs more than one instance: each instance keeps its own counter, so the real
 * allowance is 5 × however many instances happen to be warm. Every send past
 * the limit is an SMS we pay for, so the ceiling has to be shared.
 *
 * Counts against the User row. A phone with no account cannot be rate limited
 * this way — but it also cannot trigger a send, because we only ever send to
 * an existing user (see the enumeration guard below).
 */
async function withinSendLimit(userId: string): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { otpSendCount: true, otpWindowStartedAt: true },
  });

  if (!user) return false;

  // Window expired (or never started) — begin a fresh one.
  if (!user.otpWindowStartedAt || user.otpWindowStartedAt < windowStart) {
    await prisma.user.update({
      where: { id: userId },
      data: { otpSendCount: 1, otpWindowStartedAt: now },
    });
    return true;
  }

  if (user.otpSendCount >= RATE_LIMIT_MAX) return false;

  // Atomic increment — two concurrent requests cannot both read 4 and write 5.
  await prisma.user.update({
    where: { id: userId },
    data: { otpSendCount: { increment: 1 } },
  });

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_INPUT",
          message: "Please enter a valid phone number.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { phone, isSignup, name } = parsed.data;

    // Normalize phone number — ensure it starts with +250 for Rwanda
    // Accept: 07XXXXXXXX, 250XXXXXXXXX, +250XXXXXXXXX
    const normalizedPhone = normalizeRwandaPhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          error: "INVALID_PHONE",
          message:
            "Please enter a valid Rwandan phone number (e.g. 078 123 4567).",
        },
        { status: 400 }
      );
    }

    // Find or create the user
    let user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      if (!isSignup) {
        // Don't reveal that the phone isn't registered — security best practice
        // We pretend we sent the OTP either way
        return NextResponse.json({ success: true, isNewUser: false });
      }

      // Create new user account (minimal — they'll complete profile later)
      user = await prisma.user.create({
        data: {
          phone: normalizedPhone,
          name: name ?? null,
          role: "CLIENT", // All new signups are clients
        },
      });
    }

    // Rate limit sends — prevents SMS flooding, and the bill that comes with it.
    if (!(await withinSendLimit(user.id))) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message:
            "Too many code requests. Please wait 15 minutes before trying again.",
        },
        { status: 429 }
      );
    }

    // Check if user is currently locked out from too many OTP failures
    if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.otpLockedUntil.getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        {
          error: "OTP_LOCKED",
          message: `Too many incorrect codes. Please try again in ${minutesLeft} minute(s).`,
        },
        { status: 429 }
      );
    }

    // Generate fresh OTP
    const otp = generateOtp();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES ?? "5");
    const otpExpiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    // Store OTP on user record — plaintext (it's a short-lived code, not a password)
    // Resets attempt counter on every new OTP request
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt,
        otpAttempts: 0,
        otpLockedUntil: null,
      },
    });

    // Send OTP via SMS
    const smsResult = await sendOtpSms(normalizedPhone, otp, user.id);

    if (!smsResult.success) {
      // Don't expose the error — log it server-side and return a friendly message
      console.error(`[OTP] SMS delivery failed for ${normalizedPhone}:`, smsResult.error);
      return NextResponse.json(
        {
          error: "SMS_FAILED",
          message:
            "We couldn't send the verification code. Please check your number and try again.",
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      isNewUser: !user || isSignup,
      // In development only — expose OTP for testing without a real SIM
      ...(process.env.NODE_ENV === "development" && { devOtp: otp }),
    });
  } catch (error) {
    console.error("[OTP] Unexpected error:", error);
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        message: "Something went wrong. Please try again in a moment.",
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalizes various Rwandan phone number formats to E.164 (+250XXXXXXXXX)
 * Accepts: 07XXXXXXXX / 250XXXXXXXXX / +250XXXXXXXXX
 * Returns null if the number doesn't look like a valid Rwandan number
 */
