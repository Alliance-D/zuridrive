/**
 * /owner/fleet/new — list a car
 *
 * Server component: loads the neighbourhood list the wizard needs, then hands
 * off to the client wizard.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import CarListingWizard from "@/components/owner/car-form/CarListingWizard";
import { getOwnerAllowance } from "@/lib/subscriptions/limits";
import Link from "next/link";
import { routes } from "@/lib/routes";

export const metadata = { title: "List a car — ZuriDrive" };

export default async function NewCarPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login?next=/owner/fleet/new");

  const profile = await prisma.carOwnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/owner/onboarding");

  // Stop here rather than letting them fill in five steps and be rejected.
  const allowance = await getOwnerAllowance(profile.id);
  if (!allowance.canListMore) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-base font-semibold text-ink">
          You&apos;ve used all your listings
        </h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
          {allowance.reason}
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          {allowance.used} of{" "}
          {allowance.maxListings === null ? "unlimited" : allowance.maxListings}{" "}
          used.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            href={routes.ownerSubscription}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            See plans
          </Link>
          <Link
            href={routes.ownerFleet}
            className="rounded-lg border border-sand-dark px-4 py-2 text-sm font-semibold text-ink-muted hover:border-brand"
          >
            Back to fleet
          </Link>
        </div>
      </div>
    );
  }

  const neighborhoods = await prisma.neighborhood.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">List a car</h1>
        <p className="text-sm text-ink-soft">
          Five short steps. You can edit everything later.
        </p>
      </div>
      <CarListingWizard neighborhoods={neighborhoods} />
    </div>
  );
}
