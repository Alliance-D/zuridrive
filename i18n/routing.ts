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
  // rw, sw and fr are declared now so the URL structure and switcher are built
  // for four languages from the start. Their message files can stay partial —
  // next-intl falls back to the default locale per key, so an untranslated
  // string shows in English rather than breaking the page.
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
