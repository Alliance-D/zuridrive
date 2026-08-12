// =============================================================================
// ZuriDrive — Terms of Service (/terms)
//
// The money clauses here are written against the real implementation:
//   • commission comes from PlatformSetting.commissionRatePercent
//   • the cancellation fee from lateCancellationWindowHours / FeePercent
//   • deposit handling from the Deposit + DepositMovement ledger
//   • subscription renewal from lib/subscriptions/checkout
//
// If any of those settings change, the wording below has to change with them —
// the figures are quoted as "currently", so a settings change does not
// instantly make this page a lie, but it does make it stale.
//
// Published without the draft banner at the owner's direction. A legal review
// is still worth doing.
// =============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import ProsePage, { Clause } from "@/components/marketing/ProsePage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between you, ZuriDrive, and the other party to your booking.",
};

const UPDATED = "1 August 2026";

export default function TermsPage() {
  return (
    <ProsePage
      eyebrow="Legal"
      title="Terms of Service"
      intro="What you agree to when you rent a car, or list one, on ZuriDrive."
      updated={UPDATED}
    >
      <Clause n={1} title="What ZuriDrive is">
        <p>
          ZuriDrive is a <strong>marketplace</strong>. We connect people who
          want to rent a car with the owners of those cars.
        </p>
        <p>
          <strong>
            We do not currently process payments or hold deposits.
          </strong>{" "}
          The renter pays the owner directly at handover, on terms the two of
          them agree. Our revenue comes from the subscription owners pay to list
          their cars. Sections 4 and 5 describe how payments and cancellation
          fees will work once we do begin processing them; until then those
          arrangements are between you and the other party.
        </p>
        <p>
          We do not own the vehicles listed here and we are not the ones renting
          them to you. The rental contract is between the <strong>renter and
          the owner</strong>. What we are responsible for is running the
          platform honestly: describing cars accurately, applying these terms
          consistently, and judging disputes fairly on the evidence.
        </p>
      </Clause>

      <Clause n={2} title="Who can use it">
        <p>
          You must be 18 or over. To rent you need a valid driving licence and a
          national ID or passport. <strong>We do not ask you to upload
          them</strong> — you confirm at checkout that you hold them, and the
          owner checks them in person before handing over the car. Turning up
          without them is grounds for the owner to refuse. To list a car you must
          be its legal owner or have the owner&apos;s written authority.
        </p>
        <p>
          You are responsible for what happens on your account. Keep your
          password to yourself.
        </p>
      </Clause>

      <Clause n={3} title="Bookings">
        <p>
          A booking is confirmed when the owner accepts it. Until then the car
          is not held for you. Payment is arranged directly with the owner —
          agree how and when before you travel to collect the car.
        </p>
        <p>
          If the owner does not respond within the response window, the booking
          is confirmed automatically so you are not left waiting indefinitely.
          If the owner declines, nothing is owed.
        </p>
      </Clause>

      <Clause n={4} title="Money (from Phase 2 onward)">
        <p>
          <strong>
            None of this applies yet — today you pay the owner directly.
          </strong>{" "}
          It describes the arrangement that will take effect when ZuriDrive
          begins processing payments, and we will tell you before it does.
        </p>
        <p>
          <strong>Rental fee.</strong> Shown in full before you pay. ZuriDrive
          keeps a commission from it — currently 20% — and the rest goes to the
          owner. The rate that applies to your booking is fixed at the moment
          you book; a later change never alters a booking already made.
        </p>
        <p>
          <strong>Security deposit.</strong> Held separately from the rental
          fee. It is <strong>not</strong> income, we take no commission on it,
          and it is returned to you unless there is a substantiated claim
          against it. Every movement of a deposit is recorded.
        </p>
        <p>
          <strong>Refunds</strong> are returned to the payment method you used,
          normally within 1–3 business days once we have issued them.
        </p>
      </Clause>

      <Clause n={5} title="Cancellation (from Phase 2 onward)">
        <p>
          <strong>
            While payments are settled directly, cancellation terms are between
            you and the other party.
          </strong>{" "}
          The rules below take effect when ZuriDrive begins holding deposits.
        </p>
        <p>
          <strong>Cancel early and you pay nothing.</strong> If you cancel
          outside the cancellation window, your rental fee and your full deposit
          are returned.
        </p>
        <p>
          <strong>Cancel late and a fee applies.</strong> If you cancel within
          the cancellation window before pick-up — currently 24 hours — we keep
          a share of your deposit, currently 50%, and pass it to the owner. They
          have turned away other bookings for those dates. Your{" "}
          <strong>rental fee is still returned in full</strong>; the fee only
          ever comes out of the deposit.
        </p>
        <p>
          <strong>If the owner cancels, they keep nothing</strong>, whenever
          they do it. You get everything back. An owner must never profit from
          pulling out.
        </p>
        <p>
          <strong>You can dispute a cancellation fee.</strong> If you think it
          is unfair — the owner pushed you into cancelling, the car was not
          available, there was an emergency — you can challenge it with a reason
          and evidence, and a person will review it. If we find for you, the
          whole deposit is returned.
        </p>
      </Clause>

      <Clause n={6} title="During the trip">
        <p>
          <strong>Photograph the car before you drive and after you return
          it.</strong> Both parties do this. These photos are the evidence we
          use if there is a dispute about damage, and they are deleted a few
          days after the trip ends. If you skip them, you are relying on the
          other party&apos;s photos alone.
        </p>
        <p>
          Return the vehicle on time, in the condition you received it, with the
          fuel level the listing requires. You are responsible for traffic
          fines, tolls and penalties incurred while the car is with you.
        </p>
        <p>
          Do not sub-let the car, use it for a criminal purpose, drive it under
          the influence, or take it outside Rwanda without written permission
          from the owner.
        </p>
      </Clause>

      <Clause n={7} title="Damage and disputes">
        <p>
          If an owner claims against a deposit, they must provide evidence.
          Either party can open a dispute, and we decide on what we can see:
          condition photos, timestamps, messages and trip records.
        </p>
        <p>
          Our decision determines what happens to the <strong>deposit</strong>.
          It does not stop either party pursuing the matter through the Rwandan
          courts, and it is not a substitute for insurance.
        </p>
      </Clause>

      <Clause n={8} title="For car owners">
        <p>
          Your vehicle must be roadworthy, legally registered and insured for
          the use it is being rented for. Listings must be accurate — the photos
          must be of the actual car.
        </p>
        <p>
          <strong>Subscription plans.</strong> Plans are billed for 30 days at a
          time and do not auto-renew by taking your money without asking; you
          renew deliberately. Renewing early adds a full period on top of the
          days you have left, so you lose nothing by doing it. If a plan lapses,
          listings above your free allowance are hidden — but{" "}
          <strong>any car with an active or upcoming booking stays live</strong>
          , because someone has paid for that trip. Renewing restores exactly
          the cars we hid.
        </p>
        <p>
          <strong>Payouts.</strong> Your earnings become payable once a trip
          completes. Keep your payout details accurate — we are not liable for
          money sent to a wrong number you gave us.
        </p>
      </Clause>

      <Clause n={9} title="What we are not responsible for">
        <p>
          We are a marketplace, and we are honest about the limits of that. We
          are not liable for the mechanical condition of a vehicle, an
          owner&apos;s or renter&apos;s conduct, accidents, injury, theft, or
          losses arising from a trip itself. Those sit with the parties to the
          rental and their insurers.
        </p>
        <p>
          We <strong>are</strong> responsible for handling your money correctly,
          keeping accurate records, and applying these terms consistently.
          Nothing here limits liability that Rwandan law does not allow us to
          limit.
        </p>
      </Clause>

      <Clause n={10} title="Suspension">
        <p>
          We can suspend or remove an account for fraud, repeated cancellations,
          unsafe conduct, false listings, or abuse of another user. Where we do,
          money already owed to you is still paid — suspension is not a
          mechanism for keeping your earnings.
        </p>
      </Clause>

      <Clause n={11} title="Governing law">
        <p>
          These terms are governed by the laws of the Republic of Rwanda, and
          the courts of Rwanda have jurisdiction over any dispute arising from
          them.
        </p>
      </Clause>

      <Clause n={12} title="Changes and contact">
        <p>
          We will post changes here and update the date above. Significant
          changes will be notified to you directly. Questions:{" "}
          <a href="mailto:hello@zuridrive.rw">hello@zuridrive.rw</a>, or see the{" "}
          <Link href="/help">Help Centre</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </Clause>
    </ProsePage>
  );
}
