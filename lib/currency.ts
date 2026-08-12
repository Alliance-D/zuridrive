// =============================================================================
// ZuriDrive — Currency Formatter
// All monetary values are in RWF (Rwandan Franc)
// Format: RWF 15,000 — never decimals, never raw numbers alone
// =============================================================================

/**
 * Formats an integer amount as RWF currency string
 * @param amount - Integer amount in RWF (e.g. 15000)
 * @returns Formatted string (e.g. "RWF 15,000")
 */
export function formatRWF(amount: number): string {
  // Round to nearest integer — no decimals ever
  const rounded = Math.round(amount);
  return `RWF ${rounded.toLocaleString("en-US")}`;
}

/**
 * Formats a compact amount for display in tight spaces (e.g. card badges)
 * @param amount - Integer amount in RWF
 * @returns Compact string (e.g. "RWF 15K" or "RWF 1.5M")
 */
export function formatRWFCompact(amount: number): string {
  if (amount >= 1_000_000) {
    return `RWF ${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `RWF ${(amount / 1_000).toFixed(0)}K`;
  }
  return formatRWF(amount);
}

/**
 * Parses a user-entered number string to an integer RWF amount
 * Strips commas, spaces, "RWF" prefix
 * Returns null if not a valid number
 */
export function parseRWF(input: string): number | null {
  const cleaned = input
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
