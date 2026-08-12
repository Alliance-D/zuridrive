// =============================================================================
// ZuriDrive — About (/about)
//
// Deliberately contains no invented facts about the business: no founding
// date, headcount, funding, or "trusted by N customers". Everything here is a
// claim about how the platform actually works, which is verifiable from the
// code. Fill in the company history yourself — that is not ours to make up.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why ZuriDrive exists and how we handle other people's cars and money.",
};

export default function AboutPage() {
  return (
    <ProsePage
      eyebrow="Company"
      title="About ZuriDrive"
      intro="Renting a car in Rwanda should be as simple as booking a room — and as safe for the person handing over the keys."
    >
      <Clause title="The problem we set out to fix">
        <p>
          There are plenty of cars in Rwanda sitting still. There are plenty of
          people who need one for a weekend, a business trip, or a month. What
          has been missing is a way to put the two together where{" "}
          <strong>both sides feel safe</strong>.
        </p>
        <p>
          An owner handing over their car worries about damage, about who is
          actually driving, and about getting paid. A renter worries about being
          overcharged, about a car that is not what the photos showed, and about
          a deposit that never comes back. ZuriDrive exists to make both of
          those worries boring.
        </p>
      </Clause>

      <Clause title="How we try to be trustworthy">
        <p>These are the principles the platform is actually built on.</p>
        <ul>
          <li>
            <strong>A deposit is not our money.</strong> It is held separately
            from the rental fee, we take no commission on it, and every movement
            of it is recorded. It goes back to the renter unless there is
            evidence supporting a claim.
          </li>
          <li>
            <strong>Financial records are append-only.</strong> When something
            is wrong we correct it by writing a new entry, never by quietly
            editing an old one. The books are reconciled against two arithmetic
            identities that have to hold at all times.
          </li>
          <li>
            <strong>Evidence beats opinion.</strong> Both parties photograph the
            car before and after. When there is a dispute we decide on what the
            photos and timestamps show, not on who argues hardest.
          </li>
          <li>
            <strong>Nobody profits from letting the other side down.</strong> A
            renter who cancels at the last minute compensates the owner. An
            owner who cancels keeps nothing, ever.
          </li>
          <li>
            <strong>A booking already paid for is protected.</strong> If an
            owner&apos;s subscription lapses, cars with upcoming trips stay
            listed. We will not strand a renter over a billing problem that has
            nothing to do with them.
          </li>
        </ul>
      </Clause>

      <Clause title="Built for how Rwanda actually pays">
        <p>
          Sign-in is by phone number and SMS code, because that is what everyone
          has. Payment is MTN Mobile Money or bank transfer with proof, because
          that is how money moves here. Prices are in Rwandan francs and handled
          as whole numbers — no rounding errors quietly eating someone&apos;s
          earnings.
        </p>
      </Clause>

      <Clause title="Get in touch">
        <p>
          Renting?{" "}
          <Link href={ROUTES.cars}>Browse the cars available now.</Link>{" "}
          Have a car sitting idle?{" "}
          <Link href={ROUTES.becomeAnOwner}>List it and start earning.</Link>{" "}
          Something else? The <Link href="/contact">contact page</Link> has the
          fastest route to a human.
        </p>
      </Clause>
    </ProsePage>
  );
}
