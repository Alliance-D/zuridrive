// =============================================================================
// ZuriDrive — POST /api/auth/signup/owner
// Creates a new Car Owner account
// Flow: collect phone + name → send OTP → verify → account created with OWNER role
// Owner is created with a blank CarOwnerProfile and directed to onboarding
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateOtp, sendOtpSms } from "@/lib/sms";
import { hashPassword } from "@/lib/auth";
import { passwordSchema } from "@/lib/password-policy";
import { localeFromRequest } from "@/lib/locale-cookie";
import { z } from "zod";

const ownerSignupSchema = z.object({
  phone: z
    .string()
    .min(10)
    .max(15)
    .regex(/^\+?[0-9\s\-()]+$/, "Invalid phone number"),
  name: z.string().min(2).max(100),
  // Owners sign in with a password like everyone else. The code below only
  // proves the number is theirs.
  password: passwordSchema,
  email: z.string().email().optional(),
  // Declared at signup so the first listing already carries the right byline.
  // Everything else about the business (registration number, TIN) is asked for
  // later in the profile — signup stays short.
  ownerType: z.enum(['INDIVIDUAL', 'COMPANY']).optional(),
  businessName: z.string().max(150).optional(),
}).refine(
  (d) => d.ownerType !== 'COMPANY' || (d.businessName ?? '').trim().length >= 2,
  { message: 'Enter the business name renters will see.', path: ['businessName'] },
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = ownerSignupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "INVALID_INPUT",
          message: "Please fill in all required fields correctly.",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { phone, name, email } = parsed.data;

    // Normalize phone
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          error: "INVALID_PHONE",
          message: "Please enter a valid Rwandan phone number.",
        },
        { status: 400 }
      );
    }

    // Check if phone already registered
    const existingUser = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error: "PHONE_EXISTS",
          message:
            "This phone number is already registered. Please log in instead.",
        },
        { status: 409 }
      );
    }

    // Check email uniqueness if provided
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });
      if (existingEmail) {
        return NextResponse.json(
          {
            error: "EMAIL_EXISTS",
            message: "This email is already in use. Please use a different email.",
          },
          { status: 409 }
        );
      }
    }

    // Create owner user + profile in a transaction
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone: normalizedPhone,
          name,
          email: email?.toLowerCase() ?? null,
          passwordHash: await hashPassword(parsed.data.password),
          role: "OWNER",
          // The OTP below is the first thing this account receives.
          locale: localeFromRequest(req),
        },
      });

      // Create blank CarOwnerProfile — filled during onboarding
      await tx.carOwnerProfile.create({
        data: {
          userId: newUser.id,
          onboardingStep: 1,
          isOnboardingComplete: false,
          ownerType: parsed.data.ownerType ?? 'INDIVIDUAL',
          businessName:
            parsed.data.ownerType === 'COMPANY'
              ? (parsed.data.businessName?.trim() ?? null)
              : null,
        },
      });

      return newUser;
    });

    // Generate and send OTP to verify phone
    const otp = generateOtp();
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES ?? "5");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        otpAttempts: 0,
      },
    });

    await sendOtpSms(normalizedPhone, otp, user.id);

    return NextResponse.json({
      success: true,
      userId: user.id,
      // Dev only
      ...(process.env.NODE_ENV === "development" && { devOtp: otp }),
    });
  } catch (error) {
    console.error("[OwnerSignup] Error:", error);
    return NextResponse.json(
      {
        error: "SERVER_ERROR",
        message: "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}

function normalizePhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, "");
  if (/^\+250[0-9]{9}$/.test(cleaned)) return cleaned;
  if (/^250[0-9]{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0[0-9]{9}$/.test(cleaned)) return `+250${cleaned.slice(1)}`;
  return null;
}
