// =============================================================================
// ZuriDrive — Contact (/contact)
//
// Routes people to the fastest real channel rather than a generic form that
// lands nowhere. Signed-in owners get pointed at /owner/support, which is a
// real ticket queue with a response target attached; everyone else gets an
// address that a person actually reads.
//
// The addresses and phone number below are placeholders — replace them with
// mailboxes that exist before launch. A contact page listing a dead address is
// worse than no contact page.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the ZuriDrive team.",
};

export default function ContactPage() {
  return (
    <ProsePage
      eyebrow="Company"
      title="Contact us"
      intro="Tell us what's wrong and we'll tell you what we're doing about it."
    >
      <Clause title="If something is going wrong right now">
        <p>
          <strong>A trip is in progress and there is a problem</strong> — an
          accident, a breakdown, a car that never arrived — call us on{" "}
          <a href="tel:+250788000000">+250 788 000 000</a>. Do not wait for
          email.
        </p>
        <p>
          If anyone is hurt, or a vehicle has been stolen, contact the Rwanda
          National Police first on <strong>112</strong>, then tell us.
        </p>
      </Clause>

      <Clause title="If you have an account">
        <p>
          Car owners should use{" "}
          <Link href="/owner/support">the support desk in your dashboard</Link>.
          It attaches your account and booking history to the ticket
          automatically, so nobody has to ask you for a reference number, and
          you can see the response target on screen. Owners on Premium get a
          four-hour first-response target instead of twenty-four.
        </p>
      </Clause>

      <Clause title="By email">
        <dl>
          <dt>General questions</dt>
          <dd>
            <a href="mailto:hello@zuridrive.rw">hello@zuridrive.rw</a>
          </dd>

          <dt>Payments, refunds and deposits</dt>
          <dd>
            <a href="mailto:finance@zuridrive.rw">finance@zuridrive.rw</a> —
            include your booking reference and we can look it up immediately.
          </dd>

          <dt>Privacy and your data</dt>
          <dd>
            <a href="mailto:privacy@zuridrive.rw">privacy@zuridrive.rw</a> — for
            access, correction or deletion requests. We reply within 30 days.
          </dd>

          <dt>Reporting a security issue</dt>
          <dd>
            <a href="mailto:security@zuridrive.rw">security@zuridrive.rw</a> —
            please tell us privately first and give us a chance to fix it.
          </dd>

          <dt>Press and partnerships</dt>
          <dd>
            <a href="mailto:hello@zuridrive.rw">hello@zuridrive.rw</a>
          </dd>
        </dl>
      </Clause>

      <Clause title="What helps us help you faster">
        <ul>
          <li>Your booking reference, if it is about a specific trip.</li>
          <li>The phone number on your account.</li>
          <li>
            A screenshot of anything that looked wrong — especially a payment
            confirmation or an error message.
          </li>
          <li>What you expected to happen, and what happened instead.</li>
        </ul>
        <p>
          Before you write, it is worth checking the{" "}
          <Link href="/help">Help Centre</Link> — deposits, cancellation fees
          and payout timing are the four things people ask about most, and they
          are all answered there.
        </p>
      </Clause>
    </ProsePage>
  );
}
