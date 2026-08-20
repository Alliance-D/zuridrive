/**
 * app/api/owner/cars/draft/route.ts
 *
 * PUT /api/owner/cars/draft — save an unfinished listing.
 *
 * The listing wizard is five steps including three to ten photo uploads, and
 * it kept everything in browser memory until the final submit. A phone that
 * runs out of battery, a dropped connection, a mistapped back button — and an
 * owner loses the lot, photos included. On a mobile-first platform that is the
 * kind of thing that makes someone not come back.
 *
 * A draft is deliberately NOT a listing:
 *   • it is never visible to anyone but its owner
 *   • it does not count against the plan's listing cap
 *   • nothing about it is validated, because half-finished work does not
 *     validate — the real checks run on publish, through the normal route
 *
 * One draft per owner. The wizard creates one listing at a time, so a second
 * one would only ever be a stale copy of the first.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { z } from 'zod'

/**
 * Everything is optional and nothing is trusted for shape beyond being JSON.
 * This is a scratchpad: the wizard's own state, handed back later. It is
 * re-validated properly when the owner publishes.
 */
const DraftSchema = z.object({
  /** The wizard's form state, verbatim. */
  form: z.record(z.unknown()),
  /** Which step the owner had reached, so they resume where they left off. */
  step: z.number().int().min(1).max(5),
})

async function ownerProfile(userId: string) {
  return prisma.carOwnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  })
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const profile = await ownerProfile(session.user.id)
    if (!profile) {
      return NextResponse.json(
        { error: 'Only car owners can save a listing draft.' },
        { status: 403 },
      )
    }

    const parsed = DraftSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Could not read the draft.' }, { status: 400 })
    }

    const draft = await prisma.carListingDraft.upsert({
      where: { ownerId: profile.id },
      create: {
        ownerId: profile.id,
        form: parsed.data.form as object,
        step: parsed.data.step,
      },
      update: {
        form: parsed.data.form as object,
        step: parsed.data.step,
      },
    })

    return NextResponse.json({ savedAt: draft.updatedAt })
  } catch (error) {
    console.error('[PUT /api/owner/cars/draft]', error)
    // A failed draft save must never interrupt the owner. The wizard treats
    // this as "not saved yet" and carries on.
    return NextResponse.json({ error: 'Could not save the draft.' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const profile = await ownerProfile(session.user.id)
    if (!profile) {
      return NextResponse.json({ error: 'Not a car owner.' }, { status: 403 })
    }

    const draft = await prisma.carListingDraft.findUnique({
      where: { ownerId: profile.id },
    })

    if (!draft) return NextResponse.json({ draft: null })

    return NextResponse.json({
      draft: { form: draft.form, step: draft.step, savedAt: draft.updatedAt },
    })
  } catch (error) {
    console.error('[GET /api/owner/cars/draft]', error)
    return NextResponse.json({ error: 'Could not load the draft.' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    }

    const profile = await ownerProfile(session.user.id)
    if (!profile) {
      return NextResponse.json({ error: 'Not a car owner.' }, { status: 403 })
    }

    // deleteMany rather than delete: discarding a draft that is already gone
    // is a success, not a 404.
    await prisma.carListingDraft.deleteMany({ where: { ownerId: profile.id } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DELETE /api/owner/cars/draft]', error)
    return NextResponse.json({ error: 'Could not discard the draft.' }, { status: 500 })
  }
}
