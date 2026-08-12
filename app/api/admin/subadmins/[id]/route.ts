/**
 * app/api/admin/subadmins/[id]/route.ts
 *
 * PATCH  — update a sub-admin's modules, or suspend/reinstate them
 * DELETE — revoke admin access entirely (demotes to CLIENT)
 *
 * SUPER_ADMIN only.
 *
 * Two things are deliberately impossible here:
 *  • acting on yourself — you can't lock yourself out or self-escalate
 *  • acting on another SUPER_ADMIN — peers can't demote each other
 *
 * Access is revoked by demoting the user and deleting their SubAdminProfile,
 * never by deleting the User: their bookings, cars and audit trail must
 * survive.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/admin-logger'
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

const PatchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update_modules'),
    roleModules: z.array(z.enum(ALL_MODULES)).min(1),
  }),
  z.object({
    action: z.literal('suspend'),
    reason: z.string().min(5).max(500),
  }),
  z.object({ action: z.literal('reinstate') }),
])

/**
 * Resolves the acting Super Admin and the target, rejecting self-action and
 * action against another Super Admin.
 */
async function resolve(targetId: string) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return { error: 'Unauthorised.', status: 401 as const }

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isSuspended: true },
  })

  if (!actor || actor.isSuspended || actor.role !== 'SUPER_ADMIN') {
    return { error: 'Only a Super Admin can manage admin accounts.', status: 403 as const }
  }

  if (actor.id === targetId) {
    return {
      error: 'You can’t change your own admin access.',
      status: 400 as const,
    }
  }

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, email: true, role: true, isSuspended: true },
  })

  if (!target) return { error: 'Admin not found.', status: 404 as const }

  if (target.role === 'SUPER_ADMIN') {
    return {
      error: 'Super Admins can’t be changed here.',
      status: 403 as const,
    }
  }

  if (target.role !== 'SUB_ADMIN') {
    return { error: 'That user is not an admin.', status: 400 as const }
  }

  return { actorId: actor.id, target }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const r = await resolve(params.id)
    if ('error' in r) {
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    const parsed = PatchSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const name = r.target.name ?? r.target.email ?? 'Admin'

    if (parsed.data.action === 'update_modules') {
      await prisma.subAdminProfile.update({
        where: { userId: r.target.id },
        data: { roleModules: parsed.data.roleModules },
      })

      await logAdminAction({
        actorId: r.actorId,
        action: 'SUBADMIN_ROLES_UPDATED',
        targetType: 'User',
        targetId: r.target.id,
        targetUserId: r.target.id,
        description: `Updated ${name}'s modules: ${parsed.data.roleModules.join(', ')}`,
        metadata: { roleModules: parsed.data.roleModules },
      })

      return NextResponse.json({ success: true })
    }

    if (parsed.data.action === 'suspend') {
      await prisma.user.update({
        where: { id: r.target.id },
        data: {
          isSuspended: true,
          suspendedAt: new Date(),
          suspendedById: r.actorId,
        },
      })

      await logAdminAction({
        actorId: r.actorId,
        action: 'SUBADMIN_SUSPENDED',
        targetType: 'User',
        targetId: r.target.id,
        targetUserId: r.target.id,
        reason: parsed.data.reason,
        description: `Suspended admin ${name}`,
      })

      return NextResponse.json({ success: true })
    }

    // reinstate
    await prisma.user.update({
      where: { id: r.target.id },
      data: { isSuspended: false, suspendedAt: null, suspendedById: null },
    })

    await logAdminAction({
      actorId: r.actorId,
      action: 'SUBADMIN_ROLES_UPDATED',
      targetType: 'User',
      targetId: r.target.id,
      targetUserId: r.target.id,
      description: `Reinstated admin ${name}`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/admin/subadmins/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const r = await resolve(params.id)
    if ('error' in r) {
      return NextResponse.json({ error: r.error }, { status: r.status })
    }

    const name = r.target.name ?? r.target.email ?? 'Admin'

    // Demote rather than delete — their history must survive.
    await prisma.$transaction([
      prisma.subAdminProfile.delete({ where: { userId: r.target.id } }),
      prisma.user.update({
        where: { id: r.target.id },
        data: { role: 'CLIENT' },
      }),
    ])

    await logAdminAction({
      actorId: r.actorId,
      action: 'SUBADMIN_DELETED',
      targetType: 'User',
      targetId: r.target.id,
      targetUserId: r.target.id,
      description: `Revoked admin access for ${name} — demoted to client`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/admin/subadmins/[id]]', error)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    )
  }
}
