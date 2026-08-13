// =============================================================================
// ZuriDrive — Car Card & Car Card Grid
// Reusable car listing card — used on homepage, search results, owner dashboard
// Server component — all data passed as props, no client fetching
// =============================================================================

import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getEnumLabeller } from "@/lib/enum-labels";
import { Star, MapPin, Users, Fuel, Zap } from "lucide-react";
import { formatRWF } from "@/lib/currency";
import { ROUTES } from "@/lib/routes";
import type { Car, CarPhoto, PricingMatrix, CarOwnerProfile, User, Review } from "@prisma/client";

// Shape of car data expected by the card
type CarWithDetails = Car & {
  photos: CarPhoto[];
  pricing: PricingMatrix | null;
  owner: CarOwnerProfile & {
    user: Pick<User, "name">;
  };
  reviews: Pick<Review, "overallRating">[];
  _count: { bookings: number };
};

// The locale is threaded down rather than resolved here: these are server
// components, so there is no hook context, and getTranslations() without an
// explicit locale renders English inside a translated page.
interface CarCardProps {
  car: CarWithDetails;
  locale: string;
}

interface CarCardGridProps {
  cars: CarWithDetails[];
  locale: string;
  columns?: 2 | 3 | 4; // Grid columns on desktop
  showSkeleton?: boolean;
}

// --------------------------------------------------------------------------
// CAR CARD
// --------------------------------------------------------------------------

export async function CarCard({ car, locale }: CarCardProps) {
  const t = await getTranslations({ locale, namespace: "cars" });
  const label = await getEnumLabeller(locale);
  const coverPhoto = car.photos[0];
  const pricing = car.pricing;

  // Calculate average rating
  const avgRating =
    car.reviews.length > 0
      ? car.reviews.reduce((sum, r) => sum + r.overallRating, 0) / car.reviews.length
      : null;

  // Starting price — cheapest rate available
  const startingPrice = pricing?.perDayInCity ?? null;

  // .card already sets the background, border, radius, overflow and transition
  // — the inline style here used to restate all five with identical values.
  // Only the three properties .card does NOT cover remain.
  return (
    <Link
      href={ROUTES.carDetail(car.id)}
      className="card card-hover relative block no-underline"
    >
      {/* Photo */}
      <div className="relative aspect-[16/10] overflow-hidden bg-sand">
        {coverPhoto ? (
          <Image
            src={coverPhoto.url}
            alt={`${car.make} ${car.model}`}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            // The transition lives on .car-card-img in globals.css alongside
            // the hover transform it belongs with; it was duplicated here.
            className="car-card-img object-cover"
          />
        ) : (
          // Illustrated empty state for cars without photos
          <div className="flex h-full w-full items-center justify-center bg-sand">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect width="64" height="64" rx="12" fill="var(--color-surface-2)" />
              <path d="M14 38l6-14h24l6 14" stroke="var(--color-border)" strokeWidth="2" strokeLinecap="round" />
              <rect x="12" y="36" width="40" height="12" rx="4" fill="none" stroke="var(--color-border)" strokeWidth="2" />
              <circle cx="20" cy="48" r="4" fill="var(--color-border)" />
              <circle cx="44" cy="48" r="4" fill="var(--color-border)" />
            </svg>
          </div>
        )}

        {/* Badges overlay */}
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {car.isFeatured && (
            <span className="badge badge-gold text-[10px]">
              ★ {t("featured")}
            </span>
          )}
          {car.pricing?.driverEnabled && (
            <span className="badge badge-blue text-[10px]">
              {t("withDriver")}
            </span>
          )}
        </div>
      </div>

      {/* Card body */}
      <div className="px-5 py-4">
        {/* Car name */}
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-sans text-fluid-base font-bold leading-tight tracking-[-0.01em] text-ink">
              {car.year} {car.make} {car.model}
            </h3>
            <p className="mt-0.5 font-mono text-fluid-xs tracking-[0.04em] text-ink-soft">
              {label("category", car.category)} ·{" "}
              {label("transmission", car.transmission)}
            </p>
          </div>

          {/* Rating */}
          {avgRating !== null && (
            <div className="flex shrink-0 items-center gap-[0.2rem]">
              <Star size={13} fill="var(--color-accent)" color="var(--color-accent)" />
              <span className="text-fluid-sm font-semibold text-ink">
                {avgRating.toFixed(1)}
              </span>
              <span className="text-fluid-xs text-ink-soft">
                ({car.reviews.length})
              </span>
            </div>
          )}
        </div>

        {/* Quick specs row */}
        <div className="mb-4 flex gap-4">
          <SpecChip
            icon={<Users size={12} />}
            label={t("seats", { count: car.seatingCapacity })}
          />
          <SpecChip
            icon={car.fuelType === "ELECTRIC" ? <Zap size={12} /> : <Fuel size={12} />}
            label={label("fuelType", car.fuelType)}
          />
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between border-t border-sand-light pt-3">
          <div>
            {startingPrice !== null ? (
              <>
                <span className="font-display text-fluid-xl font-semibold tracking-[-0.02em] text-brand">
                  {formatRWF(startingPrice)}
                </span>
                <span className="ml-1 font-mono text-fluid-xs text-ink-soft">
                  {t("perDay")}
                </span>
              </>
            ) : (
              <span className="text-fluid-sm text-ink-soft">
                {t("contactForPricing")}
              </span>
            )}
          </div>

          <span className="flex items-center gap-1 text-fluid-sm font-semibold text-brand">
            {t("view")} →
          </span>
        </div>
      </div>
    </Link>
  );
}

// --------------------------------------------------------------------------
// SPEC CHIP — small icon + label used inside the card
// --------------------------------------------------------------------------

function SpecChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1 text-fluid-xs text-ink-soft">
      {icon}
      <span>{label}</span>
    </div>
  );
}

// --------------------------------------------------------------------------
// CAR CARD GRID
// --------------------------------------------------------------------------

export default async function CarCardGrid({
  cars,
  locale,
  columns = 4,
  showSkeleton = false,
}: CarCardGridProps) {
  const t = await getTranslations({ locale, namespace: "cars" });
  // Skeleton loading — shows placeholder cards while data loads
  if (showSkeleton) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
        {Array.from({ length: columns }).map((_, i) => (
          <CarCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  // Empty state — never show blank white space
  if (cars.length === 0) {
    return (
      <div className="empty-state">
        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" className="empty-state-icon">
          <rect width="80" height="80" rx="16" fill="var(--color-surface)" />
          <path d="M20 52l8-18h24l8 18" stroke="var(--color-border)" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="18" y="50" width="44" height="14" rx="5" fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
          <circle cx="28" cy="64" r="5" fill="var(--color-surface-2)" stroke="var(--color-border)" strokeWidth="2" />
          <circle cx="52" cy="64" r="5" fill="var(--color-surface-2)" stroke="var(--color-border)" strokeWidth="2" />
          <path d="M36 28h8M40 24v8" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h3 className="empty-state-title">{t("noneAvailable")}</h3>
        <p className="empty-state-body">{t("noneAvailableBody")}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-5">
      {cars.map((car) => (
        <CarCard key={car.id} car={car} locale={locale} />
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// CAR CARD SKELETON — matches the exact layout of CarCard
// --------------------------------------------------------------------------

function CarCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-3xl border border-sand-light bg-white">
      {/* Photo skeleton */}
      <div className="skeleton aspect-[16/10] w-full rounded-none" />

      {/* Content skeletons — these mirror CarCard's real layout, so the page
          does not jump when the data arrives. */}
      <div className="px-5 py-4">
        <div className="skeleton mb-2 h-5 w-[70%]" />
        <div className="skeleton mb-4 h-3.5 w-[45%]" />
        <div className="mb-4 flex gap-4">
          <div className="skeleton h-3.5 w-[60px]" />
          <div className="skeleton h-3.5 w-[60px]" />
        </div>
        <div className="flex justify-between border-t border-sand-light pt-3">
          <div className="skeleton h-6 w-[100px]" />
          <div className="skeleton h-5 w-[50px]" />
        </div>
      </div>
    </div>
  );
}
