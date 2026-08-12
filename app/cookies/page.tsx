// =============================================================================
// ZuriDrive — Cookie Policy (/cookies)
//
// Deliberately short, because it is accurate. The app sets no analytics or
// advertising cookies: a grep for gtag / GTM / Plausible / PostHog / Mixpanel /
// Meta and for document.cookie and localStorage returns nothing outside
// NextAuth's own session handling.
//
// If a tracker is ever added, this page must be updated FIRST, and a consent
// banner becomes necessary — non-essential cookies need opt-in.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "The small number of cookies ZuriDrive uses, and why.",
};

const UPDATED = "1 August 2026";

export default function CookiesPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Cookie Policy"
      intro="We use very few. None of them track you."
      updated={UPDATED}
    >
      <Clause n={1} title="The short version">
        <p>
          ZuriDrive sets <strong>no advertising cookies and no analytics
          cookies</strong>. We do not embed Google Analytics, Meta Pixel, or any
          similar tracker. There is no consent banner on this site because there
          is nothing to consent to — the only cookies we set are the ones
          required to keep you signed in.
        </p>
      </Clause>

      <Clause n={2} title="What we actually set">
        <dl>
          <dt>Session cookie</dt>
          <dd>
            Keeps you signed in as you move between pages. Without it you would
            have to re-enter your code on every screen. It is removed when you
            sign out.
          </dd>

          <dt>Security token</dt>
          <dd>
            A short-lived value that lets us verify a form was submitted from
            our own site, which is how we stop other sites acting on your behalf
            without your knowledge.
          </dd>

          <dt>Return path</dt>
          <dd>
            Remembers which page you were trying to reach when you were asked to
            sign in, so we can send you back there afterwards.
          </dd>
        </dl>

        <p>
          All three are <strong>strictly necessary</strong>: the site cannot
          function without them, and under Rwandan and comparable data
          protection rules they do not require opt-in consent.
        </p>
      </Clause>

      <Clause n={3} title="Third parties">
        <p>
          Photos are served from Cloudinary and payments are authorised on
          MTN&apos;s systems. Those providers may set their own cookies on their
          own domains when your browser fetches an image or completes a payment.
          We do not control those and we cannot read them.
        </p>
      </Clause>

      <Clause n={4} title="Turning them off">
        <p>
          Your browser can block cookies, but blocking ours means you will not
          be able to sign in — which makes booking a car, or managing a
          listing, impossible.
        </p>
        <p>
          If we ever add a non-essential cookie, we will update this page and
          ask for your consent before setting it. See the{" "}
          <Link href="/privacy">Privacy Policy</Link> for how we handle the rest
          of your data.
        </p>
      </Clause>
    </ProsePage>
  );
}
