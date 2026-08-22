// =============================================================================
// ZuriDrive — Payment provider selection
//
// One place decides which provider is live. Everything else asks here rather
// than reaching for a specific implementation, so Phase 2 is a config change.
//
// Selection order:
//   1. PAYMENT_PROVIDER, if set explicitly
//   2. MTN MoMo, if it is configured AND able to collect
//   3. Flutterwave, if it is configured AND actually implemented
//   3. Direct settlement — the Phase 1 default
//
// Defaulting to DIRECT is deliberate. A misconfiguration should mean "we
// cannot take payments", never "take payments through a half-configured
// provider".
// =============================================================================

import type { PaymentProvider } from "@/lib/payments/provider";
import { directProvider } from "@/lib/payments/providers/direct";
import {
  flutterwaveProvider,
  flutterwaveConfigured,
} from "@/lib/payments/providers/flutterwave";
import { momoProvider, momoConfigured } from "@/lib/payments/providers/momo";

export type { PaymentProvider } from "@/lib/payments/provider";

const REGISTRY: Record<string, PaymentProvider> = {
  DIRECT: directProvider,
  FLUTTERWAVE: flutterwaveProvider,
  MTN_MOMO: momoProvider,
  // Country.paymentProvider stores the short name; both spellings resolve to
  // the same integration so a country row and an env var can be written the
  // way each reads naturally.
  MOMO: momoProvider,
};

/**
 * The provider that collects in a given market.
 *
 * Markets do not share a collector: MTN operates in Rwanda and Uganda but
 * under separate accounts, and neither covers Kenya, where M-Pesa is what
 * people actually use. The country row names the integration; the credentials
 * stay in configuration, because they are secrets and do not belong in a
 * table anyone with admin access can read.
 *
 * Falls back to the globally configured provider when a market names none, so
 * nothing changes for a single-market deployment.
 */
export function getPaymentProviderForCountry(
  providerName: string | null | undefined,
): PaymentProvider {
  if (!providerName) return getPaymentProvider();

  const provider = REGISTRY[providerName.toUpperCase()];
  if (!provider) {
    console.warn(
      `[payments] country names provider "${providerName}", which is not ` +
        `registered. Falling back to direct settlement.`,
    );
    return directProvider;
  }

  if (!provider.canCollect && providerName.toUpperCase() !== "DIRECT") {
    console.warn(
      `[payments] provider "${providerName}" cannot collect yet — this market ` +
        `settles directly with the owner.`,
    );
    return directProvider;
  }

  return provider;
}

export function getPaymentProvider(): PaymentProvider {
  const requested = process.env.PAYMENT_PROVIDER?.toUpperCase();

  if (requested && REGISTRY[requested]) {
    const provider = REGISTRY[requested];

    // Asking for a provider that cannot actually collect is a configuration
    // mistake worth being loud about, rather than silently falling back and
    // leaving somebody wondering why no money arrived.
    if (!provider.canCollect && requested !== "DIRECT") {
      console.warn(
        `[payments] PAYMENT_PROVIDER=${requested} is selected but cannot ` +
          `collect yet. Falling back to direct settlement.`,
      );
      return directProvider;
    }

    return provider;
  }

  // MoMo before Flutterwave: it is the integration that actually exists, and
  // mobile money is what most renters in Rwanda pay with.
  if (momoConfigured() && momoProvider.canCollect) {
    return momoProvider;
  }

  if (flutterwaveConfigured() && flutterwaveProvider.canCollect) {
    return flutterwaveProvider;
  }

  return directProvider;
}

/** True when the platform can actually take money. */
export function paymentsEnabled(): boolean {
  return getPaymentProvider().canCollect;
}
