/**
 * What renters are told about their damage deposit.
 *
 * This has to track how the money actually moves, and that depends on whether a
 * payment provider can collect yet:
 *
 *   • Direct settlement (Phase 1, no provider configured) — ZuriDrive collects
 *     nothing. app/api/bookings/route.ts deliberately writes no Deposit row,
 *     because one would imply the platform is holding money it has never seen.
 *     The owner takes the deposit in person and returns it in person.
 *
 *   • Collected settlement (a provider is live) — the platform charges the
 *     deposit, holds it against the booking, and releases it once both sides
 *     confirm the return.
 *
 * The booking flow used to state the second version unconditionally: "held
 * securely, returned automatically after successful trip". Under direct
 * settlement that is a promise about someone's money that nothing in the system
 * keeps. The amount was right; the custody was not.
 *
 * Branching here rather than rewording in place means this corrects itself when
 * payments are switched on, instead of becoming wrong in the other direction.
 */

import { paymentsEnabled } from "@/lib/payments";

/**
 * Client components cannot call paymentsEnabled() — it reads a server-only env
 * var. NEXT_PUBLIC_PAYMENTS_ENABLED mirrors it for the browser. It is only a
 * copy switch: nothing about what the platform actually collects depends on it,
 * so a stale value changes wording, never money.
 */
export function paymentsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === "true";
}

export interface DepositCopy {
  /** Message key for the short label beside the amount. */
  labelKey: "labelPlatform" | "labelOwner";
  /** Message key for the sentence explaining who holds it. */
  explanationKey: "explainPlatform" | "explainOwner";
  /** Who physically takes the money. */
  heldBy: "platform" | "owner";
}

export function getDepositCopy(opts?: { client?: boolean }): DepositCopy {
  const canCollect = opts?.client ? paymentsEnabledClient() : paymentsEnabled();
  if (canCollect) {
    return {
      labelKey: "labelPlatform",
      explanationKey: "explainPlatform",
      heldBy: "platform",
    };
  }

  return {
    labelKey: "labelOwner",
    explanationKey: "explainOwner",
    heldBy: "owner",
  };
}
