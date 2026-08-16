/**
 * app/api/admin/plans/route.ts
 *
 * PATCH /api/admin/plans — update subscription plans.
 *
 * SUPER_ADMIN only, for the same reason platform settings are: these values
 * decide what owners are charged and what share of every booking the platform
 * takes. No sub-admin module grants access, not even FINANCE_MANAGER.
 *
 * Plans previously existed only in prisma/seed.ts, so changing a price meant
 * editing code and deploying. Pricing gets tuned against real behaviour for
 * months after launch, and that should not need a developer each time.
 *
 * Editing a price is safe with respect to history: OwnerSubscription.pricePaid
 * snapshots what each owner actually committed to, so nothing here can rewrite
 * what somebody already paid.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { logAdminAction } from '@/lib/admin-logger'
import { z } from 'zod'

/**
 * Bounds are sanity rails, not policy — they only stop obvious slips.
 *
 * Not exported: a route file may only export route handlers, and adding
 * anything else fails the production build with a type error that never
 * appears in tsc --noEmit.
 */
const PLAN_LIMITS = {
  priceMonthly: { min: 0, max: 5_000_000 },
  maxListings: { min: 1, max: 1_000 },
  commissionRatePercent: { min: 0, max: 50 },
} as const

const L = PLAN_LIMITS

const PlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  priceMonthly: z.number().int().min(L.priceMonthly.min).max(L.priceMonthly.max),
  /**
   * Null means unlimited. It is allowed, but the admin screen warns about it:
   * an uncapped top tier charges a thirty-car operator what an eight-car
   * operator pays.
   */
  maxListings: z
    .number()
    .int()
    .min(L.maxListings.min)
    .max(L.maxListings.max)
    .nullable(),
  /** Null falls back to the platform-wide commission rate. */
  commissionRatePercent: z
    .number()
    .int()
    .min(L.commissionRatePercent.min)
    .max(L.commissionRatePercent.max)
    .nullable(),
  isFeatured: z.boolean(),
  hasVerifiedBadge: z.boolean(),
  hasHomepageBanner: z.boolean(),
  hasPrioritySupport: z.boolean(),
  analyticsLevel: z.enum(['BASIC', 'ADVANCED', 'FULL']),
  isActive: z.boolean(),
})

const UpdateSchema = z.object({ plans: z.array(PlanSchema).min(1).max(10) })

const LABELS: Record<string, string> = {
  name: 'Name',
  priceMonthly: 'Price',
  maxListings: 'Listing cap',
  commissionRatePercent: 'Commission rate',
  isFeatured: 'Featured in search',
  hasVerifiedBadge: 'Verified badge',
  hasHomepageBanner: 'Homepage banner',
  hasPrioritySupport: 'Priority support',
  analyticsLevel: 'Analytics level',
  isActive: 'Active',
}

/** "unlimited" reads better than "null" in an audit entry. */
function show(value: unknown): string {
  if (value === null) return 'unlimited'
  if (typeof value === 'boolean') return value ? 'on' : 'off'
  return String(value)
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const actor = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true, isSuspended: true },
    })

    if (!actor || actor.isSuspended || actor.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { error: 'Only a Super Admin can change subscription plans.' },
        { status: 403 },
      )
    }

    const parsed = UpdateSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Some values are outside the allowed range.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const incoming = parsed.data.plans
    const existing = await prisma.subscriptionPlan.findMany({
      where: { id: { in: incoming.map((p) => p.id) } },
    })

    if (existing.length !== incoming.length) {
      return NextResponse.json(
        { error: 'One of these plans no longer exists. Reload and try again.' },
        { status: 409 },
      )
    }

    // Diff first, so the audit entry says what actually changed rather than
    // recording a write that changed nothing.
    const changes: string[] = []
    for (const plan of incoming) {
      const before = existing.find((e) => e.id === plan.id)!
      for (const key of Object.keys(LABELS) as (keyof typeof LABELS)[]) {
        const a = before[key as keyof typeof before]
        const b = plan[key as keyof typeof plan]
        if (a !== b) changes.push(`${before.name} ${LABELS[key]}: ${show(a)} → ${show(b)}`)
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ success: true, changed: false })
    }

    await prisma.$transaction(
      incoming.map((plan) =>
        prisma.subscriptionPlan.update({
          where: { id: plan.id },
          data: {
            name: plan.name,
            priceMonthly: plan.priceMonthly,
            maxListings: plan.maxListings,
            commissionRatePercent: plan.commissionRatePercent,
            isFeatured: plan.isFeatured,
            hasVerifiedBadge: plan.hasVerifiedBadge,
            hasHomepageBanner: plan.hasHomepageBanner,
            hasPrioritySupport: plan.hasPrioritySupport,
            analyticsLevel: plan.analyticsLevel,
            isActive: plan.isActive,
          },
        }),
      ),
    )

    await logAdminAction({
      actorId: session.user.id,
      action: 'SUBSCRIPTION_PLAN_UPDATED',
      targetType: 'SubscriptionPlan',
      targetId: incoming.map((p) => p.id).join(','),
      description: changes.join('; '),
      metadata: { changes },
    })

    return NextResponse.json({ success: true, changed: true, changes })
  } catch (error) {
    console.error('[PATCH /api/admin/plans]', error)
    return NextResponse.json(
      { error: 'We couldn’t save these plans. Please try again.' },
      { status: 500 },
    )
  }
}
