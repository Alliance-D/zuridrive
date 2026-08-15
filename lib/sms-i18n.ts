/**
 * lib/sms-i18n.ts — render an SMS in the recipient's language.
 *
 * Pages get their locale from the URL. SMS has no URL and no request to read
 * one from: a cron job at 3am sending a renewal reminder has only the user
 * record. So the recipient's stored `User.locale` is the input here, and the
 * message is rendered from a key at send time rather than being built as
 * English at the call site.
 *
 * `createTranslator` rather than `getTranslations` because this must work with
 * no request scope at all — cron routes, webhook settlement, and the tests.
 *
 * Keep every string in the `sms` namespace GSM-7 safe. One character outside
 * that alphabet (an em dash, a curly apostrophe) switches the whole message to
 * UCS-2, which drops the segment size from 160 characters to 70 and multiplies
 * what the send costs. `npm run check:sms` enforces this.
 */

import { createTranslator } from "next-intl";
import enMessages from "@/messages/en.json";
import rwMessages from "@/messages/rw.json";

/** Every key callers may send, taken from the English file so it can't drift. */
export type SmsKey = keyof (typeof enMessages)["sms"];

export type SmsParams = Record<string, string | number | Date>;

/**
 * Only the locales with a translated `sms` namespace. sw and fr are declared in
 * routing but their message files are still empty, so they resolve to English
 * here — an English SMS is worth sending; a raw message key is not.
 */
const CATALOGUE = {
  en: enMessages,
  rw: rwMessages,
} as const;

function catalogueFor(locale: string | null | undefined) {
  return locale && locale in CATALOGUE
    ? CATALOGUE[locale as keyof typeof CATALOGUE]
    : CATALOGUE.en;
}

/**
 * Render `key` in `locale`, falling back to English if anything goes wrong.
 *
 * A missing key or a bad param must not stop the SMS: these carry booking
 * confirmations and OTP codes, so silence is worse than an English message.
 */
export function renderSms(
  key: SmsKey,
  params: SmsParams = {},
  locale?: string | null,
): string {
  const resolved = locale && locale in CATALOGUE ? locale : "en";

  try {
    const t = createTranslator({
      locale: resolved,
      messages: catalogueFor(resolved),
      namespace: "sms",
    });
    return t(key as never, params as never);
  } catch (error) {
    if (resolved === "en") {
      // Nothing left to fall back to — surface it rather than sending a
      // half-rendered string.
      console.error(`[SMS] Could not render "${key}" in English:`, error);
      return "";
    }
    console.error(`[SMS] Could not render "${key}" in ${resolved}:`, error);
    return renderSms(key, params, "en");
  }
}
