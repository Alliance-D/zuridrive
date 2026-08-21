/**
 * app/api/admin/neighborhoods/route.ts
 *
 * POST  — add a neighbourhood
 * PATCH — rename, or activate/deactivate one
 *
 * Content Moderator. Neighbourhoods are the vocabulary owners pick from when
 * adding a pickup point, so this is a small controlled list rather than free
 * text.
 *
 * There is no delete: a neighbourhood may already be attached to an owner
 * location, and removing it would orphan that. Deactivating hides it from new
 * selections while leaving existing ones intact.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { requireModuleAccess } from '@/lib/api-guard'
import { logAdminAction } from '@/lib/admin-logger'
import { z } from 'zod'

const CreateSchema = z.object({
  name: z.string().min(2).max(60),
  city: z.string().min(2).max(60).default('Kigali'),
})

const UpdateSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(60).optional(),
  isActive: z.boolean().optional(),
})

async function requireModerator() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const ok = await requireModuleAccess(session.user.id, 'CONTENT_MODERATOR')
  return ok ? session.user.id : null
}

export async function POST(req: NextRequest) {
  try {
    const actorId = await requireModerator()
    if (!actorId) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = CreateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Enter a neighbourhood name of at least 2 characters.' },
        { status: 400 },
      )
    }

    const name = parsed.data.name.trim()
    const city = parsed.data.city.trim()

    // Clashes are per city. The same neighbourhood name in a different city is
    // a different place, not a duplicate.
    const clash = await prisma.neighborhood.findUnique({
      where: { name_city: { name, city } },
    })
    if (clash) {
      return NextResponse.json(
        { error: `"${name}" already exists in ${city}.` },
        { status: 409 },
      )
    }

    const created = await prisma.neighborhood.create({
      data: { name, city },
    })

    await logAdminAction({
      actorId,
      action: 'OWNER_LOCATION_APPROVED',
      targetType: 'Neighborhood',
      targetId: created.id,
      description: `Added neighbourhood "${name}" (${created.city})`,
    })

    return NextResponse.json({ success: true, id: created.id }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/admin/neighborhoods]', error)
    return NextResponse.json(
      { error: 'Could not add that neighbourhood.' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actorId = await requireModerator()
    if (!actorId) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }

    const existing = await prisma.neighborhood.findUnique({
      where: { id: parsed.data.id },
    })
    if (!existing) {
      return NextResponse.json(
        { error: 'Neighbourhood not found.' },
        { status: 404 },
      )
    }

    const updated = await prisma.neighborhood.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
        ...(parsed.data.isActive !== undefined
          ? { isActive: parsed.data.isActive }
          : {}),
      },
    })

    await logAdminAction({
      actorId,
      action: 'OWNER_LOCATION_APPROVED',
      targetType: 'Neighborhood',
      targetId: updated.id,
      description:
        parsed.data.isActive !== undefined
          ? `${parsed.data.isActive ? 'Activated' : 'Deactivated'} neighbourhood "${updated.name}"`
          : `Renamed neighbourhood to "${updated.name}"`,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/admin/neighborhoods]', error)
    return NextResponse.json(
      { error: 'Could not update that neighbourhood.' },
      { status: 500 },
    )
  }
}
