/**
 * Locale-aware labels for database enums.
 *
 * lib/labels.ts formats an enum value into readable English by algorithm
 * (SUV stays SUV, MINIBUS becomes Minibus). That is fine for one language and
 * useless for four — you cannot derive "Esansi" from "PETROL".
 *
 * So the labels live in messages/*.json under `enum`, and this reads them. A
 * value with no entry falls back to the algorithmic English rather than showing
 * a raw key, which keeps a half-translated locale readable.
 *
 * Some values are deliberately identical across locales — SUV, Hybrid,
 * Automatic, Manual are the words used in Kinyarwanda too. Inventing
 * translations for those would read as stilted rather than helpful.
 */

import { getTranslations } from "next-intl/server";
import { formatEnumLabel } from "@/lib/labels";

export type EnumKind =
  | "category"
  | "fuelType"
  | "transmission"
  | "fuelPolicy"
  | "bookingStatus"
  | "payoutStatus"
  | "ticketCategory"
  | "ticketStatus"
  | "analyticsLevel"
  | "carStatus"
  | "disputeStatus"
  | "disputeType"
  | "userRole"
  | "paymentStatus"
  | "depositStatus"
  | "chargeType"
  | "chargeStatus"
  | "subscriptionStatus"
  | "rentalType"
  | "tripScope"
  | "disputeTypeLong"
  | "resolutionOutcome"
  | "fuelPolicyLong"
  | "depositMovement";

/**
 * Server-side label lookup.
 *
 * The locale must be passed explicitly. getTranslations() without one resolves
 * a locale of its own, which renders English inside an otherwise translated
 * page — a failure that is invisible until someone reads the page in anger.
 */
export async function getEnumLabeller(locale: string) {
  const t = await getTranslations({ locale, namespace: "enum" });

  return (kind: EnumKind, value: string | null | undefined): string => {
    if (!value) return "";
    try {
      return t(`${kind}.${value}` as never);
    } catch {
      return formatEnumLabel(value);
    }
  };
}

/** What getEnumLabeller returns, for components that take it as a prop. */
export type EnumLabeller = Awaited<ReturnType<typeof getEnumLabeller>>;
