/**
 * /become-an-owner — the pitch to prospective car owners.
 *
 * Rewritten because almost every factual claim on the previous version was
 * wrong, and two of them were dangerous:
 *
 *  • THE PLANS WERE INVENTED. It advertised "Starter (free, 1 car)",
 *    "Professional (15,000, 3 cars)" and "Enterprise (50,000, 10 cars)". The
 *    real plans are Basic, Pro and Premium at different prices with different
 *    listing counts. Someone signing up for what they read here would have got
 *    something else. The plans are now read from the database, so this page
 *    cannot drift from what owners are actually charged.
 *
 *  • IT PROMISED INSURANCE. "Protected & Insured — full coverage" directly
 *    contradicts /terms, which says ZuriDrive "is not a substitute for
 *    insurance" and requires the OWNER to insure their own vehicle. Marketing
 *    that contradicts your legal terms is a liability, so it is gone.
 *
 *  • It also advertised per-plan commission discounts ("reduced commission
 *    12%"). SubscriptionPlan has no commission field — the rate is platform
 *    wide. That claim was unimplementable, not merely inaccurate.
 *
 * Also dropped: "join thousands of car owners", which is not true.
 */

import Link from "next/link";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import { prisma } from "@/lib/db";
import { formatRWF } from "@/lib/currency";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  Wallet,
  LayoutDashboard,
  CalendarClock,
  ShieldCheck,
  Star,
  BadgeCheck,
  Check,
} from "lucide-react";

export const metadata = {
  title: "List your car — ZuriDrive",
  description:
    "Earn from your car when you are not using it. Choose a plan, list in minutes, and keep control of who drives it.",
};

const BENEFITS = [
  {
    icon: Wallet,
    title: "Earn when it would be parked",
    desc: "Most private cars sit unused most of the week. Set your rates and rent it out on the days that suit you.",
  },
  {
    icon: CalendarClock,
    title: "You choose the days",
    desc: "Set your own availability and minimum rental length. Nothing gets booked on a day you have blocked.",
  },
  {
    icon: ShieldCheck,
    title: "Every trip is documented",
    desc: "Both sides upload condition photos and the fuel gauge before and after. Disputes are settled against that record.",
  },
  {
    icon: LayoutDashboard,
    title: "One dashboard",
    desc: "Bookings, earnings, payouts and reviews in one place, with the numbers behind each of them.",
  },
  {
    icon: Star,
    title: "Reviews you can answer",
    desc: "Renters review the trip. Honest reviews stay up — we only hide abuse, spam or personal information.",
  },
  {
    icon: BadgeCheck,
    title: "Approved renters",
    desc: "Renters have a verified phone number, and you confirm each request before the car goes anywhere.",
  },
];

export default async function BecomeAnOwnerPage() {
  const [plans, settings] = await Promise.all([
    prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: "asc" },
    }),
    getPlatformSettings(),
  ]);

  return (
    <div className="min-h-screen bg-bone">
      <Navbar />

      {/* Hero — light, so the nav renders its dark variant over it. */}
      <section className="border-b border-sand-dark bg-sand/40 px-4 py-16 text-center">
        <h1 className="mx-auto max-w-3xl font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
          List your car. Earn on the days you don&apos;t need it.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-ink-muted">
          Set your own rates and availability, approve every booking, and get
          paid after each completed trip.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup/owner"
            className="rounded-full bg-brand px-7 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-dark"
          >
            List your car
          </Link>
          <Link
            href="/how-it-works"
            className="rounded-full border border-sand-darker px-7 py-3 text-sm font-semibold text-ink transition-colors hover:bg-sand"
          >
            See how it works
          </Link>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div
                key={b.title}
                className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-sand-dark"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10">
                  <Icon className="h-5 w-5 text-brand" />
                </div>
                <h3 className="mb-1.5 font-semibold text-ink">{b.title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">
                  {b.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Plans — straight from the database */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-center font-display text-3xl font-semibold text-ink">
          Choose a plan
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-center text-sm text-ink-muted">
          A plan is what lets you keep listings live. ZuriDrive also takes{" "}
          {settings.commissionRatePercent}% commission on the rental itself —
          never on delivery fees, and never on a damage deposit.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const highlight = plan.tier === "PRO";
            return (
              <div
                key={plan.id}
                className={`flex flex-col rounded-2xl bg-white p-6 ${
                  highlight
                    ? "shadow-md ring-2 ring-brand"
                    : "shadow-sm ring-1 ring-sand-dark"
                }`}
              >
                {highlight && (
                  <span className="mb-3 self-start rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                    Most popular
                  </span>
                )}

                <h3 className="font-display text-2xl font-semibold text-ink">
                  {plan.name}
                </h3>

                <p className="mt-2 text-3xl font-semibold text-brand">
                  {formatRWF(plan.priceMonthly)}
                  <span className="text-sm font-normal text-ink-soft">
                    {" "}
                    /month
                  </span>
                </p>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-ink-muted">
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {plan.maxListings === null
                      ? "Unlimited listings"
                      : `Up to ${plan.maxListings} ${
                          plan.maxListings === 1 ? "listing" : "listings"
                        }`}
                  </li>
                  <li className="flex gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {plan.analyticsLevel === "FULL"
                      ? "Full analytics"
                      : plan.analyticsLevel === "ADVANCED"
                        ? "Advanced analytics"
                        : "Basic analytics"}
                  </li>
                  {plan.isFeatured && (
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      {plan.featuredPriority === 1
                        ? "Top placement in search"
                        : "Featured in search results"}
                    </li>
                  )}
                  {plan.hasVerifiedBadge && (
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      Verified badge on your listings
                    </li>
                  )}
                  {plan.hasHomepageBanner && (
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      Homepage banner placement
                    </li>
                  )}
                  {plan.hasPrioritySupport && (
                    <li className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                      Priority support
                    </li>
                  )}
                </ul>

                {/* This used to be a <button> with no handler at all — three
                    dead buttons on the one page a prospective owner lands on. */}
                <Link
                  href={`/signup/owner?plan=${plan.tier}`}
                  className={`mt-6 block rounded-full px-5 py-2.5 text-center text-sm font-semibold transition-colors ${
                    highlight
                      ? "bg-brand text-white hover:bg-brand-dark"
                      : "border border-brand text-brand hover:bg-brand/5"
                  }`}
                >
                  Get started
                </Link>
              </div>
            );
          })}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-ink-faint">
          You keep your own insurance and remain the vehicle&apos;s owner
          throughout. See the{" "}
          <Link href="/terms" className="underline hover:text-ink">
            terms
          </Link>{" "}
          for what each side is responsible for.
        </p>
      </section>

      <Footer />
    </div>
  );
}
