// =============================================================================
// ZuriDrive — Homepage (/)
// Server Component — data fetched server-side, no client waterfalls
//
// Sections:
//   1. Hero — full-screen parallax with search widget overlay
//   2. Featured Cars — top picks, live from DB
//   3. How It Works — 3-step explainer
//   4. Why ZuriDrive — value props
//   5. Become an Owner CTA — drives owner signups
//   6. Footer
// =============================================================================

import Link from "next/link";
import { CAR_CARD_INCLUDE } from "@/lib/car-card";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import HeroSearch from "@/components/hero-search";
import CarCardGrid from "@/components/car-card-grid";
import ScrollReveal from "@/components/scroll-reveal";
import { prisma } from "@/lib/prisma";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getBannerEligibleOwnerIds } from "@/lib/subscriptions/limits";
import { formatRWF } from "@/lib/currency";
import { ROUTES } from "@/lib/routes";
import {
  Shield, Clock, MapPin, Star, TrendingUp, Users,
  ChevronRight, ArrowRight
} from "lucide-react";

/** Everything a car card needs. Shared by both homepage queries. */


/**
 * The homepage banner slot — SubscriptionPlan.hasHomepageBanner.
 *
 * Only owners whose live plan carries the banner benefit are eligible, and
 * only one car each, so a single large fleet can't fill the whole strip. That
 * matters: a banner every Premium owner shares is worth something, one that
 * one owner monopolises is worth nothing to everyone else.
 */
async function getBannerCars() {
  try {
    const ownerIds = await getBannerEligibleOwnerIds();
    if (ownerIds.length === 0) return [];

    const cars = await prisma.car.findMany({
      where: { status: "LIVE", isActive: true, ownerId: { in: ownerIds } },
      include: CAR_CARD_INCLUDE,
      orderBy: [{ isFeatured: "desc" }, { publishedAt: "desc" }],
    });

    // One per owner, newest first.
    const seen = new Set<string>();
    return cars.filter((car) => {
      if (seen.has(car.ownerId)) return false;
      seen.add(car.ownerId);
      return true;
    }).slice(0, 3);
  } catch {
    return [];
  }
}

// Fetch featured + recently listed cars for homepage
async function getHomepageCars(excludeIds: string[]) {
  try {
    const cars = await prisma.car.findMany({
      where: {
        status: "LIVE",
        isActive: true,
        // Banner cars already have their own slot above — don't repeat them.
        ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
      },
      include: {
        photos: { orderBy: { order: "asc" }, take: 1 },
        pricing: true,
        owner: {
          include: { user: { select: { name: true } } },
        },
        reviews: {
          select: { overallRating: true },
        },
        _count: { select: { bookings: true } },
      },
      orderBy: [
        { isFeatured: "desc" },              // Admin-featured cars first
        { owner: { searchPriority: "asc" } }, // Then by plan placement (1 = Premium)
        { publishedAt: "desc" },             // Then newest
      ],
      take: 8,
    });

    return cars;
  } catch {
    return [];
  }
}

/**
 * Platform stats — shown in the hero.
 *
 * Returns null when the counts cannot be read, and the strip is not rendered.
 * This used to fall back to { carCount: 120, bookingCount: 850, ownerCount: 65 }
 * — numbers that were never true, shown to the public, in the one situation
 * where nobody would be looking at the logs to notice. A homepage with no
 * stats on it is a smaller problem than a homepage that invents them.
 */
async function getStats() {
  try {
    const [carCount, bookingCount, ownerCount] = await Promise.all([
      prisma.car.count({ where: { status: "LIVE" } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.carOwnerProfile.count(),
    ]);
    return { carCount, bookingCount, ownerCount };
  } catch (error) {
    console.error("[home] Could not read platform stats", error);
    return null;
  }
}

/**
 * What cars actually list for, per day.
 *
 * This replaced a hardcoded "Avg. monthly earnings — RWF 450,000". That figure
 * was not derived from anything, and the data contradicts it: no owner has been
 * paid out through the platform yet, so the real average is zero. A range of
 * live asking prices is true by construction, moves on its own as listings
 * change, and still tells an owner what their car might make.
 *
 * Null when there is nothing listed, and the strip is dropped rather than
 * rendering an empty range.
 */
async function getListedPriceRange() {
  try {
    const rows = await prisma.pricingMatrix.findMany({
      where: { car: { status: "LIVE", isActive: true } },
      select: { perDayInCity: true },
    });
    if (rows.length === 0) return null;

    const rates = rows.map((r) => r.perDayInCity);
    return { min: Math.min(...rates), max: Math.max(...rates) };
  } catch (error) {
    console.error("[home] Could not read listed price range", error);
    return null;
  }
}

/**
 * "120+" reads as "at least 120, probably more". That is fair once a number is
 * large enough to have been rounded down to it, and misleading at "4+", where
 * the real figure is exactly four. Below the threshold the exact count is shown
 * instead. Lower or remove this once the numbers can carry themselves.
 */
const PLUS_THRESHOLD = 10;

function statValue(count: number): string {
  return count >= PLUS_THRESHOLD ? `${count}+` : String(count);
}

export default async function HomePage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "home" });
  // Banner first — the main grid excludes whatever it takes, so no car
  // appears twice on the page.
  const bannerCars = await getBannerCars();
  const [cars, stats, priceRange, settings] = await Promise.all([
    getHomepageCars(bannerCars.map((c) => c.id)),
    getStats(),
    getListedPriceRange(),
    getPlatformSettings(),
  ]);

  // The owner's share is the inverse of the commission, which an admin can
  // change. Hardcoding "80%" left it to go quietly stale the first time
  // somebody edited the rate in settings.
  const ownerSharePercent = 100 - settings.commissionRatePercent;

  // Nothing to say is better than something untrue: no stats when the read
  // failed, and no entry for a count that is still zero.
  const shownStats = stats
    ? [
        { count: stats.carCount, labelKey: "statCars" },
        { count: stats.bookingCount, labelKey: "statTrips" },
        { count: stats.ownerCount, labelKey: "statOwners" },
      ].filter((s) => s.count > 0)
    : [];

  return (
    <div className="min-h-screen bg-bone">
      <Navbar />

      {/* ================================================================== */}
      {/* SECTION 1: HERO                                                      */}
      {/* Full-screen, parallax car image, semi-transparent search overlay    */}
      {/* ================================================================== */}
      <section className="relative flex h-[100svh] min-h-[640px] flex-col justify-end overflow-hidden bg-brand-darkest">
        {/* Background image — parallax handled by CSS transform on scroll */}
        <div className="absolute inset-0 z-0">
          {/* Four-stop gradient for legibility over the photo. Kept as an
              arbitrary value: Tailwind's gradient utilities cover two or three
              stops, and forcing this through them would change the ramp. */}
          <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(10,20,15,0.25)_0%,rgba(10,20,15,0.1)_40%,rgba(10,20,15,0.65)_75%,rgba(10,20,15,0.92)_100%)]" />
          {/* Hero image */}
          <Image
            src="/images/hero-car.svg"
            alt=""
            fill
            priority
            quality={90}
            className="object-cover object-[center_60%]"
          />
        </div>

        {/* Hero content */}
        <div className="container relative z-[2] pb-[clamp(3rem,6vw,5rem)]">
          {/* Stats strip — top-left. Absent entirely if the counts could not be
              read, and a count of zero is left out rather than shown as "0". */}
          {shownStats.length > 0 && (
            <div className="mb-[clamp(1.5rem,3vw,2.5rem)] flex animate-[fadeIn_0.8s_ease_0.2s_both] gap-[clamp(1rem,4vw,3rem)]">
              {shownStats.map((stat) => (
                <div key={stat.labelKey}>
                  <div className="font-display text-fluid-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                    {statValue(stat.count)}
                  </div>
                  <div className="mt-[0.15rem] font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/60">
                    {t(stat.labelKey)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main headline */}
          <h1 className="mb-[clamp(1.5rem,3vw,2.5rem)] max-w-[14ch] animate-[slideUp_0.7s_ease_0.1s_both] font-display text-fluid-hero font-light leading-[0.92] tracking-[-0.04em] text-white [text-wrap:balance]">
            {t("heroLine1")}{" "}
            <em className="italic text-accent">{t("heroLine2")}</em>
          </h1>

          {/* Search widget — the main action */}
          <div className="animate-[slideUp_0.7s_ease_0.3s_both]">
            <HeroSearch />
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 2: FEATURED CARS                                            */}
      {/* ================================================================== */}
      <section className="bg-bone py-[clamp(4rem,8vw,7rem)]">
        <div className="container">
          <ScrollReveal>
            <div className="mb-[clamp(2rem,4vw,3.5rem)] flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="label mb-2 block text-brand">
                  ◆ {t("availableNow")}
                </span>
                <h2 className="font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
                  {t("carsHeading")}
                </h2>
              </div>
              <Link
                href={ROUTES.cars}
                className="flex items-center gap-1.5 whitespace-nowrap border-b-[1.5px] border-brand pb-0.5 text-fluid-sm font-semibold tracking-[0.01em] text-brand no-underline"
              >
                {t("viewAllCars")} <ArrowRight size={14} />
              </Link>
            </div>
          </ScrollReveal>

          {/* Banner slot — Premium owners. Labelled, because a paid placement
              that reads as an editorial pick is a dishonest one. */}
          {bannerCars.length > 0 && (
            <ScrollReveal>
              <div className="mb-[clamp(2rem,4vw,3rem)]">
                <div className="mb-4 flex items-center gap-2">
                  <Star size={14} className="text-accent" />
                  <span className="label text-ink-soft">
                    {t("spotlight")}
                  </span>
                </div>
                <CarCardGrid cars={bannerCars} locale={params.locale} />
              </div>
            </ScrollReveal>
          )}

          <CarCardGrid cars={cars} locale={params.locale} />
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 3: HOW IT WORKS                                             */}
      {/* Alternating layout — not a boring 3-card grid                       */}
      {/* ================================================================== */}
      <section className="relative overflow-hidden bg-brand py-[clamp(4rem,8vw,7rem)]">
        {/* Decorative texture — two radial washes. Arbitrary value because
            Tailwind has no utility for layered radial gradients. */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(212,160,23,0.08)_0%,transparent_50%),radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.04)_0%,transparent_40%)]" />

        <div className="container relative">
          <ScrollReveal>
            <div className="mb-[clamp(2.5rem,5vw,4.5rem)] text-center">
              <span className="label mb-3 block text-accent">
                ◆ {t("simpleProcess")}
              </span>
              <h2 className="font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-white">
                {t("searchToKeys")}
              </h2>
            </div>
          </ScrollReveal>

          {/* Steps — horizontal on desktop, vertical on mobile */}
          <div className="relative grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[clamp(1.5rem,3vw,2.5rem)]">
            {[
              { step: "01", key: "step1", delay: 0 },
              { step: "02", key: "step2", delay: 100 },
              { step: "03", key: "step3", delay: 200 },
            ].map((item) => (
              <ScrollReveal key={item.step} delay={item.delay}>
                {/* Hover styling lives in globals.css — this is a server
                    component, so it cannot pass event handlers. */}
                <div className="step-card rounded-3xl p-[clamp(1.5rem,3vw,2.5rem)] backdrop-blur-[8px]">
                  <div className="mb-4 font-mono text-[clamp(2.5rem,5vw,4rem)] font-normal leading-none text-accent opacity-70">
                    {item.step}
                  </div>
                  <h3 className="mb-3 font-display text-fluid-xl font-normal tracking-[-0.02em] text-white">
                    {t(`${item.key}Title`)}
                  </h3>
                  <p className="text-fluid-base leading-[1.65] text-white/65">
                    {t(`${item.key}Body`)}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={300}>
            <div className="mt-[clamp(2rem,4vw,3.5rem)] text-center">
              <Link href={ROUTES.howItWorks} className="btn btn-ghost btn-lg">
                {t("fullGuide")} <ChevronRight size={16} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 4: WHY ZURIDRIVE — value props in editorial layout          */}
      {/* ================================================================== */}
      <section className="bg-sand py-[clamp(4rem,8vw,7rem)]">
        <div className="container">
          {/* Header — left aligned, not centered */}
          <ScrollReveal>
            <div className="mb-[clamp(2.5rem,5vw,4rem)] max-w-[36ch]">
              <span className="label mb-3 block text-brand">
                ◆ {t("whyZuriDrive")}
              </span>
              <h2 className="font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
                {t("builtForRwanda")}
              </h2>
            </div>
          </ScrollReveal>

          {/* Props — asymmetric 2-column grid */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
            {[
              { icon: <Shield size={22} />, key: "prop1", delay: 0 },
              { icon: <Clock size={22} />, key: "prop2", delay: 80 },
              { icon: <MapPin size={22} />, key: "prop3", delay: 160 },
              { icon: <Star size={22} />, key: "prop4", delay: 240 },
              { icon: <TrendingUp size={22} />, key: "prop5", delay: 320 },
              { icon: <Users size={22} />, key: "prop6", delay: 400 },
            ].map((prop) => (
              <ScrollReveal key={prop.key} delay={prop.delay}>
                {/* Hover styling lives in globals.css — see note above. */}
                <div className="prop-card rounded-3xl p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sand text-brand">
                    {prop.icon}
                  </div>
                  <h3 className="mb-2 font-sans text-fluid-base font-bold tracking-[-0.01em] text-ink">
                    {t(`${prop.key}Title`)}
                  </h3>
                  <p className="text-fluid-sm leading-[1.65] text-ink-soft">
                    {t(`${prop.key}Body`)}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================== */}
      {/* SECTION 5: BECOME AN OWNER CTA                                      */}
      {/* Asymmetric split — left text, right visual                          */}
      {/* ================================================================== */}
      <section className="bg-bone py-[clamp(4rem,8vw,7rem)]">
        <div className="container">
          <ScrollReveal>
            <div className="relative grid grid-cols-[1fr_auto] gap-0 overflow-hidden rounded-3xl bg-brand">
              {/* Left — text content */}
              <div className="relative z-[1] p-[clamp(2.5rem,5vw,4.5rem)]">
                <span className="label mb-4 block text-accent">
                  ◆ {t("forCarOwners")}
                </span>
                <h2 className="mb-5 max-w-[20ch] font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-white [text-wrap:balance]">
                  {t("earnsWhileYouSleep")}
                </h2>
                <p className="mb-8 max-w-[48ch] text-fluid-base leading-[1.7] text-white/[0.72]">
                  {t("ownerPitch")}
                </p>

                {/* What cars list for, and what the owner keeps. Both read
                    from live data — see getListedPriceRange. The price half
                    disappears when nothing is listed rather than showing an
                    empty range. */}
                <div className="mb-8 inline-flex flex-wrap gap-6 rounded-3xl border border-white/15 bg-white/[0.08] px-6 py-4">
                  {priceRange && (
                    <>
                      <div>
                        <div className="font-display text-fluid-2xl font-semibold leading-none text-accent">
                          {priceRange.min === priceRange.max
                            ? formatRWF(priceRange.min)
                            : t("priceRange", {
                                min: formatRWF(priceRange.min),
                                max: formatRWF(priceRange.max),
                              })}
                        </div>
                        <div className="mt-1 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/55">
                          {t("listedPerDay")}
                        </div>
                      </div>
                      <div className="w-px self-stretch bg-white/15" />
                    </>
                  )}
                  <div>
                    <div className="font-display text-fluid-2xl font-semibold leading-none text-white">
                      {ownerSharePercent}%
                    </div>
                    <div className="mt-1 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/55">
                      {t("youKeep")}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link href={ROUTES.signupOwner} className="btn btn-accent btn-lg">
                    {t("startEarning")}
                  </Link>
                  <Link href={ROUTES.becomeAnOwner} className="btn btn-ghost btn-lg">
                    {t("learnMore")}
                  </Link>
                </div>
              </div>

              {/* Right — decorative pattern */}
              {/* The layered gradient + hatch pattern stays an arbitrary value:
                  Tailwind has no repeating-linear-gradient utility, and
                  approximating it would change the texture. */}
              <div className="hide-mobile relative w-[280px] overflow-hidden bg-[linear-gradient(135deg,rgba(212,160,23,0.15)_0%,transparent_60%),repeating-linear-gradient(45deg,rgba(255,255,255,0.02)_0px,rgba(255,255,255,0.02)_1px,transparent_1px,transparent_12px)]">
                <div className="absolute -bottom-10 -right-10 h-[300px] w-[300px] rounded-full border border-accent/20" />
                <div className="absolute bottom-5 right-5 h-[200px] w-[200px] rounded-full border border-accent/15" />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <Footer />
    </div>
  );
}
