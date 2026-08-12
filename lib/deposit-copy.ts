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
  /** Short label beside the amount. */
  label: string;
  /** One sentence explaining who holds it and how it comes back. */
  explanation: string;
  /** Who physically takes the money. */
  heldBy: "platform" | "owner";
}

export function getDepositCopy(opts?: { client?: boolean }): DepositCopy {
  const canCollect = opts?.client ? paymentsEnabledClient() : paymentsEnabled();
  if (canCollect) {
    return {
      label: "Refundable deposit",
      explanation:
        "Held securely by ZuriDrive and returned in full once you and the owner both confirm the return.",
      heldBy: "platform",
    };
  }

  return {
    label: "Refundable deposit — paid to the owner",
    explanation:
      "You pay this directly to the owner when you collect the car, and they return it to you at handover. ZuriDrive doesn't hold it. Bring it with you.",
    heldBy: "owner",
  };
}
