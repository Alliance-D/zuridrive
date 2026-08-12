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
import { prisma } from '@/lib/db'
import { normalizeRwandaPhone } from '@/lib/phone'
import { hashPassword } from '@/lib/auth'
import { z } from 'zod'

const SignupSchema = z.object({
  phone: z.string().min(9).max(20),
  name: z.string().min(2).max(100),
  password: z.string().min(8).max(200),
  email: z.string().email().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const parsed = SignupSchema.safeParse(await req.json())

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            'Please enter your name, phone number, and a password of at least 8 characters.',
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
        // Unverified until they prove the number. Not a barrier to signing in.
        phoneVerifiedAt: null,
      },
      select: { id: true, phone: true, name: true },
    })

    return NextResponse.json({ success: true, user }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/auth/signup]', error)
    return NextResponse.json(
      { error: 'We couldn’t create your account. Please try again.' },
      { status: 500 },
    )
  }
}
