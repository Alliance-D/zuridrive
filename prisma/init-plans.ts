/**
 * prisma/init-plans.ts
 *
 * Creates the three subscription tiers, once, on a fresh database.
 *
 * The admin plans page can only edit plans that already exist — it has no
 * "add plan" control, because the tiers are fixed by the product rather than
 * something an operator invents. In development the demo seed created them.
 * Production must not run that seed, since it also makes a fake owner, a fake
 * Toyota and a fake booking, so a fresh production database has no plans and
 * the plans page is an empty form.
 *
 * This fills that gap and nothing else. It writes three rows and touches no
 * user, car or booking data.
 *
 * Prices are left at zero deliberately. What ZuriDrive charges is a decision
 * for whoever runs it, not a default to be inherited from a script — set them
 * on /admin/plans, where the change is logged and where the page explains that
 * a new price applies from a subscriber's next cycle.
 *
 * Safe to run more than once: each tier is an upsert keyed on the tier, and it
 * only ever writes the entitlements. A price already set in the admin panel is
 * never overwritten.
 *
 *   DATABASE_URL="<direct string>" npx tsx prisma/init-plans.ts
 */

import { PrismaClient, SubscriptionTier } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * The tiers, as described in the platform specification.
 *
 * featuredPriority is what orders search results: 1 sorts above 2, and a plan
 * without one falls to the bottom with the unsubscribed.
 */
const PLANS = [
  {
    tier: SubscriptionTier.BASIC,
    name: "Basic",
    maxListings: 1,
    isFeatured: false,
    featuredPriority: null,
    hasVerifiedBadge: false,
    analyticsLevel: "BASIC",
    hasHomepageBanner: false,
    hasPrioritySupport: false,
  },
  {
    tier: SubscriptionTier.PRO,
    name: "Pro",
    maxListings: 5,
    isFeatured: true,
    featuredPriority: 2, // standard placement
    hasVerifiedBadge: true,
    analyticsLevel: "ADVANCED",
    hasHomepageBanner: false,
    hasPrioritySupport: false,
  },
  {
    tier: SubscriptionTier.PREMIUM,
    name: "Premium",
    // Null means no cap. The allowance check reads it that way.
    maxListings: null,
    isFeatured: true,
    featuredPriority: 1, // top of search
    hasVerifiedBadge: true,
    analyticsLevel: "FULL",
    hasHomepageBanner: true,
    hasPrioritySupport: true,
  },
];

async function main() {
  for (const plan of PLANS) {
    const existing = await prisma.subscriptionPlan.findUnique({
      where: { tier: plan.tier },
      select: { id: true, priceMonthly: true },
    });

    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      // A price set by a person in the admin panel is theirs, not this
      // script's, so an update never touches it.
      update: {
        name: plan.name,
        maxListings: plan.maxListings,
        isFeatured: plan.isFeatured,
        featuredPriority: plan.featuredPriority,
        hasVerifiedBadge: plan.hasVerifiedBadge,
        analyticsLevel: plan.analyticsLevel,
        hasHomepageBanner: plan.hasHomepageBanner,
        hasPrioritySupport: plan.hasPrioritySupport,
      },
      create: { ...plan, priceMonthly: 0, isActive: true },
    });

    const listings = plan.maxListings === null ? "unlimited" : plan.maxListings;
    console.log(
      existing
        ? `  updated  ${plan.name.padEnd(8)} ${String(listings).padEnd(9)} price left at ${existing.priceMonthly}`
        : `  created  ${plan.name.padEnd(8)} ${String(listings).padEnd(9)} price 0 — set it on /admin/plans`,
    );
  }

  const total = await prisma.subscriptionPlan.count();
  const unpriced = await prisma.subscriptionPlan.count({
    where: { priceMonthly: 0 },
  });

  console.log(`\n${total} plans in place.`);
  if (unpriced) {
    console.log(
      `${unpriced} still priced at zero — set them on /admin/plans before ` +
        `owners can subscribe.`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
