/**
 * scripts/check-sms.mjs — the two ways an SMS message breaks silently.
 *
 * 1. GSM-7. Africa's Talking bills per segment. A message written entirely in
 *    the GSM-7 alphabet fits 160 characters per segment; one character outside
 *    it — an em dash, a curly apostrophe, the kind of thing an editor inserts
 *    without asking — switches the whole message to UCS-2 and drops that to 70.
 *    The message still sends, so nothing looks wrong; the bill is just higher.
 *
 * 2. ICU. A malformed plural or a param the message expects and the call site
 *    does not pass throws at send time, inside a cron job, at 3am.
 *
 * Neither shows up in a typecheck, so both are checked here.
 *
 *   node scripts/check-sms.mjs
 */

import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";

const LOCALES = ["en", "rw"];

const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);

/** The GSM 03.38 basic set, plus the extension characters that cost two. */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå_ÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

/** Placeholder syntax is consumed by ICU and never reaches the wire. */
const ICU_SYNTAX = "{}#";

/** Params wide enough to exercise every message; extras are ignored. */
const SAMPLE = {
  code: "123456",
  minutes: 5,
  owner: "Jean Bosco",
  client: "Alice",
  car: "Toyota RAV4",
  start: new Date("2026-09-01T00:00:00Z"),
  end: new Date("2026-09-05T00:00:00Z"),
  date: new Date("2026-10-01T00:00:00Z"),
  amount: "RWF 120,000",
  price: "RWF 30,000",
  withheld: "RWF 10,000",
  returned: "RWF 40,000",
  remaining: "RWF 20,000",
  reference: "ZD-20260901-4821",
  reason: "The car developed a mechanical fault",
  description: "Fuel shortfall at return",
  body: "Scheduled maintenance tonight",
  method: "MTN_MOMO",
  role: "client",
  url: "https://zuridrive.rw",
  plan: "Pro",
  pickup: "Kigali Heights",
  count: 2,
  days: 3,
};

const problems = [];
const rendered = [];

for (const locale of LOCALES) {
  const sms = messages[locale].sms ?? {};

  for (const [key, template] of Object.entries(sms)) {
    // --- GSM-7, checked on the template ------------------------------------
    for (const ch of template) {
      if (
        !GSM_BASIC.includes(ch) &&
        !GSM_EXTENDED.includes(ch) &&
        !ICU_SYNTAX.includes(ch)
      ) {
        problems.push(
          `${locale}.${key}: ${JSON.stringify(ch)} is outside GSM-7 — ` +
            `this message would send as UCS-2 at 70 chars/segment`,
        );
        break;
      }
    }

    // --- ICU, checked by actually rendering it -----------------------------
    try {
      const t = createTranslator({
        locale,
        messages: messages[locale],
        namespace: "sms",
      });
      const out = t(key, SAMPLE);
      if (out.startsWith("sms.")) {
        problems.push(`${locale}.${key}: did not resolve`);
      } else {
        rendered.push([out.length, locale, key]);
      }
    } catch (error) {
      problems.push(`${locale}.${key}: ${String(error).split("\n")[0]}`);
    }
  }
}

// Parity, so a key cannot exist in one locale and not the other.
const [en, rw] = LOCALES.map((l) => Object.keys(messages[l].sms ?? {}));
for (const k of en) if (!rw.includes(k)) problems.push(`sms.${k} missing from rw`);
for (const k of rw) if (!en.includes(k)) problems.push(`sms.${k} missing from en`);

if (problems.length) {
  console.error(`\n${problems.length} SMS problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

// Informational: a two-segment message costs twice as much to send. Sample
// params are on the long side, so this is an upper bound rather than a verdict.
rendered.sort((a, b) => b[0] - a[0]);
const long = rendered.filter(([n]) => n > 160);
if (long.length) {
  console.log(`\n${long.length} message(s) over 160 chars with sample params:`);
  for (const [n, locale, key] of long.slice(0, 10)) {
    console.log(`  ${String(n).padStart(3)}  ${locale}.${key}`);
  }
}

console.log(
  `\nAll ${rendered.length} SMS messages are GSM-7 safe and render in ${LOCALES.join("/")}.`,
);
