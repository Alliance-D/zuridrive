// =============================================================================
// ZuriDrive — Prose page shell
//
// Shared chrome for the long-form pages: legal, help, about, contact.
// Keeps them visually identical to the rest of the marketing site without
// each page re-declaring the hero, container widths and footer.
//
// LEGAL PAGES: set `needsReview` while a policy is still a draft. It renders a
// visible banner so an unreviewed policy cannot quietly go live looking
// authoritative. Remove the prop once a Rwandan lawyer has signed the text off.
// =============================================================================

import type { ReactNode } from "react";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import ScrollReveal from "@/components/scroll-reveal";
import { AlertTriangle } from "lucide-react";

export default function ProsePage({
  eyebrow,
  title,
  intro,
  updated,
  needsReview = false,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  /** Human-readable date this text last changed. */
  updated?: string;
  needsReview?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bone">
      <Navbar />

      <section className="border-b border-sand-light bg-sand pb-[clamp(2rem,4vw,3rem)] pt-[calc(var(--nav-height)_+_clamp(3rem,6vw,5rem))]">
        {/* !max-w because .container declares its own max-width in globals.css,
            after @tailwind utilities, so a plain max-w-* would lose. */}
        <div className="container max-w-[760px]">
          <ScrollReveal>
            {/* !text because .label sets colour and wins the same way. */}
            <span className="label mb-4 block text-brand">
              {eyebrow}
            </span>
            <h1 className="font-display text-fluid-4xl font-normal leading-[1.05] tracking-[-0.03em] text-ink">
              {title}
            </h1>
            {intro && (
              <p className="mt-4 text-fluid-lg leading-[1.6] text-ink-soft">
                {intro}
              </p>
            )}
            {updated && (
              <p className="mt-4 text-fluid-sm text-ink-faint">
                Last updated {updated}
              </p>
            )}
          </ScrollReveal>
        </div>
      </section>

      <section className="py-[clamp(3rem,6vw,4.5rem)]">
        <div className="container max-w-[760px]">
          {/* #FEF7E6 and #7C5E10 are warning-bg and warning; #F0D48A has no
              token, so it stays literal rather than being approximated. */}
          {needsReview && (
            <div className="mb-8 flex items-start gap-2.5 rounded-2xl border border-[#F0D48A] bg-warning-bg p-4">
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-warning-strong"
              />
              <p className="text-fluid-sm leading-normal text-warning">
                <strong>Draft awaiting legal review.</strong> This text
                describes how ZuriDrive actually operates, but it has not yet
                been reviewed by a qualified Rwandan lawyer and is not a
                substitute for advice.
              </p>
            </div>
          )}
          <div className="prose-page">{children}</div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/** A numbered section within a prose page. */
export function Clause({
  id,
  n,
  title,
  children,
}: {
  id?: string;
  n?: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="mb-10 scroll-mt-24">
      <h2 className="mb-3 font-display text-fluid-xl font-medium tracking-[-0.02em] text-ink">
        {n !== undefined && (
          <span className="mr-2 text-ink-faint">
            {n}.
          </span>
        )}
        {title}
      </h2>
      <div className="text-fluid-base leading-[1.7] text-ink-soft">
        {children}
      </div>
    </section>
  );
}
