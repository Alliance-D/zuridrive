/**
 * Locale routing.
 *
 * The locale lives in the URL path — /rw/cars, /en/cars — rather than in a
 * cookie. A cookie makes a shared link open in the reader's language instead of
 * the sender's, which is wrong when someone sends a friend a specific car, and
 * it gives Google nothing to index per language.
 *
 * English is the default locale — see the note on defaultLocale below. It is a
 * fallback decision rather than an audience one.
 */

import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Order matters only for readability; `defaultLocale` decides the fallback.
  //
  // Every locale the URLs understand. sw and fr are declared so the routes and
  // the switcher were built for four from the start, and so adding one later is
  // a message file rather than a routing change.
  //
  // Declared is NOT the same as offered — see OFFERED_LOCALES below.
  locales: ["en", "rw", "sw", "fr"],

  // English is the default because it is the fallback, and the fallback has to
  // be the one locale that is always complete. Every source string is written
  // in English, so a key missing from rw/sw/fr resolves to real text rather
  // than a raw key. If Kinyarwanda were the default, a missing Kinyarwanda key
  // would have nothing to fall back to.
  //
  // This is a technical default, not a statement about the audience. Most users
  // here read Kinyarwanda, which is what the language prompt is for.
  defaultLocale: "en",

  // Always prefix, including the default. /cars and /rw/cars resolving to the
  // same page would be duplicate content, and an unprefixed URL gives no
  // indication which language a shared link will open in.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

/** What the switcher shows. Endonyms — each language named in itself. */
export const LOCALE_LABELS: Record<Locale, string> = {
  rw: "Kinyarwanda",
  en: "English",
  sw: "Kiswahili",
  fr: "Français",
};

/**
 * The languages actually shown to people.
 *
 * A locale can be routable long before it is readable. sw.json and fr.json are
 * empty, so /sw/cars renders entirely in English — next-intl falls back per
 * key, which keeps the page working and makes the language switcher a lie:
 * somebody picks Swahili, nothing changes, and they conclude the site is
 * broken rather than untranslated.
 *
 * Offering a language you cannot yet read is worse than offering two you can.
 * So the switcher and the profile setting read this list, not `locales`, and a
 * language joins it when its file is filled in — checked by check-messages, so
 * this cannot claim a language the messages do not support.
 *
 * Kinyarwanda is here because it is complete. It has still not been read by a
 * native speaker, which is a separate and outstanding problem.
 */
export const OFFERED_LOCALES = ["en", "rw"] as const satisfies readonly Locale[];

/** Whether a locale is complete enough to offer. */
export function isOffered(locale: string): boolean {
  return (OFFERED_LOCALES as readonly string[]).includes(locale);
}
