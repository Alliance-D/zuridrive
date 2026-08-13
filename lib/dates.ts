/**
 * Locale-aware date formatting.
 *
 * Pages used to call `toLocaleDateString("en-RW")` directly, which pins every
 * date to English regardless of the page's language. Node's ICU carries real
 * month names for all four of our locales — March is "Werurwe" in Kinyarwanda
 * and "Mac" in Kiswahili — so there is no reason to throw that away.
 *
 * The locale must be passed in. There is no ambient "current locale" on the
 * server, and guessing one is how a translated page ends up with English dates.
 */

/** 9 Werurwe 2026 — for prose and list rows. */
export function formatDate(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** 9 Werurwe 2026, 14:30 — where the time of day matters. */
export function formatDateTime(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Werurwe 2026 — for month-grouped headings and reports. */
export function formatMonth(date: Date | string, locale: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString(locale, { month: "long", year: "numeric" });
}
