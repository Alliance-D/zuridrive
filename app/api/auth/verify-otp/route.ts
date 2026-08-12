// =============================================================================
// ZuriDrive — POST /api/auth/verify-otp
// Verifies an OTP and returns a sign-in token for the client to use
// The actual NextAuth sign-in is handled client-side via signIn("phone-otp")
// This endpoint is used to pre-validate before committing the NextAuth session
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { markPhoneVerified } from "@/lib/phone-verification";
import { z } from "zod";

const verifySchema = z.object({
  phone: z.string().min(10).max(15),
  otp: z.string().length(6).regex(/^[0-9]+$/, "OTP must be 6 digits"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = verifySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_INPUT",
          message: "Please enter the 6-digit code from your SMS.",
        },
        { status: 400 }
      );
    }

    const { phone, otp } = parsed.data;

    // Find user
    const user = await prisma.user.findUnique({ where: { phone } });

    if (!user) {
      // Don't reveal if phone exists
      return NextResponse.json(
        { error: "OTP_INVALID", message: "Incorrect code. Please try again." },
        { status: 401 }
      );
    }

    // Check lockout
    if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.otpLockedUntil.getTime() - Date.now()) / 60000
      );
      return NextResponse.json(
        {
          error: "OTP_LOCKED",
          message: `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
        },
        { status: 429 }
      );
    }

    // Check OTP exists and is not expired
    if (!user.otpCode || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return NextResponse.json(
        {
          error: "OTP_EXPIRED",
          message: "This code has expired. Please request a new one.",
        },
        { status: 401 }
      );
    }

    // Validate code
    if (user.otpCode !== otp) {
      const newAttempts = (user.otpAttempts ?? 0) + 1;
      const maxAttempts = parseInt(process.env.OTP_MAX_ATTEMPTS ?? "3");
      const lockoutMinutes = parseInt(process.env.OTP_LOCKOUT_MINUTES ?? "15");
      const willBeLocked = newAttempts >= maxAttempts;

      await prisma.user.update({
        where: { id: user.id },
        data: {
          otpAttempts: newAttempts,
          otpLockedUntil: willBeLocked
            ? new Date(Date.now() + lockoutMinutes * 60 * 1000)
            : null,
        },
      });

      return NextResponse.json(
        {
          error: willBeLocked ? "OTP_LOCKED" : "OTP_INVALID",
          message: willBeLocked
            ? `Too many incorrect codes. Please wait ${lockoutMinutes} minutes.`
            : `Incorrect code. ${maxAttempts - newAttempts} attempt(s) remaining.`,
          attemptsLeft: Math.max(0, maxAttempts - newAttempts),
        },
        { status: 401 }
      );
    }

    // The number is now proven. Recorded here rather than in the credentials
    // provider because this endpoint is also used to verify the phone of an
    // ALREADY signed-in user — someone who registered with a password and is
    // now confirming their number so they can list a car.
    await markPhoneVerified(user.id);

    // Valid — return success so client can call NextAuth signIn("phone-otp")
    // We don't clear the OTP here — the CredentialsProvider authorize() does that
    return NextResponse.json({ success: true, phone });
  } catch (error) {
    console.error("[VerifyOTP] Error:", error);
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}
