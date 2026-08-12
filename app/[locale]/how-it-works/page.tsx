// =============================================================================
// ZuriDrive — How It Works Page (/how-it-works)
// Server component — static content, no data fetching
// Two sections: For Renters, For Owners
// =============================================================================

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getDepositCopy } from "@/lib/deposit-copy";
import Link from "next/link";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import ScrollReveal from "@/components/scroll-reveal";
import { ROUTES } from "@/lib/routes";
import {
  Search, CreditCard, Car, Camera, CheckCircle, Shield,
  Star, DollarSign, Users, FileText, MapPin, Clock,
  ArrowRight, Fuel
} from "lucide-react";

export const metadata: Metadata = {
  title: "How It Works",
  description: "Learn how ZuriDrive works — for renters and car owners in Rwanda.",
};

export default async function HowItWorksPage() {
  const tdep = await getTranslations("deposit");
  return (
    <div className="min-h-screen bg-bone">
      <Navbar />

      {/* ================================================================ */}
      {/* HERO — minimal, typographic                                       */}
      {/* ================================================================ */}
      <section className="border-b border-sand-light bg-sand pb-[clamp(3rem,6vw,5rem)] pt-[calc(var(--nav-height)_+_clamp(4rem,8vw,6rem))]">
        <div className="container max-w-[760px]">
          <ScrollReveal>
            <span className="label mb-4 block text-brand">
              ◆ The full picture
            </span>
            <h1 className="mb-6 font-display text-fluid-4xl font-normal leading-[0.95] tracking-[-0.04em] text-ink [text-wrap:balance]">
              Everything you need to know about ZuriDrive
            </h1>
            <p className="max-w-[56ch] text-fluid-lg leading-[1.7] text-ink-soft">
              Whether you&apos;re renting a car or listing yours, we&apos;ve built ZuriDrive
              to be transparent, secure, and straightforward.
            </p>
          </ScrollReveal>

          {/* Tab nav */}
          <div className="mt-8 flex gap-3">
            <a href="#renters" className="btn btn-primary">For Renters</a>
            <a href="#owners" className="btn btn-secondary">For Car Owners</a>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOR RENTERS                                                        */}
      {/* ================================================================ */}
      <section id="renters" className="bg-bone py-[clamp(4rem,8vw,7rem)]">
        <div className="container">
          <ScrollReveal>
            <SectionLabel>For Renters</SectionLabel>
            <SectionTitle>Renting a car in 5 steps</SectionTitle>
          </ScrollReveal>

          <div className="mt-[clamp(2rem,4vw,3.5rem)]">
            {[
              {
                icon: <Search size={22} />,
                step: "01",
                title: "Search & Filter",
                body: "Browse cars by pickup location, date range, and rental type (daily, weekly, or monthly). Filter by car category, transmission, price range, and whether you need a driver. Featured and verified cars appear first.",
                delay: 0,
              },
              {
                icon: <Car size={22} />,
                step: "02",
                title: "Choose Your Car",
                body: "Each listing shows the full pricing breakdown — daily in-city, outside city, weekly, and monthly rates. You'll see the fuel policy, damage deposit, available pickup locations, and the owner's response time badge.",
                delay: 80,
              },
              {
                icon: <FileText size={22} />,
                step: "03",
                title: "Enter Your Details",
                body: "Returning users are pre-filled. First-timers enter their name and phone number and pick a password. Your account is created as you book — no separate signup step.",
                delay: 160,
              },
              {
                icon: <CreditCard size={22} />,
                step: "04",
                title: "Pay Securely",
                body: "Choose MTN Mobile Money (USSD push to your phone) or bank transfer (upload proof, confirmed by our finance team). Your booking is confirmed only after payment fully clears — never on initiation alone.",
                delay: 240,
              },
              {
                icon: <CheckCircle size={22} />,
                step: "05",
                title: "Pick Up & Drive",
                body: "Your owner confirms within 2 hours (or it auto-confirms). You both upload pre-trip condition photos including the fuel gauge. Return the car, upload post-trip photos, and your deposit is released automatically.",
                delay: 320,
              },
            ].map((step) => (
              <ScrollReveal key={step.step} delay={step.delay}>
                <StepRow
                  icon={step.icon}
                  step={step.step}
                  title={step.title}
                  body={step.body}
                />
              </ScrollReveal>
            ))}
          </div>

          {/* Deposit & pricing explainer */}
          <ScrollReveal>
            <div className="mt-[clamp(2.5rem,5vw,4rem)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
              <InfoCard
                icon={<Shield size={20} />}
                title="About the deposit"
                body={`The damage deposit is completely separate from your rental payment, and never subject to commission or platform fees. ${tdep(getDepositCopy().explanationKey)}`}
                accent="green"
              />
              <InfoCard
                icon={<Fuel size={20} />}
                title="Fuel policies"
                id="fuel"
                body="Each car has a clearly stated fuel policy: Full to Full, Same Level, Free Tank, or Owner Handles. The policy is shown prominently on the listing and booking pages — no surprises."
                accent="blue"
              />
              <InfoCard
                icon={<MapPin size={20} />}
                title="Pickup locations"
                body="Choose from platform-verified locations (airports, hotels), owner custom pickup points, or describe your own location. Maps are always optional — never forced."
                accent="gold"
              />
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-8 text-center">
              <Link href={ROUTES.cars} className="btn btn-primary btn-xl">
                Browse available cars <ArrowRight size={16} />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOR OWNERS                                                         */}
      {/* ================================================================ */}
      <section id="owners" className="border-t border-sand-light bg-sand py-[clamp(4rem,8vw,7rem)]">
        <div className="container">
          <ScrollReveal>
            <SectionLabel>For Car Owners</SectionLabel>
            <SectionTitle>Start earning from your car</SectionTitle>
          </ScrollReveal>

          <div className="mt-[clamp(2rem,4vw,3.5rem)]">
            {[
              {
                icon: <Users size={22} />,
                step: "01",
                title: "Complete Your Profile",
                body: "Set up your owner profile with your name and phone, then add payout details — MTN MoMo or a bank account. Payout details are required before you can list. Then choose your subscription plan: Basic, Pro, or Premium.",
                delay: 0,
              },
              {
                icon: <Car size={22} />,
                step: "02",
                title: "List Your Car",
                body: "A guided 5-step form walks you through: basic info, photos (3–10), pricing for all periods, availability calendar, and pickup locations. Save as draft and return anytime. Draft auto-saves every 60 seconds.",
                delay: 80,
              },
              {
                icon: <Clock size={22} />,
                step: "03",
                title: "Accept Bookings",
                body: "You get an SMS when a booking request arrives. Accept or reject within 2 hours — if you don't respond, it auto-confirms (great for your response time badge). Set your own cancellation rules.",
                delay: 160,
              },
              {
                icon: <Camera size={22} />,
                step: "04",
                title: "Document Every Trip",
                body: "Both you and the renter upload condition photos before and after every trip — exterior, interior, and fuel gauge. Photos are kept for 3 days after completion, then automatically deleted.",
                delay: 240,
              },
              {
                icon: <DollarSign size={22} />,
                step: "05",
                title: "Request Your Payout",
                body: "Once a trip completes, request a payout from your dashboard. Our finance team sends money via MoMo or bank transfer within 24 hours and uploads proof. You keep 80% of every booking.",
                delay: 320,
              },
            ].map((step) => (
              <ScrollReveal key={step.step} delay={step.delay}>
                <StepRow
                  icon={step.icon}
                  step={step.step}
                  title={step.title}
                  body={step.body}
                  reversed
                />
              </ScrollReveal>
            ))}
          </div>

          {/* Commission breakdown */}
          <ScrollReveal>
            <div className="mt-[clamp(2.5rem,5vw,4rem)] rounded-3xl bg-brand p-[clamp(2rem,4vw,3.5rem)]">
              <h3 className="mb-4 font-display text-fluid-2xl font-normal tracking-[-0.02em] text-white">
                The honest breakdown
              </h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
                {[
                  { label: "Base rental + driver", note: "Commission applies", pct: "80% to you", color: "var(--color-accent)" },
                  { label: "Delivery fees", note: "No commission", pct: "100% to you", color: "white" },
                  { label: "Damage deposit", note: "Never commissionable", pct: "100% to client", color: "rgba(255,255,255,0.6)" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="rounded-2xl border border-white/[0.12] bg-white/[0.08] p-4"
                  >
                    <p className="mb-2 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/50">
                      {row.label}
                    </p>
                    {/* row.color varies per row (accent / white / dimmed), so it
                        stays an inline value — it is data, not styling. */}
                    <p
                      className="mb-1 font-display text-fluid-xl font-semibold"
                      style={{ color: row.color }}
                    >
                      {row.pct}
                    </p>
                    <p className="text-fluid-xs text-white/50">{row.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href={ROUTES.signupOwner} className="btn btn-accent btn-xl">
                List your car today
              </Link>
              <Link href={ROUTES.becomeAnOwner} className="btn btn-secondary btn-xl">
                See subscription plans
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ================================================================ */}
      {/* REVIEWS / DISPUTES / SUPPORT                                      */}
      {/* ================================================================ */}
      <section className="border-t border-sand-light bg-bone py-[clamp(4rem,8vw,6rem)]">
        <div className="container">
          <ScrollReveal>
            <SectionTitle>Protections for everyone</SectionTitle>
          </ScrollReveal>
          <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            <InfoCard
              icon={<Star size={20} />}
              title="Verified reviews only"
              body="Only clients who completed a booking for that exact car can leave a review. Ratings cover cleanliness, comfort, value, and owner communication."
              accent="gold"
            />
            <InfoCard
              icon={<Shield size={20} />}
              title="Dispute resolution"
              body="Either party can raise a dispute. Our team reviews condition photos and fuel gauge records and resolves within 48 hours. Deposit is held until resolved."
              accent="green"
            />
            <InfoCard
              icon={<Camera size={20} />}
              title="Photo documentation"
              body="Pre and post-trip photos are required for both parties. Condition photos are stored for 3 days after a completed trip, or until a dispute is fully resolved."
              accent="blue"
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

// --------------------------------------------------------------------------
// SUB-COMPONENTS
// --------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="label mb-3 block text-brand">
      ◆ {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="max-w-[24ch] font-display text-fluid-3xl font-normal leading-[1.1] tracking-[-0.03em] text-ink">
      {children}
    </h2>
  );
}

function StepRow({
  icon, step, title, body, reversed = false,
}: {
  icon: React.ReactNode;
  step: string;
  title: string;
  body: string;
  reversed?: boolean;
}) {
  return (
    <div className="mb-6 grid grid-cols-[80px_1fr] items-start gap-6 border-b border-sand-light pb-6">
      {/* Step number + icon */}
      <div className="text-center">
        {/* `reversed` flips this from a filled brand tile to an outlined white
            one, so the variant classes are conditional rather than static. */}
        <div
          className={`mx-auto mb-2 flex h-[52px] w-[52px] items-center justify-center rounded-2xl ${
            reversed
              ? "border-[1.5px] border-sand-edge bg-white text-brand"
              : "bg-brand text-white"
          }`}
        >
          {icon}
        </div>
        <span className="font-mono text-fluid-xs tracking-[0.06em] text-ink-faint">
          {step}
        </span>
      </div>

      {/* Content */}
      <div className="pt-1.5">
        <h3 className="mb-3 font-sans text-fluid-lg font-bold tracking-[-0.02em] text-ink">
          {title}
        </h3>
        <p className="max-w-[64ch] text-fluid-base leading-[1.7] text-ink-soft">
          {body}
        </p>
      </div>
    </div>
  );
}

function InfoCard({
  icon, title, body, accent, id,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: "green" | "blue" | "gold";
  id?: string;
}) {
  // Three decorative accent pairs. These are not brand tokens — they are a
  // mint/sky/amber trio used only here — so they stay literal rather than being
  // bent onto success/warning, which are different colours with a meaning.
  const accentClasses = {
    green: "bg-[#D1FAE5] text-[#065F46]",
    blue: "bg-[#DBEAFE] text-[#1E40AF]",
    gold: "bg-[#FEF3C7] text-[#92400E]",
  };

  return (
    <div
      id={id}
      className="rounded-3xl border border-sand-light bg-white p-6"
    >
      <div
        className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${accentClasses[accent]}`}
      >
        {icon}
      </div>
      <h3 className="mb-2 text-fluid-base font-bold tracking-[-0.01em]">
        {title}
      </h3>
      <p className="text-fluid-sm leading-[1.7] text-ink-soft">
        {body}
      </p>
    </div>
  );
}
