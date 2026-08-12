/**
 * app/api/admin/subadmins/route.ts
 *
 * POST /api/admin/subadmins — create a sub-admin.
 *
 * SUPER_ADMIN only. Creating a sub-admin hands someone privileged access, so
 * it is never delegated to a module.
 *
 * Accounts are created with a phone number (the platform's primary identifier)
 * and optional email. No password is set — they sign in with phone + OTP like
 * everyone else, which means there is no initial credential to leak.
 *
 * An existing CLIENT or OWNER can be promoted; their bookings and cars are
 * untouched. A user who is already an admin cannot be re-created.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { normalizeRwandaPhone } from '@/lib/phone'
import { logAdminAction } from '@/lib/admin-logger'
import { sendSms } from '@/lib/sms'
import { NotificationType, type AdminRoleModule } from '@prisma/client'
import { z } from 'zod'

const ALL_MODULES = [
  'USER_MANAGER',
  'FLEET_MANAGER',
  'BOOKING_MANAGER',
  'FINANCE_MANAGER',
  'DEPOSIT_MANAGER',
  'CONTENT_MODERATOR',
  'COMMUNICATIONS',
  'ANALYTICS_VIEWER',
  'SUPPORT_AGENT',
] as const

const CreateSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(10).max(15),
  email: z.string().email().or(z.literal('')).optional(),
  roleModules: z.array(z.enum(ALL_MODULES)).min(1, 'Pick at least one module.'),
})

/** Accepts 07…, 250…, +250… and returns E.164. */

async function requireSuperAdminId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isSuspended: true },
  })

  if (!actor || actor.isSuspended || actor.role !== 'SUPER_ADMIN') return null
  return session.user.id
}

export async function POST(req: NextRequest) {
  try {
    const actorId = await requireSuperAdminId()
    if (!actorId) {
      return NextResponse.json(
        { error: 'Only a Super Admin can create admin accounts.' },
        { status: 403 },
      )
    }

    const parsed = CreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please check the details and pick at least one module.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const { name, roleModules } = parsed.data
    const phone = normalizeRwandaPhone(parsed.data.phone)
    if (!phone) {
      return NextResponse.json(
        { error: 'Enter a valid Rwandan phone number (e.g. 078 123 4567).' },
        { status: 400 },
      )
    }

    const email = parsed.data.email?.trim()
      ? parsed.data.email.trim().toLowerCase()
      : null

    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true, name: true },
    })

    if (existing?.role === 'SUPER_ADMIN' || existing?.role === 'SUB_ADMIN') {
      return NextResponse.json(
        { error: 'That person already has an admin account.' },
        { status: 409 },
      )
    }

    if (email) {
      const emailClash = await prisma.user.findFirst({
        where: { email, ...(existing ? { NOT: { id: existing.id } } : {}) },
        select: { id: true },
      })
      if (emailClash) {
        return NextResponse.json(
          { error: 'That email is already used by another account.' },
          { status: 409 },
        )
      }
    }

    // Promote in place, or create fresh. Either way the profile carries the
    // modules and records who granted them.
    const user = await prisma.$transaction(async (tx) => {
      const u = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { role: 'SUB_ADMIN', name, ...(email ? { email } : {}) },
          })
        : await tx.user.create({
            data: {
              phone,
              name,
              email,
              role: 'SUB_ADMIN',
              isVerified: true,
            },
          })

      await tx.subAdminProfile.upsert({
        where: { userId: u.id },
        update: { roleModules },
        create: {
          userId: u.id,
          roleModules,
          createdById: actorId,
        },
      })

      return u
    })

    await logAdminAction({
      actorId,
      action: 'SUBADMIN_CREATED',
      targetType: 'User',
      targetId: user.id,
      targetUserId: user.id,
      description: `Created admin ${name} with ${roleModules.length} module${
        roleModules.length === 1 ? '' : 's'
      }: ${roleModules.join(', ')}`,
      metadata: { roleModules, promoted: Boolean(existing) },
    })

    // They sign in with phone + OTP — no password to send.
    await sendSms({
      to: phone,
      type: NotificationType.ACCOUNT_CREATED,
      userId: user.id,
      message: `ZuriDrive: You've been given admin access. Sign in at ${
        process.env.NEXTAUTH_URL ?? 'zuridrive.rw'
      }/login with this phone number — we'll text you a code.`,
    })

    return NextResponse.json(
      { success: true, userId: user.id, promoted: Boolean(existing) },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/admin/subadmins]', error)
    return NextResponse.json(
      { error: 'We couldn’t create that admin account. Please try again.' },
      { status: 500 },
    )
  }
}
