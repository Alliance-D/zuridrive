// =============================================================================
// ZuriDrive — Payment provider interface
//
// WHY THIS EXISTS
// The platform launches in Phase 1 with no payment processing at all: owners
// pay a subscription, and renters settle with owners directly at handover.
// Payments arrive in Phase 2, through Flutterwave rather than a direct MTN
// integration, because an aggregator holds the licences and covers MoMo, Airtel
// and cards through one contract.
//
// Everything above this interface — settlement, idempotency, deposit
// activation, reconciliation, the tests — is provider-agnostic and already
// written. Swapping or adding a provider means implementing the four methods
// below. Nothing else changes.
//
// THE THING THIS DESIGN PROTECTS
// A provider is not allowed to tell us a payment succeeded. It can only be
// ASKED. Every implementation of getStatus() must query the provider's API,
// never trust a webhook body — MTN does not sign callbacks at all, and a
// signature check is easy to get subtly wrong. See lib/payments/settle.ts.
// =============================================================================

/** Normalised across every provider. */
export type PaymentStatus = "PENDING" | "SUCCESSFUL" | "FAILED";

export interface ChargeRequest {
  /** RWF, whole francs. */
  amount: number;
  /** Payer's phone in E.164, when the method needs one. */
  phoneNumber?: string;
  /**
   * The reference to charge under, when the caller has already recorded it.
   *
   * A charge that times out mid-flight is not the same as a charge that did
   * not happen: MTN queues the request and pushes the prompt regardless of
   * whether our connection survived. If the caller learns the reference only
   * from a successful reply, a dropped connection loses it, the renter pays,
   * and nothing on our side can ever poll for it. Passing one in lets the
   * caller write it down first and reconcile afterwards.
   */
  reference?: string;

  /** Our id for this charge — booking id or subscription id. */
  externalId: string;
  /** Shown to the payer, e.g. on a USSD prompt. */
  description: string;
  /** Where to send the payer for hosted checkout, when the provider uses one. */
  returnUrl?: string;
}

export interface ChargeResult {
  /** The provider's id for this charge. We store it and poll on it. */
  reference: string;
  /**
   * Set when the provider hosts the payment page (Flutterwave, card flows).
   * Null for push flows like a MoMo USSD prompt, where nothing to redirect to.
   */
  redirectUrl: string | null;
}

export interface StatusResult {
  reference: string;
  status: PaymentStatus;
  /** Why it failed, when the provider says. */
  reason?: string;
  /**
   * What the provider says was actually paid, in RWF.
   *
   * Worth checking against what we expected: a provider that reports success
   * for a smaller amount than we asked for is a real failure mode, and one
   * that is invisible if you only look at the status field.
   */
  amountPaid?: number;
}

export interface RefundResult {
  reference: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reason?: string;
}

export interface PaymentProvider {
  /** Stable identifier, stored on records so history stays readable. */
  readonly id: "MTN_MOMO" | "FLUTTERWAVE" | "DIRECT";

  /** Human name, shown in the UI. */
  readonly displayName: string;

  /** False when the provider cannot actually move money (Phase 1). */
  readonly canCollect: boolean;

  /** Starts a charge. */
  charge(request: ChargeRequest): Promise<ChargeResult>;

  /**
   * Authoritative status, straight from the provider.
   * Never derived from a webhook payload — see the header note.
   */
  getStatus(reference: string): Promise<StatusResult>;

  /**
   * Returns money. Cancellations depend on this working, so a provider without
   * a refund API is not usable for Phase 2.
   */
  refund(reference: string, amount: number, reason: string): Promise<RefundResult>;

  /**
   * Extracts our reference from a webhook body, and says whether the payload
   * was authentic where the provider signs them.
   *
   * Returning a reference is NOT a claim that the payment succeeded — the
   * caller still asks getStatus(). It just tells us which payment to go and
   * ask about.
   */
  parseWebhook(
    body: unknown,
    headers: Record<string, string>,
  ): { reference: string | null; signatureValid: boolean };
}
