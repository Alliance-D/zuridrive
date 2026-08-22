/**
 * lib/contact-detection.ts
 *
 * Spots what looks like a phone number in free text.
 *
 * This exists for the renter's note on a booking, where somebody occasionally
 * writes "call me on 0788…, we can arrange it cheaper directly". That is how a
 * marketplace loses the booking it introduced.
 *
 * It flags. It does not block, and it is not evidence of anything on its own:
 *
 *   • Renters and owners exchange numbers through the platform as a matter of
 *     course — the owner is sent the renter's number by SMS. Somebody
 *     repeating it in the note is usually being helpful, not evasive.
 *   • Blocking on a false positive is worse than missing a true one. A flight
 *     number, a plate, a house number and a date all look like digits.
 *
 * So the bar here is deliberately set at "this is probably a phone number",
 * and what happens next is that an admin can see it — not that the renter is
 * stopped mid-booking.
 */

/** What was found, for showing an admin why something was flagged. */
export interface ContactMatch {
  /** The matched text, as written. */
  text: string;
  /** Why it was flagged, in words an admin can act on. */
  reason: string;
}

/**
 * Digit-only runs long enough to be a number in any market we serve.
 *
 * Nine national digits everywhere in East Africa, so anything from nine digits
 * up is a candidate once separators are stripped.
 */
const MIN_DIGITS = 9;

/** Words people use to write a number out when they know digits are noticed. */
const SPELLED_DIGITS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4",
  five: "5", six: "6", seven: "7", eight: "8", nine: "9",
  // Kinyarwanda
  zeru: "0", rimwe: "1", kabiri: "2", gatatu: "3", kane: "4",
  gatanu: "5", gatandatu: "6", karindwi: "7", umunani: "8", icyenda: "9",
};

/**
 * Finds things that look like phone numbers.
 *
 * Returns every match rather than a boolean so an admin can be shown what was
 * spotted, which is the difference between a useful flag and an unexplained
 * warning label.
 */
export function findContactDetails(text: string): ContactMatch[] {
  if (!text?.trim()) return [];

  const matches: ContactMatch[] = [];

  // ── Plain digit runs, however they are spaced or punctuated ──────────────
  // "0788 123 456", "0788-123-456", "+250 788 123 456" all collapse to the
  // same thing. Requires the separators to be consistent enough that this is
  // not just a sentence with numbers in it.
  const runs = text.match(/(?:\+?\d[\d\s\-().]{7,}\d)/g) ?? [];
  for (const run of runs) {
    const digits = run.replace(/\D/g, "");
    if (digits.length >= MIN_DIGITS && digits.length <= 15) {
      matches.push({
        text: run.trim(),
        reason: `${digits.length} digits together — long enough to be a phone number`,
      });
    }
  }

  // ── Numbers written as words ─────────────────────────────────────────────
  // Someone spelling out "zero seven eight eight" is not doing it by accident.
  const words = text.toLowerCase().split(/[\s,.-]+/);
  let streak = 0;
  let streakWords: string[] = [];
  for (const word of words) {
    if (word in SPELLED_DIGITS) {
      streak += 1;
      streakWords.push(word);
    } else {
      if (streak >= 6) {
        matches.push({
          text: streakWords.join(" "),
          reason: `${streak} digits written as words`,
        });
      }
      streak = 0;
      streakWords = [];
    }
  }
  if (streak >= 6) {
    matches.push({
      text: streakWords.join(" "),
      reason: `${streak} digits written as words`,
    });
  }

  return matches;
}

/** Whether the text looks like it carries contact details. */
export function hasContactDetails(text: string): boolean {
  return findContactDetails(text).length > 0;
}
