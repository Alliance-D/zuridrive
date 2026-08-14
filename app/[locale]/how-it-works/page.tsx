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

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}): Promise<Metadata> {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "nav",
  });
  return { title: t("howItWorks") };
}

export default async function HowItWorksPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "howItWorks",
  });
  const tdep = await getTranslations({
    locale: params.locale,
    namespace: "deposit",
  });
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
              ◆ {t("eyebrow")}
            </span>
            <h1 className="mb-6 font-display text-fluid-4xl font-normal leading-[0.95] tracking-[-0.04em] text-ink [text-wrap:balance]">
              {t("heroTitle")}
            </h1>
            <p className="max-w-[56ch] text-fluid-lg leading-[1.7] text-ink-soft">
              {t("heroSub")}
            </p>
          </ScrollReveal>

          {/* Tab nav */}
          <div className="mt-8 flex gap-3">
            <a href="#renters" className="btn btn-primary">{t("tabRenters")}</a>
            <a href="#owners" className="btn btn-secondary">{t("tabOwners")}</a>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOR RENTERS                                                        */}
      {/* ================================================================ */}
      <section id="renters" className="bg-bone py-[clamp(4rem,8vw,7rem)]">
        <div className="container">
          <ScrollReveal>
            <SectionLabel>{t("tabRenters")}</SectionLabel>
            <SectionTitle>{t("rentersHeading")}</SectionTitle>
          </ScrollReveal>

          <div className="mt-[clamp(2rem,4vw,3.5rem)]">
            {[
              {
                icon: <Search size={22} />,
                step: "01",
                titleKey: "r1Title",
                bodyKey: "r1Body",
                delay: 0,
              },
              {
                icon: <Car size={22} />,
                step: "02",
                titleKey: "r2Title",
                bodyKey: "r2Body",
                delay: 80,
              },
              {
                icon: <FileText size={22} />,
                step: "03",
                titleKey: "r3Title",
                bodyKey: "r3Body",
                delay: 160,
              },
              {
                icon: <CreditCard size={22} />,
                step: "04",
                titleKey: "r4Title",
                bodyKey: "r4Body",
                delay: 240,
              },
              {
                icon: <CheckCircle size={22} />,
                step: "05",
                titleKey: "r5Title",
                bodyKey: "r5Body",
                delay: 320,
              },
            ].map((step) => (
              <ScrollReveal key={step.step} delay={step.delay}>
                <StepRow
                  icon={step.icon}
                  step={step.step}
                  title={t(step.titleKey)}
                  body={t(step.bodyKey)}
                />
              </ScrollReveal>
            ))}
          </div>

          {/* Deposit & pricing explainer */}
          <ScrollReveal>
            <div className="mt-[clamp(2.5rem,5vw,4rem)] grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-5">
              <InfoCard
                icon={<Shield size={20} />}
                title={t("depositCardTitle")}
                body={`${t("depositCardIntro")} ${tdep(getDepositCopy().explanationKey)}`}
                accent="green"
              />
              <InfoCard
                icon={<Fuel size={20} />}
                title={t("fuelCardTitle")}
                id="fuel"
                body={t("fuelCardBody")}
                accent="blue"
              />
              <InfoCard
                icon={<MapPin size={20} />}
                title={t("pickupCardTitle")}
                body={t("pickupCardBody")}
                accent="gold"
              />
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-8 text-center">
              <Link href={ROUTES.cars} className="btn btn-primary btn-xl">
                {t("browseCars")} <ArrowRight size={16} />
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
            <SectionLabel>{t("tabOwners")}</SectionLabel>
            <SectionTitle>{t("ownersHeading")}</SectionTitle>
          </ScrollReveal>

          <div className="mt-[clamp(2rem,4vw,3.5rem)]">
            {[
              {
                icon: <Users size={22} />,
                step: "01",
                titleKey: "o1Title",
                bodyKey: "o1Body",
                delay: 0,
              },
              {
                icon: <Car size={22} />,
                step: "02",
                titleKey: "o2Title",
                bodyKey: "o2Body",
                delay: 80,
              },
              {
                icon: <Clock size={22} />,
                step: "03",
                titleKey: "o3Title",
                bodyKey: "o3Body",
                delay: 160,
              },
              {
                icon: <Camera size={22} />,
                step: "04",
                titleKey: "o4Title",
                bodyKey: "o4Body",
                delay: 240,
              },
              {
                icon: <DollarSign size={22} />,
                step: "05",
                titleKey: "o5Title",
                bodyKey: "o5Body",
                delay: 320,
              },
            ].map((step) => (
              <ScrollReveal key={step.step} delay={step.delay}>
                <StepRow
                  icon={step.icon}
                  step={step.step}
                  title={t(step.titleKey)}
                  body={t(step.bodyKey)}
                  reversed
                />
              </ScrollReveal>
            ))}
          </div>

          {/* Commission breakdown */}
          <ScrollReveal>
            <div className="mt-[clamp(2.5rem,5vw,4rem)] rounded-3xl bg-brand p-[clamp(2rem,4vw,3.5rem)]">
              <h3 className="mb-4 font-display text-fluid-2xl font-normal tracking-[-0.02em] text-white">
                {t("honestBreakdown")}
              </h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
                {[
                  { key: "row1", color: "var(--color-accent)" },
                  { key: "row2", color: "white" },
                  { key: "row3", color: "rgba(255,255,255,0.6)" },
                ].map((row) => (
                  <div
                    key={row.key}
                    className="rounded-2xl border border-white/[0.12] bg-white/[0.08] p-4"
                  >
                    <p className="mb-2 font-mono text-fluid-xs uppercase tracking-[0.08em] text-white/50">
                      {t(`${row.key}Label`)}
                    </p>
                    {/* row.color varies per row (accent / white / dimmed), so it
                        stays an inline value — it is data, not styling. */}
                    <p
                      className="mb-1 font-display text-fluid-xl font-semibold"
                      style={{ color: row.color }}
                    >
                      {t(`${row.key}Pct`)}
                    </p>
                    <p className="text-fluid-xs text-white/50">{t(`${row.key}Note`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link href={ROUTES.signupOwner} className="btn btn-accent btn-xl">
                {t("listToday")}
              </Link>
              <Link href={ROUTES.becomeAnOwner} className="btn btn-secondary btn-xl">
                {t("seePlans")}
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
            <SectionTitle>{t("protectionsHeading")}</SectionTitle>
          </ScrollReveal>
          <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-5">
            <InfoCard
              icon={<Star size={20} />}
              title={t("reviewsCardTitle")}
              body={t("reviewsCardBody")}
              accent="gold"
            />
            <InfoCard
              icon={<Shield size={20} />}
              title={t("disputeCardTitle")}
              body={t("disputeCardBody")}
              accent="green"
            />
            <InfoCard
              icon={<Camera size={20} />}
              title={t("photoCardTitle")}
              body={t("photoCardBody")}
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
