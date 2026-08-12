/**
 * The query shape CarCardGrid needs.
 *
 * This lived inside app/page.tsx, so anything else wanting to render car cards
 * had to redeclare it — and a second copy drifts the moment the card starts
 * showing a field the copy doesn't select. Shared here so the card and its
 * query stay in step.
 */

import { prisma } from "@/lib/db";

export const CAR_CARD_INCLUDE = {
  photos: { orderBy: { order: "asc" as const }, take: 1 },
  pricing: true,
  owner: {
    include: { user: { select: { name: true } } },
  },
  reviews: {
    select: { overallRating: true },
  },
  _count: { select: { bookings: true } },
};

/**
 * A few live cars, newest first. Used where cars are offered as a suggestion
 * rather than a search result — the 404 page, for instance.
 */
export async function getSuggestedCars(take = 3) {
  return prisma.car.findMany({
    where: { status: "LIVE", isActive: true },
    include: CAR_CARD_INCLUDE,
    orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
    take,
  });
}
