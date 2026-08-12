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
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import HeroSearch from "@/components/hero-search";
import CarCardGrid from "@/components/car-card-grid";
import ScrollReveal from "@/components/scroll-reveal";
import { prisma } from "@/lib/prisma";
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

// Platform stats — shown in hero
async function getStats() {
  try {
    const [carCount, bookingCount, ownerCount] = await Promise.all([
      prisma.car.count({ where: { status: "LIVE" } }),
      prisma.booking.count({ where: { status: "COMPLETED" } }),
      prisma.carOwnerProfile.count(),
    ]);
    return { carCount, bookingCount, ownerCount };
  } catch {
    return { carCount: 120, bookingCount: 850, ownerCount: 65 };
  }
}

export default async function HomePage() {
  // Banner first — the main grid excludes whatever it takes, so no car
  // appears twice on the page.
  const bannerCars = await getBannerCars();
  const [cars, stats] = await Promise.all([
    getHomepageCars(bannerCars.map((c) => c.id)),
    getStats(),
  ]);

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
          {/* Stats strip — top-left */}
          <div className="mb-[clamp(1.5rem,3vw,2.5rem)] flex animate-[fadeIn_0.8s_ease_0.2s_both] gap-[clamp(1rem,4vw,3rem)]">
            {[
              { value: `${stats.carCount}+`, label: "Cars available" },
              { value: `${stats.bookingCount}+`, label: "Trips completed" },
              { value: `${stats.ownerCount}+`, label: "Trusted owners" },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="font-display text-fluid-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-white">
                  {stat.value}
                </div>
                <div className="mt-[0.15rem] font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/60">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>

          {/* Main headline */}
          <h1 className="mb-[clamp(1.5rem,3vw,2.5rem)] max-w-[14ch] animate-[slideUp_0.7s_ease_0.1s_both] font-display text-fluid-hero font-light leading-[0.92] tracking-[-0.04em] text-white [text-wrap:balance]">
            Rwanda&apos;s roads,{" "}
            <em className="italic text-accent">
              your way.
            </em>
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
                  ◆ Available now
                </span>
                <h2 className="font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
                  Cars you&apos;ll actually want to drive
                </h2>
              </div>
              <Link
                href={ROUTES.cars}
                className="flex items-center gap-1.5 whitespace-nowrap border-b-[1.5px] border-brand pb-0.5 text-fluid-sm font-semibold tracking-[0.01em] text-brand no-underline"
              >
                View all cars <ArrowRight size={14} />
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
                    Spotlight — featured by our Premium owners
                  </span>
                </div>
                <CarCardGrid cars={bannerCars} />
              </div>
            </ScrollReveal>
          )}

          <CarCardGrid cars={cars} />
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
                ◆ Simple process
              </span>
              <h2 className="font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-white">
                From search to keys in minutes
              </h2>
            </div>
          </ScrollReveal>

          {/* Steps — horizontal on desktop, vertical on mobile */}
          <div className="relative grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[clamp(1.5rem,3vw,2.5rem)]">
            {[
              {
                step: "01",
                title: "Search & Filter",
                body: "Browse by location, dates, car type, and budget. Every car is verified by our team.",
                delay: 0,
              },
              {
                step: "02",
                title: "Book & Pay Securely",
                body: "Pay via MTN Mobile Money or bank transfer. Booking confirmed only after payment clears.",
                delay: 100,
              },
              {
                step: "03",
                title: "Pick Up & Drive",
                body: "Meet your owner, do a quick walk-around, upload condition photos, and you're off.",
                delay: 200,
              },
            ].map((item) => (
              <ScrollReveal key={item.step} delay={item.delay}>
                {/* Hover styling lives in globals.css — this is a server
                    component, so it cannot pass event handlers. */}
                <div className="step-card rounded-3xl p-[clamp(1.5rem,3vw,2.5rem)] backdrop-blur-[8px]">
                  <div className="mb-4 font-mono text-[clamp(2.5rem,5vw,4rem)] font-normal leading-none text-accent opacity-70">
                    {item.step}
                  </div>
                  <h3 className="mb-3 font-display text-fluid-xl font-normal tracking-[-0.02em] text-white">
                    {item.title}
                  </h3>
                  <p className="text-fluid-base leading-[1.65] text-white/65">
                    {item.body}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <ScrollReveal delay={300}>
            <div className="mt-[clamp(2rem,4vw,3.5rem)] text-center">
              <Link href={ROUTES.howItWorks} className="btn btn-ghost btn-lg">
                Full guide <ChevronRight size={16} />
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
                ◆ Why ZuriDrive
              </span>
              <h2 className="font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
                Built for Rwanda. Trusted by thousands.
              </h2>
            </div>
          </ScrollReveal>

          {/* Props — asymmetric 2-column grid */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-6">
            {[
              {
                icon: <Shield size={22} />,
                title: "Verified Cars & Owners",
                body: "Every car and owner is reviewed before going live. You rent with confidence, every time.",
                delay: 0,
              },
              {
                icon: <Clock size={22} />,
                title: "Confirmed in Minutes",
                body: "Owners respond within 2 hours or the platform auto-confirms. No waiting, no uncertainty.",
                delay: 80,
              },
              {
                icon: <MapPin size={22} />,
                title: "Flexible Pickup",
                body: "Airport, hotel, your neighborhood — choose from trusted pickup points or set your own location.",
                delay: 160,
              },
              {
                icon: <Star size={22} />,
                title: "Transparent Reviews",
                body: "Real ratings across 4 categories from verified renters only. No fake reviews, ever.",
                delay: 240,
              },
              {
                icon: <TrendingUp size={22} />,
                title: "Secure Payments",
                body: "MTN Mobile Money and bank transfer. Your deposit is held separately and returned after a safe trip.",
                delay: 320,
              },
              {
                icon: <Users size={22} />,
                title: "Built on Trust",
                body: "Condition photos, fuel policies, and dispute resolution — every trip is fully documented.",
                delay: 400,
              },
            ].map((prop) => (
              <ScrollReveal key={prop.title} delay={prop.delay}>
                {/* Hover styling lives in globals.css — see note above. */}
                <div className="prop-card rounded-3xl p-6">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sand text-brand">
                    {prop.icon}
                  </div>
                  <h3 className="mb-2 font-sans text-fluid-base font-bold tracking-[-0.01em] text-ink">
                    {prop.title}
                  </h3>
                  <p className="text-fluid-sm leading-[1.65] text-ink-soft">
                    {prop.body}
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
                  ◆ For car owners
                </span>
                <h2 className="mb-5 max-w-[20ch] font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-white [text-wrap:balance]">
                  Your car earns while you sleep.
                </h2>
                <p className="mb-8 max-w-[48ch] text-fluid-base leading-[1.7] text-white/[0.72]">
                  List your car on ZuriDrive and connect with renters across Rwanda.
                  You control availability, pricing, and pickup locations. We collect
                  the payment, hold the damage deposit, and keep a photo record of every
                  trip. You keep 80% of every booking.
                </p>

                {/* Earnings highlight */}
                <div className="mb-8 inline-flex flex-wrap gap-6 rounded-3xl border border-white/15 bg-white/[0.08] px-6 py-4">
                  <div>
                    <div className="font-display text-fluid-2xl font-semibold leading-none text-accent">
                      {formatRWF(450000)}
                    </div>
                    <div className="mt-1 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/55">
                      Avg. monthly earnings
                    </div>
                  </div>
                  <div className="w-px self-stretch bg-white/15" />
                  <div>
                    <div className="font-display text-fluid-2xl font-semibold leading-none text-white">
                      80%
                    </div>
                    <div className="mt-1 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/55">
                      You keep of every booking
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link href={ROUTES.signupOwner} className="btn btn-accent btn-lg">
                    Start earning today
                  </Link>
                  <Link href={ROUTES.becomeAnOwner} className="btn btn-ghost btn-lg">
                    Learn more
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
