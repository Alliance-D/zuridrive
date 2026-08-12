// =============================================================================
// ZuriDrive — MTN MoMo, behind the PaymentProvider interface
//
// WHY THIS FILE EXISTS
// lib/payments/momo.ts already spoke MTN's API — requestToPay, status polling,
// phone normalisation. What it did not do was sit behind the provider
// interface: the booking flow reached for it directly through an
// `initiate_momo` action, going around getPaymentProvider() entirely.
//
// That works with one provider and stops working the moment there are two. Every
// MoMo-specific call in the booking flow is a place that has to be found and
// unpicked when DPO or Flutterwave arrives. Registering MoMo properly now, while
// there is only one integration to move, is much cheaper than doing it later
// with two.
//
// WHAT IS DELIBERATELY NOT HERE
// canCollect stays false until MTN production credentials exist. The registry
// treats a provider that cannot collect as a configuration mistake and falls
// back to direct settlement — so wiring this up does not silently start
// charging anyone. Flipping it on is a separate, deliberate step.
// =============================================================================

import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  StatusResult,
  RefundResult,
} from "@/lib/payments/provider";
import {
  requestToPay,
  getPaymentStatus,
  formatPhoneForMoMo,
} from "@/lib/payments/momo";

/**
 * True when every MTN credential is present. Mirrors flutterwaveConfigured():
 * "configured" is about credentials existing, not about being switched on.
 */
export function momoConfigured(): boolean {
  return Boolean(
    process.env.MTN_MOMO_BASE_URL &&
      process.env.MTN_MOMO_SUBSCRIPTION_KEY &&
      process.env.MTN_MOMO_API_USER &&
      process.env.MTN_MOMO_API_KEY,
  );
}

/**
 * MoMo is a push flow: the payer approves a USSD prompt on their handset.
 * There is no hosted page, so redirectUrl is always null and the caller polls.
 */
async function charge(request: ChargeRequest): Promise<ChargeResult> {
  if (!request.phoneNumber) {
    throw new Error("MTN MoMo needs the payer's phone number.");
  }

  const reference = await requestToPay({
    amount: request.amount,
    phoneNumber: formatPhoneForMoMo(request.phoneNumber),
    externalId: request.externalId,
    payerMessage: request.description,
    payeeNote: request.description,
  });

  return { reference, redirectUrl: null };
}

/**
 * Asks MTN directly. Never derived from a callback body — MTN does not sign
 * callbacks, so a payload claiming success proves nothing. See the note in
 * lib/payments/provider.ts.
 */
async function getStatus(reference: string): Promise<StatusResult> {
  const result = await getPaymentStatus(reference);
  return {
    reference,
    status: result.status,
    reason: result.reason,
    amountPaid: result.amount,
  };
}

/**
 * MTN's disbursement API is a separate product with its own credentials and
 * approval, so refunds are not available through this integration yet.
 *
 * Throwing is the honest answer. Returning FAILED would let a cancellation
 * appear to have refunded someone when no money moved, which is worse than an
 * error a human has to look at.
 */
async function refund(): Promise<RefundResult> {
  throw new Error(
    "MTN MoMo refunds are not implemented. Disbursements require separate MTN " +
      "credentials; refund this payment manually and record it against the booking.",
  );
}

/**
 * MTN callbacks are unsigned, so signatureValid is always false. Returning the
 * reference is not a claim that anything succeeded — the caller still asks
 * getStatus(), which is the whole point of the design.
 */
function parseWebhook(body: unknown): {
  reference: string | null;
  signatureValid: boolean;
} {
  const payload = body as { referenceId?: string; externalId?: string } | null;
  return {
    reference: payload?.referenceId ?? payload?.externalId ?? null,
    signatureValid: false,
  };
}

export const momoProvider: PaymentProvider = {
  id: "MTN_MOMO",
  displayName: "MTN Mobile Money",
  // Flip to true only when production credentials are in place and the sandbox
  // flow has been run end to end.
  canCollect: false,
  charge,
  getStatus,
  refund,
  parseWebhook,
};
