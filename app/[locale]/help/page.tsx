// =============================================================================
// ZuriDrive — Help Centre (/help)
//
// Every answer here describes real, implemented behaviour. Where a figure is
// configurable (commission, cancellation window and fee, photo retention,
// response targets) it is quoted as "currently", so a settings change makes
// this stale rather than false — but it should still be updated.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";
import { ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Help Centre",
  description:
    "Answers on deposits, cancellations, payouts and disputes on ZuriDrive.",
};

export default function HelpPage() {
  return (
    <ProsePage
      eyebrow="Support"
      title="Help Centre"
      intro="The questions people actually ask, answered plainly."
    >
      <Clause id="deposits" title="Deposits">
        <dl>
          <dt>What is the deposit for?</dt>
          <dd>
            It covers damage, missing fuel or a late return. It is{" "}
            <strong>not</strong> part of the rental price and we take no
            commission from it.
          </dd>

          <dt>When do I get it back?</dt>
          <dd>
            After the trip is completed and both parties have confirmed the
            return. If nobody raises a problem, it is released in full.
          </dd>

          <dt>The owner is claiming against my deposit. Now what?</dt>
          <dd>
            They have to show evidence. You can open a dispute, add your own
            photos and explanation, and a person will decide. Your before-trip
            photos are usually the thing that settles it — which is why taking
            them matters.
          </dd>

          <dt>Can ZuriDrive keep my deposit?</dt>
          <dd>
            No. It goes back to you, or to the owner as compensation after a
            substantiated claim or a late cancellation. It never becomes our
            revenue.
          </dd>
        </dl>
      </Clause>

      <Clause id="cancellations" title="Cancellations">
        <dl>
          <dt>What happens if I cancel?</dt>
          <dd>
            Cancel outside the cancellation window — currently 24 hours before
            pick-up — and you get everything back, rental and deposit. Cancel
            inside it and the owner keeps a share of the deposit, currently 50%.{" "}
            <strong>Your rental fee is always returned in full.</strong>
          </dd>

          <dt>Why is there a fee at all?</dt>
          <dd>
            The owner turned away other bookings for those dates. A cancellation
            the night before usually means the car earns nothing that weekend.
          </dd>

          <dt>I think the fee is unfair.</dt>
          <dd>
            Dispute it from the booking page. Give a reason and attach
            evidence — messages from the owner, a medical document, whatever
            supports you. If we find in your favour the whole deposit is
            returned.
          </dd>

          <dt>What if the owner cancels on me?</dt>
          <dd>
            You get a full refund and they keep nothing. That is true whenever
            they cancel.
          </dd>
        </dl>
      </Clause>

      <Clause id="photos" title="Condition photos">
        <dl>
          <dt>Do I have to take them?</dt>
          <dd>
            You are strongly advised to. They are the evidence we use in a
            dispute. Without your own set, you are relying on the other
            party&apos;s.
          </dd>

          <dt>How long are they kept?</dt>
          <dd>
            They are deleted automatically a few days after the trip ends —
            currently three. Photos attached to an open dispute are kept until
            it is resolved.
          </dd>
        </dl>
      </Clause>

      <Clause id="payments" title="Payments and refunds">
        <dl>
          <dt>How do I pay?</dt>
          <dd>
            MTN Mobile Money, or bank transfer with proof of payment. With MoMo
            you approve a prompt on your phone. With bank transfer our finance
            team confirms it, usually within a few hours.
          </dd>

          <dt>My money left my account but the booking is not confirmed.</dt>
          <dd>
            Do not pay again. Email{" "}
            <a href="mailto:finance@zuridrive.rw">finance@zuridrive.rw</a> with
            your booking reference and the MoMo transaction ID, and we will
            reconcile it.
          </dd>

          <dt>How long do refunds take?</dt>
          <dd>Normally 1–3 business days once issued.</dd>
        </dl>
      </Clause>

      <Clause id="owners" title="For car owners">
        <dl>
          <dt>What does ZuriDrive take?</dt>
          <dd>
            A commission on the rental — currently 20%. Nothing from the
            deposit. The rate is fixed when a booking is made, so a later change
            never alters bookings you have already taken.
          </dd>

          <dt>When am I paid?</dt>
          <dd>
            Earnings become payable once the trip completes and the return is
            confirmed. You request a payout from your dashboard and we send it
            to the MoMo number or bank account on your profile.
          </dd>

          <dt>What happens if my subscription lapses?</dt>
          <dd>
            Listings above the free allowance are hidden, and you lose priority
            placement and the verified badge. <strong>Cars with an active or
            upcoming booking stay live</strong> — we will not strand someone who
            has already paid. Renewing puts back exactly the cars we hid, and
            leaves any car you paused yourself paused.
          </dd>

          <dt>Do I lose days if I renew early?</dt>
          <dd>
            No. A renewal adds a full period on top of what is left, so renewing
            early costs you nothing.
          </dd>

          <dt>How fast is support?</dt>
          <dd>
            We aim to reply within 24 hours, or 4 hours on Premium. The queue is
            ordered by which ticket is closest to missing its target, so a
            long-waiting standard ticket is never stuck behind a stream of newer
            priority ones.
          </dd>
        </dl>
      </Clause>

      <Clause title="Still stuck?">
        <p>
          Owners can open a ticket from{" "}
          <Link href="/owner/support">the support desk</Link>. Everyone else,
          see the <Link href="/contact">contact page</Link> — and if a trip is
          in progress and something has gone wrong, call rather than email.
        </p>
        <p>
          The <Link href={ROUTES.howItWorks}>How It Works</Link> page walks
          through a whole booking end to end if you would rather see the shape
          of it first.
        </p>
      </Clause>
    </ProsePage>
  );
}
