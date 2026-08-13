// =============================================================================
// ZuriDrive — Owner helpers
//
// Every /owner page needs the CarOwnerProfile, not just the User: Car.ownerId,
// Payout.ownerId and OwnerSubscription.ownerId all reference CarOwnerProfile.id.
// Getting this wrong silently returns another owner's data, so it lives here
// once rather than being re-derived per page.
// =============================================================================

import { redirect } from "next/navigation";
import { localePath, loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Returns the signed-in user's owner profile.
 * Redirects to login if unauthenticated, or to onboarding if no profile exists.
 */
export async function requireOwnerProfile() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/owner/dashboard"));

  const profile = await prisma.carOwnerProfile.findUnique({
    where: { userId: session.user.id },
    select: {
      id: true,
      userId: true,
      // Business identity — the profile form and every renter-facing byline
      // read these, so they belong in the shared select rather than being
      // re-queried per page.
      ownerType: true,
      businessName: true,
      registrationNumber: true,
      tin: true,
      momoNumber: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      isOnboardingComplete: true,
      onboardingStep: true,
      memberSince: true,
      avgResponseTimeMinutes: true,
    },
  });

  if (!profile) redirect(await localePath("/owner/onboarding"));

  return { session, profile };
}

/**
 * Earnings an owner has accrued but not yet been paid.
 *
 * Payable = net owner amount on COMPLETED bookings, minus anything already
 * attached to a payout (PayoutItem). Reads the Commission ledger so the figure
 * always agrees with what finance sees.
 */
export async function getAvailableBalance(ownerProfileId: string) {
  const [earned, paidOut] = await Promise.all([
    prisma.commission.aggregate({
      _sum: { netOwnerAmount: true },
      where: {
        booking: { car: { ownerId: ownerProfileId }, status: "COMPLETED" },
      },
    }),
    prisma.payoutItem.aggregate({
      _sum: { amount: true },
      // FAILED payouts release their funds back to the balance.
      where: {
        payout: {
          ownerId: ownerProfileId,
          status: { in: ["PENDING_REQUEST", "APPROVED", "PAID"] },
        },
      },
    }),
  ]);

  const totalEarned = earned._sum.netOwnerAmount ?? 0;
  const totalRequested = paidOut._sum.amount ?? 0;

  return {
    totalEarned,
    totalRequested,
    available: Math.max(0, totalEarned - totalRequested),
  };
}
