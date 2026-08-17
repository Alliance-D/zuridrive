/**
 * app/api/auth/signup/route.ts
 *
 * POST /api/auth/signup — create a client account with phone + password.
 *
 * NO SMS IS SENT HERE, and that is deliberate. Sending a verification code at
 * signup means every registration costs money, every registration can fail
 * because a third party is down, and the friction lands at the exact moment
 * people abandon a form.
 *
 * Instead the account is created immediately with phoneVerifiedAt = null, and
 * verification is required later, only before something consequential — see
 * lib/auth.ts requirePhoneVerified(). When no SMS provider is configured at
 * all, verification is skipped entirely and accounts are trusted, which is what
 * lets the platform launch before the RURA sender-ID process completes.
 */

import { NextRequest, NextResponse } from 'next/server'
import { localeFromRequest } from '@/lib/locale-cookie'
import { prisma } from '@/lib/db'
import { normalizeRwandaPhone } from '@/lib/phone'
import { hashPassword } from '@/lib/auth'
import { generateOtp, sendOtpSms } from '@/lib/sms'
import { passwordSchema } from '@/lib/password-policy'
import { rateLimit, clientIp, rateLimitHeaders } from '@/lib/rate-limit'
import { z } from 'zod'

const SignupSchema = z.object({
  phone: z.string().min(9).max(20),
  name: z.string().min(2).max(100),
  password: passwordSchema,
  email: z.string().email().optional(),
})

export async function POST(req: NextRequest) {
  try {
    // Each account created sends an SMS, so bulk signups cost real money.
    // Five per address per hour is generous for a household sharing a
    // connection and useless for scripted abuse.
    const limit = await rateLimit(`signup:${clientIp(req)}`, 5, 60 * 60 * 1000)
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many accounts created from here. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limit) },
      )
    }

    const parsed = SignupSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json(
        {
          // The specific rule that failed, so "too easy to guess" does not
          // arrive disguised as "too short".
          error:
            parsed.error.issues[0]?.message ??
            'Please check your name, phone number and password.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const phone = normalizeRwandaPhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json(
        { error: 'Please enter a valid Rwandan phone number, e.g. 078 123 4567.' },
        { status: 400 },
      )
    }

    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, passwordHash: true },
    })

    if (existing) {
      // An account already on this number. If it predates passwords (OTP-only)
      // we say so rather than refusing flatly, because the person is probably
      // the legitimate owner and needs a route forward.
      return NextResponse.json(
        {
          error: existing.passwordHash
            ? 'An account already exists on that number. Try signing in instead.'
            : 'An account already exists on that number. Sign in with a one-time code, then set a password.',
        },
        { status: 409 },
      )
    }

    const user = await prisma.user.create({
      data: {
        phone,
        name: parsed.data.name.trim(),
        email: parsed.data.email?.toLowerCase().trim() ?? null,
        passwordHash: await hashPassword(parsed.data.password),
        role: 'CLIENT',
        locale: localeFromRequest(req),
        // Unverified until they prove the number. Not a barrier to signing in.
        phoneVerifiedAt: null,
      },
      select: { id: true, phone: true, name: true },
    })

    // Verify the number now. The password is what signs them in from here on,
    // so this code is a one-off proof that the phone is theirs rather than a
    // credential they will need again.
    const otp = generateOtp()
    const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES ?? '5')

    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        otpAttempts: 0,
      },
    })

    await sendOtpSms(phone, otp, user.id, localeFromRequest(req))

    return NextResponse.json(
      {
        success: true,
        user,
        // Dev only - no SMS provider is configured locally, so the form shows
        // the code rather than leaving you stuck.
        ...(process.env.NODE_ENV === 'development' && { devOtp: otp }),
      },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/auth/signup]', error)
    return NextResponse.json(
      { error: 'We couldn’t create your account. Please try again.' },
      { status: 500 },
    )
  }
}
