// =============================================================================
// ZuriDrive — phone numbers
//
// The phone number IS the account identifier here, so it has to be stored in
// exactly one shape. Two users typing 0788123456 and +250788123456 are the
// same person, and a unique constraint does not know that.
//
// Everything is normalised to E.164 on the way in.
//
// This lived as a copy-pasted local function in two route files before. That
// is the kind of duplication that eventually diverges, and when the two copies
// of your identity normaliser disagree, users get duplicate accounts.
//
// ── One deployment, several markets ─────────────────────────────────────────
//
// The rules are a table rather than hardcoded regexes, so a new market is an
// entry rather than an edit. They are duplicated from the Country table on
// purpose: normalisation runs during sign-up and in client components, and
// neither can wait on a database round trip to decide whether a number is
// valid. The check-countries script fails if the two ever disagree.
// =============================================================================

export interface PhoneFormat {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** E.164 dialling prefix, with the plus. */
  prefix: string;
  /** Digits after the prefix. */
  nationalDigits: number;
  /** How to group the digits for display. Must sum to nationalDigits. */
  grouping: number[];
}

/**
 * Markets whose numbers this understands.
 *
 * All four East African numbers are nine digits after the prefix, written
 * locally with a leading zero — so the shapes are the same and only the prefix
 * differs. That is why the table is this small.
 */
export const PHONE_FORMATS: Record<string, PhoneFormat> = {
  RW: { code: "RW", prefix: "+250", nationalDigits: 9, grouping: [3, 3, 3] },
  UG: { code: "UG", prefix: "+256", nationalDigits: 9, grouping: [3, 3, 3] },
  KE: { code: "KE", prefix: "+254", nationalDigits: 9, grouping: [3, 3, 3] },
  TZ: { code: "TZ", prefix: "+255", nationalDigits: 9, grouping: [3, 3, 3] },
};

/** The market assumed when a caller does not say. */
export const DEFAULT_COUNTRY = "RW";

/**
 * Normalises a number to E.164, or returns null if it is not a valid number
 * for the given market.
 *
 * Accepts, for Rwanda: +250788123456, 250788123456, 0788123456 — with or
 * without spaces, dashes and parentheses.
 *
 * A number already carrying another market's prefix is returned as-is when
 * that market is one we know: somebody signing up in Kigali may well have a
 * Ugandan number, and rejecting it would lock out exactly the cross-border
 * traveller this platform exists to serve.
 */
export function normalizePhone(
  phone: string,
  countryCode: string = DEFAULT_COUNTRY,
): string | null {
  const cleaned = phone.replace(/[\s\-()]/g, "");

  const format = PHONE_FORMATS[countryCode.toUpperCase()];
  if (!format) return null;

  const digits = format.nationalDigits;
  const bare = format.prefix.slice(1); // "250"

  // Already E.164 for this market.
  if (new RegExp(`^\\+${bare}[0-9]{${digits}}$`).test(cleaned)) return cleaned;

  // International, missing the plus.
  if (new RegExp(`^${bare}[0-9]{${digits}}$`).test(cleaned)) return `+${cleaned}`;

  // Local, leading zero.
  if (new RegExp(`^0[0-9]{${digits}}$`).test(cleaned)) {
    return `${format.prefix}${cleaned.slice(1)}`;
  }

  // A valid number from another market we serve. Checked last so the caller's
  // own market always wins an ambiguous string.
  for (const other of Object.values(PHONE_FORMATS)) {
    if (other.code === format.code) continue;
    const otherBare = other.prefix.slice(1);
    if (new RegExp(`^\\+${otherBare}[0-9]{${other.nationalDigits}}$`).test(cleaned)) {
      return cleaned;
    }
    if (new RegExp(`^${otherBare}[0-9]{${other.nationalDigits}}$`).test(cleaned)) {
      return `+${cleaned}`;
    }
  }

  return null;
}

/** True when the value is a usable number for that market. */
export function isValidPhone(
  phone: string,
  countryCode: string = DEFAULT_COUNTRY,
): boolean {
  return normalizePhone(phone, countryCode) !== null;
}

/** Which market an E.164 number belongs to, or null if it is not one of ours. */
export function countryOfPhone(e164: string): string | null {
  for (const format of Object.values(PHONE_FORMATS)) {
    if (e164.startsWith(format.prefix)) return format.code;
  }
  return null;
}

/** Display form: +250 788 123 456. Groups by the number's own market. */
export function formatPhone(
  phone: string,
  countryCode: string = DEFAULT_COUNTRY,
): string {
  const e164 = normalizePhone(phone, countryCode);
  if (!e164) return phone;

  // Group by whichever market the number actually belongs to, which is not
  // necessarily the one it was normalised against.
  const owning = countryOfPhone(e164);
  const format = owning ? PHONE_FORMATS[owning] : PHONE_FORMATS[countryCode.toUpperCase()];
  if (!format) return e164;

  const digits = e164.slice(format.prefix.length);
  const parts: string[] = [];
  let at = 0;
  for (const size of format.grouping) {
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return `${format.prefix} ${parts.filter(Boolean).join(" ")}`;
}

// ── Compatibility ───────────────────────────────────────────────────────────
//
// The Rwanda-specific names are kept so existing call sites keep working and
// keep meaning what they said. New code should call the country-aware
// functions above.

/** @deprecated Use normalizePhone(phone, "RW"). */
export function normalizeRwandaPhone(phone: string): string | null {
  return normalizePhone(phone, "RW");
}

/** @deprecated Use isValidPhone(phone, "RW"). */
export function isRwandaPhone(phone: string): boolean {
  return isValidPhone(phone, "RW");
}

/** @deprecated Use formatPhone(phone, "RW"). */
export function formatRwandaPhone(phone: string): string {
  return formatPhone(phone, "RW");
}
