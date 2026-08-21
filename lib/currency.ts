// =============================================================================
// ZuriDrive — money formatting
//
// The currency code comes from configuration rather than the function name, so
// a second market is a deployment setting rather than an edit to several
// hundred call sites. It defaults to RWF, which is what Rwanda runs on.
//
// This is deployment config, not editable platform data: one deployment serves
// one market. A single deployment serving several currencies at once would
// need the currency carried on each booking, which is a different and much
// larger change.
//
// Amounts are integers with no decimal part, which is how RWF, UGX and TZS are
// used in practice. A currency with meaningful minor units — KES cents — would
// need the stored values reconsidered too, not just this formatter, since
// every amount in the database is a whole number.
// =============================================================================

/** ISO code shown beside amounts. NEXT_PUBLIC_ so client components can read it. */
const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY?.trim() || "RWF";

/** Locale used for digit grouping only — not for choosing the currency. */
const GROUPING_LOCALE = process.env.NEXT_PUBLIC_NUMBER_LOCALE?.trim() || "en-US";

/** The configured currency code, for anywhere that needs to name it. */
export const currencyCode = CURRENCY;

/**
 * Formats an integer amount for display.
 * @param amount - Whole-unit amount (e.g. 15000)
 * @returns e.g. "RWF 15,000"
 */
export function formatMoney(amount: number): string {
  // Round to nearest integer — no decimals ever
  const rounded = Math.round(amount);
  return `${CURRENCY} ${rounded.toLocaleString(GROUPING_LOCALE)}`;
}

/**
 * Formats a compact amount for tight spaces (e.g. card badges)
 * @param amount - Whole-unit amount
 * @returns e.g. "RWF 15K" or "RWF 1.5M"
 */
export function formatMoneyCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return `${CURRENCY} ${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${CURRENCY} ${(amount / 1_000).toFixed(0)}K`;
  }
  return formatMoney(amount);
}

/**
 * Parses a user-entered amount to an integer.
 * Strips grouping separators, spaces, and the currency code.
 * Returns null if not a valid amount.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input
    // The configured code, and RWF regardless — someone typing an amount into
    // a Rwandan deployment may well type "RWF" out of habit even after the
    // code changes, and it costs nothing to accept it.
    .replace(new RegExp(CURRENCY, "gi"), "")
    .replace(/RWF/gi, "")
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  const parsed = parseInt(cleaned, 10);
  if (isNaN(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Calculates commission amount (20% by default)
 * Commission applies ONLY to base rental + driver surcharge
 * Never on deposit or delivery fees
 */
export function calcCommission(
  baseAmount: number,
  driverTotal: number,
  rate: number = 20
): number {
  return Math.round(((baseAmount + driverTotal) * rate) / 100);
}

/**
 * Calculates owner net earnings after commission
 */
export function calcOwnerEarnings(
  baseAmount: number,
  driverTotal: number,
  deliveryFee: number,
  commissionRate: number = 20
): number {
  const commissionable = baseAmount + driverTotal;
  const commission = Math.round((commissionable * commissionRate) / 100);
  // Owner gets: (base + driver - commission) + delivery fee
  // Delivery fee is NOT subject to commission
  return commissionable - commission + deliveryFee;
}
