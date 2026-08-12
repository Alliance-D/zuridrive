// =============================================================================
// ZuriDrive — Privacy Policy (/privacy)
//
// Written against the actual Prisma schema rather than from a template. Every
// category of data named below maps to a real column the platform writes, and
// every retention claim matches real behaviour (photo retention comes from
// PlatformSetting.photoRetentionDays; SMS logging from the SmsLog table).
//
// If the schema gains a new personal-data field, this page has to change too.
//
// Published without the draft banner at the owner's direction. The content is
// written against the real schema and real behaviour; a review against Law No.
// 058/2021 is still worth doing.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How ZuriDrive collects, uses and protects your personal data in Rwanda.",
};

const UPDATED = "1 August 2026";
const CONTACT = "privacy@zuridrive.rw";

export default function PrivacyPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Privacy Policy"
      intro="What we collect, why we collect it, and what you can ask us to do with it."
      updated={UPDATED}
    >
      <Clause n={1} title="Who we are">
        <p>
          ZuriDrive is a car rental marketplace operating in Rwanda. We connect
          people who want to rent a car with the owners of those cars. Renters
          currently pay owners directly at handover — ZuriDrive does not process
          rental payments or hold deposits.
        </p>
        <p>
          For the purposes of Law No. 058/2021 relating to the protection of
          personal data and privacy, ZuriDrive is the <strong>data
          controller</strong> for the information described here. You can reach
          us at <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Clause>

      <Clause n={2} title="What we collect">
        <p>We only collect what a rental actually requires.</p>

        <dl>
          <dt>Account details</dt>
          <dd>
            Your phone number (this is how you sign in), and optionally your
            name, email address and profile photo.
          </dd>

          <dt>Identity documents — we do not collect these</dt>
          <dd>
            <strong>
              We do not ask for, or store, your national ID number, your driving
              licence number, or a photo of either.
            </strong>{" "}
            You confirm at checkout that you hold a valid licence, and the owner
            checks your documents in person before handing over the car. We
            record only that the check happened and what the owner concluded —
            never the documents themselves. Storing them would make us a target
            worth attacking, and would prove very little: an uploaded photo says
            nothing about who actually turns up.
          </dd>

          <dt>Payout details (car owners only)</dt>
          <dd>
            Your MTN MoMo number, or your bank name, account name and account
            number — used solely to pay you what you have earned.
          </dd>

          <dt>Booking and trip records</dt>
          <dd>
            Dates, pick-up and drop-off locations, the price agreed, and the
            status of the trip.
          </dd>

          <dt>Vehicle condition photos</dt>
          <dd>
            Photos taken by both parties at the start and end of a trip. These
            exist to settle disputes about damage and are deleted automatically
            — see section 5.
          </dd>

          <dt>Payment records</dt>
          <dd>
            <strong>
              ZuriDrive does not currently process payments for rentals.
            </strong>{" "}
            You pay the owner directly at handover, so we hold no record of that
            transaction beyond what the booking itself says was agreed. Owners
            pay us a subscription, and for that we keep the amount, the method
            and a reference. We never see a PIN or full card details.
          </dd>

          <dt>Messages and support</dt>
          <dd>
            Support tickets you open, any files you attach, and a log of the SMS
            messages we send you (recipient, content and delivery status) so we
            can prove what was sent and investigate failures.
          </dd>

          <dt>Reviews</dt>
          <dd>Ratings and written reviews you leave after a trip.</dd>
        </dl>

        <p>
          We do <strong>not</strong> track your location in the background, and
          we do not buy personal data from third parties.
        </p>
      </Clause>

      <Clause n={3} title="Why we use it">
        <ul>
          <li>
            <strong>To run a booking</strong> — matching you with a car,
            confirming payment, and telling both sides what is happening.
          </li>
          <li>
            <strong>To record that identity was checked</strong> — so there is
            evidence an owner saw a licence before handing over their car,
            without us holding the document.
          </li>
          <li>
            <strong>To settle disputes</strong> — condition photos and trip
            records are the evidence we use when parties disagree about damage,
            fuel or lateness.
          </li>
          <li>
            <strong>To bill owners for their subscription</strong> — the plan
            that lets them list cars.
          </li>
          <li>
            <strong>To meet legal and tax obligations</strong> — financial
            records are retained as Rwandan law requires.
          </li>
        </ul>
        <p>
          We do not sell your personal data, and we do not use it to train
          advertising profiles.
        </p>
      </Clause>

      <Clause n={4} title="Who else sees it">
        <p>
          Only what is necessary, and only to parties who need it to deliver the
          service:
        </p>
        <ul>
          <li>
            <strong>The other party to your booking.</strong> An owner sees the
            renter&apos;s name and phone number for a confirmed trip, and checks
            their documents in person at handover. A renter sees the
            owner&apos;s name and phone number. Neither sees the other&apos;s
            payout details.
          </li>
          <li>
            <strong>A payment provider</strong> — once ZuriDrive begins
            processing rental payments. Today it does not, and no payment data
            leaves us because none is collected.
          </li>
          <li>
            <strong>Africa&apos;s Talking</strong> — to deliver SMS, where SMS
            is configured. Sign-in uses a password, so most accounts never
            trigger a message at all.
          </li>
          <li>
            <strong>Cloudinary</strong> — to store photos you upload.
          </li>
          <li>
            <strong>Rwandan authorities</strong> — where we are legally required
            to disclose, or where it is necessary to investigate a crime such as
            vehicle theft.
          </li>
        </ul>
        <p>
          Some of these providers process data outside Rwanda. Where that
          happens we rely on their contractual data-protection commitments.
        </p>
      </Clause>

      <Clause n={5} title="How long we keep it">
        <ul>
          <li>
            <strong>Condition photos are deleted automatically</strong> a few
            days after a trip ends — the exact window is set in the platform
            settings and is currently three days. Photos attached to an open
            dispute are held until the dispute is resolved.
          </li>
          <li>
            <strong>Financial records</strong> — owner subscription payments,
            and any rental payments once we begin processing them — are kept for
            as long as tax and accounting law requires. These are append-only: we correct an error by writing a
            new entry, never by editing or deleting the old one.
          </li>
          <li>
            <strong>Your account</strong> is kept while it is open. If you close
            it we remove your profile, but we keep the financial and trip
            records tied to completed bookings, because the other party to those
            trips has a legitimate interest in them and we have legal
            obligations of our own.
          </li>
          <li>
            <strong>SMS logs</strong> are kept for troubleshooting and dispute
            evidence.
          </li>
        </ul>
      </Clause>

      <Clause n={6} title="Your rights">
        <p>Under Rwandan data protection law you can ask us to:</p>
        <ul>
          <li>tell you what data we hold about you, and give you a copy;</li>
          <li>correct anything that is wrong;</li>
          <li>
            delete your data, where we are not required to keep it for legal or
            accounting reasons;
          </li>
          <li>stop using it for a particular purpose;</li>
          <li>
            complain to the National Cyber Security Authority if you think we
            have handled it improperly.
          </li>
        </ul>
        <p>
          Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will respond
          within 30 days. We may ask you to confirm your identity first — we are
          not going to hand your records to someone who merely claims to be you.
        </p>
      </Clause>

      <Clause n={7} title="Security">
        <p>
          Passwords, where you set one, are hashed and never stored in a
          readable form. Sign-in codes expire and lock out after repeated failed
          attempts. Access to admin tools is restricted by role, and privileged
          actions are written to an audit log that records who did what and
          when.
        </p>
        <p>
          No system is perfectly secure. If a breach affects your personal data
          we will notify you and the relevant authority as the law requires.
        </p>
      </Clause>

      <Clause n={8} title="Cookies">
        <p>
          We use a small number of strictly necessary cookies — mainly to keep
          you signed in. See the <Link href="/cookies">Cookie Policy</Link>.
        </p>
      </Clause>

      <Clause n={9} title="Changes">
        <p>
          If we change this policy we will update the date at the top, and for
          anything significant we will tell you directly. Continuing to use
          ZuriDrive after a change means you accept the updated policy.
        </p>
      </Clause>
    </ProsePage>
  );
}
