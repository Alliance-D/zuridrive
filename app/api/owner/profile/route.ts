/**
 * app/api/owner/profile/route.ts
 *
 * PATCH /api/owner/profile — update the owner's identity and payout details.
 *
 * Writes span two tables (User for identity, CarOwnerProfile for payout), so
 * they go in one transaction.
 *
 * Phone is deliberately not updatable here — it is the login identifier and
 * must go through OTP re-verification.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

const UpdateSchema = z
  .object({
    name: z.string().min(2).max(100),
    email: z.string().email().or(z.literal('')).optional(),
    momoNumber: z.string().max(20).optional(),
    bankName: z.string().max(100).optional(),
    bankAccountName: z.string().max(100).optional(),
    bankAccountNumber: z.string().max(50).optional(),
    // Business identity. `name` stays the person who holds the login — it is
    // what every ownerConfirmedAt and dispute reply is attributed to — while
    // businessName is what renters see on the listing.
    ownerType: z.enum(['INDIVIDUAL', 'COMPANY']).optional(),
    businessName: z.string().max(150).optional(),
    registrationNumber: z.string().max(60).optional(),
    tin: z.string().max(40).optional(),
  })
  .refine(
    (d) => d.ownerType !== 'COMPANY' || (d.businessName ?? '').trim().length >= 2,
    {
      message: 'Enter the registered business name renters will see.',
      path: ['businessName'],
    },
  )

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Please sign in to continue.' },
        { status: 401 },
      )
    }

    const profile = await prisma.carOwnerProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!profile) {
      return NextResponse.json(
        { error: 'Owner profile not found.' },
        { status: 403 },
      )
    }

    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please check your details and try again.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const d = parsed.data
    const email = d.email?.trim() ? d.email.trim().toLowerCase() : null

    // email is @unique — surface a clear message rather than a Prisma error.
    if (email) {
      const clash = await prisma.user.findFirst({
        where: { email, NOT: { id: session.user.id } },
        select: { id: true },
      })
      if (clash) {
        return NextResponse.json(
          { error: 'That email is already used by another account.' },
          { status: 409 },
        )
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.user.id },
        data: {
          name: d.name.trim(),
          email,
        },
      }),
      prisma.carOwnerProfile.update({
        where: { id: profile.id },
        data: {
          momoNumber: d.momoNumber?.trim() || null,
          bankName: d.bankName?.trim() || null,
          bankAccountName: d.bankAccountName?.trim() || null,
          bankAccountNumber: d.bankAccountNumber?.trim() || null,
          // Only write business fields when the owner is a company. Switching
          // back to INDIVIDUAL clears them, so a stale business name can never
          // keep showing on a listing after someone has changed their mind.
          ...(d.ownerType
            ? d.ownerType === 'COMPANY'
              ? {
                  ownerType: 'COMPANY' as const,
                  businessName: d.businessName?.trim() || null,
                  registrationNumber: d.registrationNumber?.trim() || null,
                  tin: d.tin?.trim() || null,
                }
              : {
                  ownerType: 'INDIVIDUAL' as const,
                  businessName: null,
                  registrationNumber: null,
                  tin: null,
                }
            : {}),
        },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/owner/profile]', error)
    return NextResponse.json(
      { error: 'We couldn’t save your changes. Please try again.' },
      { status: 500 },
    )
  }
}
