/**
 * /owner/fleet — the owner's cars
 *
 * Shows every car with its live status, rate, booking count and rating.
 * Cars in DRAFT or PENDING_APPROVAL are shown too, with the reason surfaced
 * so owners aren't left guessing why a listing isn't visible.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatRWF } from "@/lib/currency";
import { routes } from "@/lib/routes";
import { getOwnerAllowance } from "@/lib/subscriptions/limits";
import type { CarStatus } from "@prisma/client";
import { Car, Plus, Star, Pencil, AlertTriangle } from "lucide-react";

const STATUS_STYLES: Record<CarStatus, { label: string; className: string }> = {
  LIVE: { label: "Live", className: "bg-success-bg text-success" },
  PENDING_APPROVAL: {
    label: "Pending review",
    className: "bg-warning-tint text-warning-dark",
  },
  DRAFT: { label: "Draft", className: "bg-sand text-ink-soft" },
  SUSPENDED: { label: "Suspended", className: "bg-danger-bg text-danger" },
};

export default async function OwnerFleetPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const profile = await prisma.carOwnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (!profile) redirect("/owner/onboarding");

  const allowance = await getOwnerAllowance(profile.id);

  const cars = await prisma.car.findMany({
    where: { ownerId: profile.id },
    include: {
      photos: { orderBy: { order: "asc" }, take: 1 },
      pricing: true,
      reviews: { where: { isVisible: true }, select: { overallRating: true } },
      _count: { select: { bookings: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">My fleet</h1>
          <p className="text-sm text-ink-soft">
            {cars.length === 0
              ? "No cars listed yet."
              : `${cars.length} car${cars.length === 1 ? "" : "s"} listed.`}
          </p>
        </div>
        {allowance.canListMore ? (
          <Link
            href={routes.ownerFleetNew}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            Add a car
          </Link>
        ) : (
          <Link
            href={routes.ownerSubscription}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-sand-dark bg-white px-3 py-2 text-sm font-semibold text-ink-muted hover:border-brand hover:text-brand"
          >
            <Plus className="h-4 w-4" />
            Upgrade to add more
          </Link>
        )}
      </div>

      {/* Plan allowance — shown before they hit the wall, not after */}
      <div
        className={`rounded-2xl p-3 ${allowance.canListMore ? "bg-white shadow-sm" : "bg-warning-bg"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-ink-muted">
            <span className="font-semibold">
              {allowance.used} of{" "}
              {allowance.maxListings === null ? "unlimited" : allowance.maxListings}
            </span>{" "}
            listings used
            {allowance.plan && allowance.status !== "LAPSED"
              ? ` on ${allowance.plan.name}`
              : allowance.status === "LAPSED"
                ? " — your plan has lapsed"
                : " on the free tier"}
          </p>
          {!allowance.canListMore && (
            <Link
              href={routes.ownerSubscription}
              className="text-xs font-semibold text-warning underline"
            >
              See plans
            </Link>
          )}
        </div>
        {allowance.reason && (
          <p className="mt-1 text-[11px] text-warning">{allowance.reason}</p>
        )}
      </div>

      {cars.length === 0 ? (
        <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <Car className="h-5 w-5 text-brand" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            Your fleet is empty
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            Add your first car to start receiving booking requests.
          </p>
          <Link
            href={routes.ownerFleetNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            Add a car
          </Link>
        </section>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {cars.map((car) => {
            const status = STATUS_STYLES[car.status];
            const avgRating =
              car.reviews.length > 0
                ? car.reviews.reduce((s, r) => s + r.overallRating, 0) /
                  car.reviews.length
                : null;

            return (
              <article
                key={car.id}
                className="overflow-hidden rounded-2xl bg-white shadow-sm"
              >
                <div className="relative h-36 bg-sand">
                  {car.photos[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={car.photos[0].url}
                      alt={`${car.make} ${car.model}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Car className="h-6 w-6 text-ink-faint" />
                    </div>
                  )}
                  <span
                    className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}
                  >
                    {status.label}
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-bold text-ink">
                        {car.year} {car.make} {car.model}
                      </h2>
                      <p className="text-xs text-ink-soft">
                        {car.licensePlate} · {car.category}
                      </p>
                    </div>
                    {avgRating !== null && (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink">
                        <Star className="h-3 w-3 fill-accent text-accent" />
                        {avgRating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <dt className="text-ink-faint">Daily rate</dt>
                      <dd className="font-semibold text-ink">
                        {car.pricing
                          ? formatRWF(car.pricing.perDayInCity)
                          : "Not set"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-faint">Bookings</dt>
                      <dd className="font-semibold text-ink">
                        {car._count.bookings}
                      </dd>
                    </div>
                  </dl>

                  {car.status === "SUSPENDED" && car.rejectionReason && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-danger-bg px-2.5 py-2 text-[11px] text-danger">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      {car.rejectionReason}
                    </p>
                  )}

                  {!car.pricing && (
                    <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warning-tint px-2.5 py-2 text-[11px] text-warning-dark">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
                      This car has no pricing yet, so it can&apos;t be booked.
                    </p>
                  )}

                  <div className="mt-3 flex gap-2">
                    <Link
                      href={routes.ownerFleetEdit(car.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sand-dark px-3 py-2 text-xs font-semibold text-ink-muted hover:border-brand hover:text-brand"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Link>
                    {car.status === "LIVE" && (
                      <Link
                        href={routes.carDetail(car.id)}
                        className="flex flex-1 items-center justify-center rounded-lg border border-sand-dark px-3 py-2 text-xs font-semibold text-ink-muted hover:border-brand hover:text-brand"
                      >
                        View listing
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
