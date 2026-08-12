// =============================================================================
// ZuriDrive — Rwandan phone numbers
//
// The phone number IS the account identifier here, so it has to be stored in
// exactly one shape. Two users typing 0788123456 and +250788123456 are the
// same person, and a unique constraint does not know that.
//
// Everything is normalised to E.164 (+250XXXXXXXXX) on the way in.
//
// This lived as a copy-pasted local function in two route files before. That
// is the kind of duplication that eventually diverges, and when the two copies
// of your identity normaliser disagree, users get duplicate accounts.
// =============================================================================

/**
 * Normalises a Rwandan number to E.164, or returns null if it isn't one.
 *
 * Accepts: +250788123456, 250788123456, 0788123456 — with or without spaces,
 * dashes and parentheses.
 */
export function normalizeRwandaPhone(phone: string): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, "");

  // Already E.164.
  if (/^\+250[0-9]{9}$/.test(cleaned)) return cleaned;

  // International, missing the plus.
  if (/^250[0-9]{9}$/.test(cleaned)) return `+${cleaned}`;

  // Local, leading zero.
  if (/^0[0-9]{9}$/.test(cleaned)) return `+250${cleaned.slice(1)}`;

  return null;
}

/** True when the value is a usable Rwandan number. */
export function isRwandaPhone(phone: string): boolean {
  return normalizeRwandaPhone(phone) !== null;
}

/** Display form: +250 788 123 456. */
export function formatRwandaPhone(phone: string): string {
  const e164 = normalizeRwandaPhone(phone);
  if (!e164) return phone;

  const digits = e164.slice(4); // drop +250
  return `+250 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}
