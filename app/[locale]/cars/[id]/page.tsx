// =============================================================================
// ZuriDrive — Car Detail Page (/cars/[id])
// Server component — all data fetched server-side
// Sections: photo gallery, specs, pricing table, fuel policy, availability,
//           owner profile snippet, reviews breakdown, sticky Book Now CTA
// =============================================================================

import { notFound } from "next/navigation";
import { getEnumLabeller, type EnumLabeller } from "@/lib/enum-labels";
import { getTranslations } from "next-intl/server";
import { ownerDisplayName } from "@/lib/owner-identity"
import { getDepositCopy } from "@/lib/deposit-copy";
import { formatEnumLabel } from "@/lib/labels";
import type { Metadata } from "next";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import CarGallery from "@/components/car-gallery";
import ReviewsSection from "@/components/reviews-section";
import BookNowBar from "@/components/book-now-bar";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/currency";
import { ROUTES } from "@/lib/routes";
import {
  Star, Users, Fuel, Zap, Settings2, Calendar,
  MapPin, Clock, Shield, ChevronRight, Car
} from "lucide-react";

interface CarDetailPageProps {
  params: { id: string; locale: string };
}

async function getCar(id: string) {
  try {
    const car = await prisma.car.findUnique({
      where: { id, status: "LIVE", isActive: true },
      include: {
        photos: { orderBy: { order: "asc" } },
        pricing: true,
        fuelPolicy: true,
        availability: {
          where: { endDate: { gte: new Date() } },
          orderBy: { startDate: "asc" },
        },
        owner: {
          include: {
            user: { select: { name: true, createdAt: true } },
            cars: { where: { status: "LIVE" }, select: { id: true } },
          },
        },
        locations: {
          where: { isApproved: true },
          include: { neighborhood: true },
        },
        reviews: {
          where: { isVisible: true },
          include: {
            client: { select: { name: true, profilePhoto: true } },
            reply: { include: { author: { select: { name: true } } } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: { select: { bookings: true } },
      },
    });
    return car;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: CarDetailPageProps): Promise<Metadata> {
  const car = await getCar(params.id);
  if (!car) return { title: "Car Not Found" };

  return {
    title: `${car.year} ${car.make} ${car.model}`,
    description: `Rent a ${car.year} ${car.make} ${car.model} in Rwanda. ${car.category} · ${car.transmission} · ${car.seatingCapacity} seats. Book securely on ZuriDrive.`,
  };
}

export default async function CarDetailPage({ params }: CarDetailPageProps) {
  const t = await getTranslations({ locale: params.locale, namespace: "carDetail" });
  const label = await getEnumLabeller(params.locale);
  const td = await getTranslations({ locale: params.locale, namespace: "deposit" });
  const car = await getCar(params.id);
  if (!car) notFound();

  const pricing = car.pricing;
  const fuelPolicy = car.fuelPolicy;

  // Calculate average ratings
  const reviews = car.reviews;
  const avgRatings = reviews.length > 0 ? {
    overall: reviews.reduce((s, r) => s + r.overallRating, 0) / reviews.length,
    cleanliness: reviews.reduce((s, r) => s + r.cleanlinessRating, 0) / reviews.length,
    comfort: reviews.reduce((s, r) => s + r.comfortRating, 0) / reviews.length,
    value: reviews.reduce((s, r) => s + r.valueRating, 0) / reviews.length,
    communication: reviews.reduce((s, r) => s + r.communicationRating, 0) / reviews.length,
  } : null;

  const ownerMemberSince = new Date(car.owner.user.createdAt).getFullYear();

  return (
    <div className="min-h-screen bg-bone">
      <Navbar />

      {/* pt-nav clears the fixed navbar. --nav-height has no Tailwind
          equivalent, so it stays a token reference in an arbitrary value
          rather than a magic number that would drift from the navbar. */}
      <div className="pt-[var(--nav-height)]">
        {/* ============================================================== */}
        {/* PHOTO GALLERY                                                    */}
        {/* ============================================================== */}
        <CarGallery photos={car.photos} carName={`${car.make} ${car.model}`} />

        {/* ============================================================== */}
        {/* MAIN CONTENT — two-column layout                                */}
        {/* ============================================================== */}
        <div className="container car-detail-grid grid grid-cols-[1fr_380px] items-start gap-[clamp(2rem,4vw,4rem)] pb-[clamp(4rem,8vw,6rem)] pt-[clamp(2rem,4vw,3rem)]">
          {/* ---- LEFT COLUMN ---- */}
          <div>
            {/* Car title + badges */}
            <div className="mb-6">
              {car.isFeatured && (
                <span className="badge badge-gold mb-3 inline-flex">
                  ★ {t("featuredListing")}
                </span>
              )}
              <h1 className="mb-3 font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
                {car.year} {car.make} {car.model}
              </h1>

              {/* Rating + booking count */}
              <div className="flex flex-wrap items-center gap-4">
                {avgRatings && (
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={16}
                        fill={s <= Math.round(avgRatings.overall) ? "var(--color-accent)" : "none"}
                        color={s <= Math.round(avgRatings.overall) ? "var(--color-accent)" : "var(--color-border)"}
                      />
                    ))}
                    <span className="ml-1 text-fluid-sm font-semibold">
                      {avgRatings.overall.toFixed(1)}
                    </span>
                    <span className="text-fluid-sm text-ink-soft">
                      ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
                    </span>
                  </div>
                )}
                <span className="text-fluid-sm text-ink-soft">
                  {car._count.bookings} trip{car._count.bookings !== 1 ? "s" : ""} completed
                </span>
              </div>
            </div>

            {/* Quick specs */}
            <div className="mb-8 grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
              {[
                { icon: <Car size={16} />, label: t("specCategory"), value: label("category", car.category) },
                { icon: <Users size={16} />, label: t("specSeats"), value: t("passengers", { count: car.seatingCapacity }) },
                { icon: car.fuelType === "ELECTRIC" ? <Zap size={16} /> : <Fuel size={16} />, label: t("specFuel"), value: label("fuelType", car.fuelType) },
                { icon: <Settings2 size={16} />, label: t("specTransmission"), value: label("transmission", car.transmission) },
              ].map((spec) => (
                <div
                  key={spec.label}
                  className="rounded-2xl border border-sand-light bg-white p-4"
                >
                  <div className="mb-2 text-brand">{spec.icon}</div>
                  <p className="mb-[0.2rem] font-mono text-fluid-xs uppercase tracking-[0.08em] text-ink-soft">
                    {spec.label}
                  </p>
                  <p className="text-fluid-sm font-semibold text-ink">
                    {spec.value}
                  </p>
                </div>
              ))}
            </div>

            {/* ---- PRICING TABLE ---- */}
            {pricing && (
              <section className="mb-8">
                <SectionHeading>{t("pricing")}</SectionHeading>
                <div className="overflow-hidden rounded-3xl border border-sand-light bg-white">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-sand">
                        <th className={TH}>{t("period")}</th>
                        <th className={TH}>{t("inCity")}</th>
                        <th className={TH}>{t("outsideCity")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <PricingRow
                        period={t("perDayLabel")}
                        inCity={formatMoney(pricing.perDayInCity)}
                        outside={formatMoney(pricing.perDayOutsideCity)}
                      />
                      <PricingRow
                        period={t("perWeek")}
                        inCity={formatMoney(pricing.perWeekInCity)}
                        outside={formatMoney(pricing.perWeekOutsideCity)}
                        isAlt
                      />
                      <tr>
                        <td className={`${TD} text-fluid-sm`}>
                          <strong>{t("perMonth")}</strong>
                          <span className="mt-0.5 block text-fluid-xs text-ink-soft">
                            {t("goAnywhere")}
                          </span>
                        </td>
                        <td className={`${TD} text-fluid-sm text-center`} colSpan={2}>
                          <span className="font-display text-fluid-xl font-semibold text-brand">
                            {formatMoney(pricing.perMonth)}
                          </span>
                          <span className="ml-1 text-fluid-xs text-ink-soft">{t("perMonthSuffix")}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Driver surcharge note */}
                  {pricing.driverEnabled && pricing.driverSurchargePerDay && (
                    <div className="flex items-center gap-2 border-t border-sand-light bg-sand px-5 py-3 text-fluid-sm text-ink-soft">
                      <Users size={14} />
                      Driver available: +{formatMoney(pricing.driverSurchargePerDay)} per day when selected
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ---- FUEL POLICY ---- */}
            {fuelPolicy && (
              <section className="mb-8">
                <SectionHeading>{t("fuelPolicy")}</SectionHeading>
                <FuelPolicyCard
                  policy={fuelPolicy.type}
                  refuelingFee={fuelPolicy.refuelingFee}
                  label={label}
                  t={t}
                />
              </section>
            )}

            {/* ---- DEPOSIT ---- */}
            {pricing?.depositEnabled && pricing.depositAmount && (
              <section className="mb-8">
                <SectionHeading>{t("damageDeposit")}</SectionHeading>
                <div className="flex items-start gap-4 rounded-3xl border border-sand-light bg-white p-5">
                  {/* The mint/green pair here are literals rather than tokens —
                      success/success-bg are the palette's greens and read very
                      differently. Left as arbitrary values so the colour does
                      not change during a refactor that should be invisible. */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#D1FAE5] text-[#065F46]">
                    <Shield size={18} />
                  </div>
                  <div>
                    <p className="mb-1 text-fluid-base font-bold">
                      {t("depositRequired", { amount: formatMoney(pricing.depositAmount) })}
                    </p>
                    <p className="text-fluid-sm leading-[1.6] text-ink-soft">
                      {td(getDepositCopy().explanationKey)}{" "}
                      {t("depositSeparate")}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* ---- PICKUP LOCATIONS ---- */}
            {car.locations.length > 0 && (
              <section className="mb-8">
                <SectionHeading>{t("pickupLocations")}</SectionHeading>
                <div className="flex flex-col gap-3">
                  {car.locations.map((loc) => (
                    <div
                      key={loc.id}
                      className="flex items-start gap-3 rounded-2xl border border-sand-light bg-white p-4"
                    >
                      <MapPin size={16} className="mt-0.5 shrink-0 text-brand" />
                      <div>
                        <p className="text-fluid-sm font-semibold">{loc.name}</p>
                        {loc.neighborhood && (
                          <p className="text-fluid-xs text-ink-soft">
                            {loc.neighborhood.name}
                          </p>
                        )}
                        {loc.description && (
                          <p className="mt-1 text-fluid-sm text-ink-soft">
                            {loc.description}
                          </p>
                        )}
                        {loc.deliveryFee && loc.deliveryFee > 0 && (
                          <p className="mt-1 text-fluid-xs font-semibold text-brand">
                            {t("deliveryFeeAdd", { amount: formatMoney(loc.deliveryFee) })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* ---- OWNER PROFILE SNIPPET ---- */}
            <section className="mb-8">
              <SectionHeading>{t("yourHost")}</SectionHeading>
              <div className="flex items-start gap-5 rounded-3xl border border-sand-light bg-white p-5">
                {/* Avatar */}
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand font-display text-fluid-xl font-semibold text-white">
                  {ownerDisplayName(car.owner).charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="mb-1 text-fluid-base font-bold">
                    {ownerDisplayName(car.owner)}
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <OwnerStat icon={<Car size={13} />} label={t("carsListed", { count: car.owner.cars.length })} />
                    <OwnerStat icon={<Calendar size={13} />} label={t("memberSince", { year: ownerMemberSince })} />
                    {car.owner.avgResponseTimeMinutes && (
                      <OwnerStat icon={<Clock size={13} />} label={t("respondsIn", { minutes: car.owner.avgResponseTimeMinutes })} />
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* ---- REVIEWS ---- */}
            <ReviewsSection
              reviews={reviews}
              avgRatings={avgRatings}
              locale={params.locale}
            />
          </div>

          {/* ---- RIGHT COLUMN — Booking Widget (desktop only) ---- */}
          <div className="hide-mobile sticky top-[calc(var(--nav-height)_+_1.5rem)]">
            <BookingWidget car={car} locale={params.locale} />
          </div>
        </div>
      </div>

      {/* Mobile sticky Book Now bar */}
      <BookNowBar carId={car.id} startingPrice={pricing?.perDayInCity} />

      <Footer />
    </div>
  );
}

// --------------------------------------------------------------------------
// SUB-COMPONENTS
// --------------------------------------------------------------------------

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 font-sans text-fluid-lg font-bold tracking-[-0.01em] text-ink">
      {children}
    </h2>
  );
}

// Shared cell classes. These were CSSProperties objects spread into every
// cell, which is why the pricing table had to be migrated as one unit — the
// constants and their call sites only make sense together.
const TH = "border-b border-sand-light px-5 py-3 text-left font-mono text-fluid-xs font-medium uppercase tracking-[0.08em] text-ink-soft";
const TD = "border-b border-sand-light px-5 py-4 text-ink";

function PricingRow({
  period, inCity, outside, isAlt = false,
}: { period: string; inCity: string; outside: string; isAlt?: boolean }) {
  return (
    <tr className={isAlt ? "bg-sand" : "bg-transparent"}>
      <td className={`${TD} text-fluid-sm`}><strong>{period}</strong></td>
      <td className={`${TD} font-display text-fluid-lg font-semibold text-brand`}>{inCity}</td>
      <td className={`${TD} font-display text-fluid-lg font-semibold text-ink`}>{outside}</td>
    </tr>
  );
}

/**
 * The label comes from the enum labeller and the description from the
 * carDetail namespace, rather than the table of English literals this used to
 * hold. Both are passed in because this is a module-level function.
 */
function FuelPolicyCard({
  policy,
  refuelingFee,
  label,
  t,
}: {
  policy: string;
  refuelingFee: number | null;
  label: EnumLabeller;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const DESCRIPTION: Record<string, string> = {
    FULL_TO_FULL: refuelingFee
      ? t("fuelFullToFullFee", { amount: formatMoney(refuelingFee) })
      : t("fuelFullToFull"),
    SAME_LEVEL: t("fuelSameLevel"),
    FREE_TANK: t("fuelFreeTank"),
    OWNER_HANDLES: t("fuelOwnerHandles"),
  };

  const CLASS_NAME: Record<string, string> = {
    FULL_TO_FULL: "fuel-badge-full-to-full",
    SAME_LEVEL: "fuel-badge-same-level",
    FREE_TANK: "fuel-badge-free-tank",
    OWNER_HANDLES: "fuel-badge-owner-handles",
  };

  const key = policy in DESCRIPTION ? policy : "OWNER_HANDLES";

  return (
    <div className="flex items-start gap-4 rounded-3xl border border-sand-light bg-white p-5">
      <span className={`fuel-badge ${CLASS_NAME[key]} shrink-0`}>
        {label("fuelPolicy", key)}
      </span>
      <p className="text-fluid-sm leading-[1.65] text-ink-soft">
        {DESCRIPTION[key]}
      </p>
    </div>
  );
}

function OwnerStat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1 text-fluid-sm text-ink-soft">
      {icon} {label}
    </div>
  );
}

// Desktop booking widget — mirrored in the booking flow (Step 3)
async function BookingWidget({ car, locale }: { locale: string; car: Parameters<typeof CarDetailPage>[0]["params"] extends { id: string } ? Awaited<ReturnType<typeof getCar>> : never }) {
  const t = await getTranslations({ locale, namespace: "carDetail" });
  if (!car) return null;
  const pricing = car.pricing;

  return (
    <div className="rounded-3xl border border-sand-light bg-white p-6 shadow-[var(--shadow-lg)]">
      {/* Price display */}
      <div className="mb-5">
        {pricing ? (
          <>
            <span className="font-display text-fluid-2xl font-semibold tracking-[-0.02em] text-brand">
              {formatMoney(pricing.perDayInCity)}
            </span>
            <span className="ml-1 text-fluid-sm text-ink-soft">{t("perDaySuffix")}</span>
          </>
        ) : null}
      </div>

      {/* Booking CTA */}
      <a href={ROUTES.book(car.id)} className="btn btn-primary btn-lg mb-3 w-full justify-center">
        {t("bookThisCar")}
      </a>
      <p className="text-center text-fluid-xs leading-normal text-ink-soft">
        {t("noChargeUntilConfirm")}
      </p>

      {/* Quick facts */}
      <div className="mt-5 flex flex-col gap-3 border-t border-sand-light pt-5">
        <QuickFact icon={<Shield size={14} />} text={t("quickPayment")} />
        <QuickFact icon={<Clock size={14} />} text={t("quickConfirm")} />
        <QuickFact icon={<ChevronRight size={14} />} text={t("quickDeposit")} />
      </div>
    </div>
  );
}

function QuickFact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-start gap-3 text-fluid-xs leading-normal text-ink-soft">
      <span className="mt-[0.1rem] shrink-0 text-brand">{icon}</span>
      {text}
    </div>
  );
}
