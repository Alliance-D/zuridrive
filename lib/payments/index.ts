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
};

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
