// =============================================================================
// ZuriDrive — Flutterwave provider (Phase 2)
//
// NOT YET ACTIVE. This is the shape the integration will take, written now so
// that the interface it has to satisfy is real rather than imagined, and so
// switching it on is a matter of filling in four method bodies and setting
// three environment variables.
//
// WHY FLUTTERWAVE RATHER THAN MTN DIRECTLY
//   • one contract covers MTN MoMo, Airtel Money and cards; MTN direct covers
//     MTN only, and Airtel would be a second integration and a second agreement
//   • they hold the payment licences, which keeps ZuriDrive out of the question
//     of whether it is itself a payment service provider
//   • webhooks are SIGNED, which MTN's are not — see parseWebhook below
//   • they have a refund API, which cancellations depend on
//
// WHAT TO CONFIRM BEFORE BUILDING THIS OUT
//   1. Split payments / subaccounts. If Flutterwave can pay the owner their
//      share directly, ZuriDrive never holds the money and the BNR question
//      largely disappears. This is the single most important thing to check.
//   2. Refund API availability on Rwandan mobile money, not just cards.
//   3. RWF settlement to a Rwandan bank account, and the settlement delay.
//   4. Whether deposits can be pre-authorised and released, or whether they
//      have to be a real charge followed by a real refund.
// =============================================================================

import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  StatusResult,
  RefundResult,
} from "@/lib/payments/provider";

const SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY ?? "";
const WEBHOOK_HASH = process.env.FLUTTERWAVE_WEBHOOK_HASH ?? "";
const BASE_URL = process.env.FLUTTERWAVE_BASE_URL ?? "https://api.flutterwave.com/v3";

export function flutterwaveConfigured(): boolean {
  return Boolean(SECRET_KEY && WEBHOOK_HASH);
}

function notImplemented(method: string): never {
  throw new Error(
    `Flutterwave ${method}() is not implemented yet. ZuriDrive is in Phase 1 ` +
      `(direct settlement). See lib/payments/providers/flutterwave.ts.`,
  );
}

export const flutterwaveProvider: PaymentProvider = {
  id: "FLUTTERWAVE",
  displayName: "Card, MTN MoMo or Airtel Money",
  canCollect: false, // flip to true once the methods below are real

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    // POST {BASE_URL}/payments with tx_ref, amount, currency: "RWF",
    // customer, and redirect_url. Returns a hosted checkout link.
    notImplemented("charge");
  },

  async getStatus(_reference: string): Promise<StatusResult> {
    // GET {BASE_URL}/transactions/verify_by_reference?tx_ref=...
    //
    // Check BOTH that status is "successful" AND that amount and currency
    // match what was asked for. Flutterwave's own documentation calls this
    // out: verifying status alone lets an underpayment read as a success.
    notImplemented("getStatus");
  },

  async refund(_reference: string, _amount: number): Promise<RefundResult> {
    // POST {BASE_URL}/transactions/{id}/refund
    notImplemented("refund");
  },

  parseWebhook(body: unknown, headers: Record<string, string>) {
    // Flutterwave signs webhooks with the secret hash in the verif-hash header.
    // Unlike MTN this can actually be verified — but settlement STILL calls
    // getStatus() afterwards rather than believing the body. A valid signature
    // proves the message came from Flutterwave; it does not prove our record of
    // the payment is in the state the message claims.
    const provided = headers["verif-hash"] ?? headers["Verif-Hash"] ?? "";
    const signatureValid = Boolean(WEBHOOK_HASH) && provided === WEBHOOK_HASH;

    let reference: string | null = null;
    if (body && typeof body === "object") {
      const data = (body as Record<string, unknown>).data;
      if (data && typeof data === "object") {
        const txRef = (data as Record<string, unknown>).tx_ref;
        if (typeof txRef === "string") reference = txRef;
      }
    }

    return { reference, signatureValid };
  },
};
