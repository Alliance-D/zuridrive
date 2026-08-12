// =============================================================================
// ZuriDrive — Direct settlement ("Phase 1")
//
// The provider used while the platform takes no payments at all.
//
// Renters and owners settle between themselves at handover — cash, MoMo person
// to person, whatever they agree. ZuriDrive's revenue in this phase is the
// owner subscription, which needs no payment rails of its own beyond what a
// Finance Manager confirms by hand.
//
// This is a deliberate launch strategy, not a missing feature:
//
//   • no payment aggregator contract, so nothing blocks launch
//   • no held deposits, which is what would raise the question of whether
//     ZuriDrive is holding customer funds and needs BNR authorisation
//   • no chargebacks, refunds, or settlement reconciliation to operate
//
// It implements the full PaymentProvider interface so that turning payments on
// later is a configuration change, not a rewrite. Every method that would move
// money refuses loudly rather than pretending — a provider that silently
// reports success would put fake money through the ledger.
// =============================================================================

import type {
  PaymentProvider,
  ChargeRequest,
  ChargeResult,
  StatusResult,
  RefundResult,
} from "@/lib/payments/provider";

class DirectSettlementError extends Error {
  constructor(action: string) {
    super(
      `ZuriDrive is not processing payments yet, so it cannot ${action}. ` +
        `The renter pays the owner directly at handover.`,
    );
    this.name = "DirectSettlementError";
  }
}

export const directProvider: PaymentProvider = {
  id: "DIRECT",
  displayName: "Pay the owner directly",
  canCollect: false,

  async charge(_request: ChargeRequest): Promise<ChargeResult> {
    throw new DirectSettlementError("take a payment");
  },

  async getStatus(reference: string): Promise<StatusResult> {
    // Nothing was ever collected, so there is nothing to be pending about.
    return { reference, status: "FAILED", reason: "No payment was collected." };
  },

  async refund(_reference: string): Promise<RefundResult> {
    throw new DirectSettlementError("issue a refund");
  },

  parseWebhook() {
    // No provider, so no webhooks. If one arrives it is not ours.
    return { reference: null, signatureValid: false };
  },
};
