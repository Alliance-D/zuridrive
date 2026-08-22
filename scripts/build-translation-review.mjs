/**
 * scripts/build-translation-review.mjs
 *
 * Builds a document a Kinyarwanda speaker can actually review.
 *
 * The problem this solves is not technical. The Kinyarwanda is complete — 2,426
 * strings — and no native speaker has ever read it. Asking someone to review it
 * as it stands means asking them to read JSON, which rules out most of the
 * people whose opinion is worth having.
 *
 * So this produces a single page, readable on a phone, with the English and the
 * Kinyarwanda side by side and a place to write what is wrong. No tools, no
 * checkout, no account.
 *
 * Ordered by what it costs to get wrong rather than alphabetically:
 *
 *   1. SMS       — sent to real phones, costs money per message, cannot be
 *                  corrected after sending
 *   2. Booking   — where somebody is deciding to part with money
 *   3. The rest of the customer-facing site
 *   4. Admin     — staff can work around an awkward phrase; customers cannot
 *
 * It also flags a class of real bug: a placeholder that exists in the English
 * and not the Kinyarwanda. "{amount}" going missing does not read oddly, it
 * renders an SMS with a blank where the price should be.
 *
 *   node scripts/build-translation-review.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const en = JSON.parse(readFileSync("messages/en.json", "utf8"));
const rw = JSON.parse(readFileSync("messages/rw.json", "utf8"));

/** Ordered by consequence. Anything not listed follows, alphabetically. */
const PRIORITY = [
  ["sms", "Text messages", "Sent to real phones. Costs money per message, and cannot be taken back."],
  ["notification", "Notifications", "Shown in the app's notification centre."],
  ["booking", "Booking", "The screens where somebody is deciding to spend money."],
  ["auth", "Signing in", "First contact. A confusing word here loses the account."],
  ["home", "Home page", "The first thing most people read."],
  ["cars", "Browsing cars", null],
  ["carDetail", "Car details", null],
  ["dashboard", "Renter dashboard", null],
  ["trip", "During a trip", "Handover, photos, returning the car."],
  ["deposit", "Deposits", "Money the renter expects back — worth being exact."],
  ["owner", "Owner dashboard", null],
  ["carForm", "Listing a car", null],
  ["finance", "Money and payouts", null],
  ["enum", "Labels and statuses", "Short words that appear throughout."],
  ["nav", "Navigation", null],
  ["footer", "Footer", null],
];

/** Reviewed last: staff can work around an awkward phrase. */
const LOW_PRIORITY = ["admin", "adminForms", "adminActions", "analytics"];

/** Flatten to dotted keys so a correction can be located precisely. */
function flatten(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") Object.assign(out, flatten(v, key));
    else out[key] = v;
  }
  return out;
}

/**
 * The arguments the system fills in: {name}, {amount, number}, {count, plural…}.
 *
 * Only arguments at the top level of the string. Anything deeper is the body of
 * a plural or select branch, not an argument — in
 * "{role, select, client {client} other {owner}}" the inner {client} is the
 * word to print, not a value to substitute.
 *
 * Both mistakes were made before this: matching every {word} flagged all 46
 * properly pluralised Kinyarwanda strings as broken, and requiring a comma or
 * brace after the name still flagged the select branches. Neither was a real
 * problem, and a checker that cries wolf 46 times gets ignored on the one
 * occasion it is right.
 */
function placeholders(text) {
  const found = [];
  let depth = 0;
  const str = String(text);

  for (let i = 0; i < str.length; i++) {
    if (str[i] === "}") {
      depth -= 1;
      continue;
    }
    if (str[i] !== "{") continue;

    if (depth === 0) {
      // An argument name runs to a comma or the closing brace.
      const name = str.slice(i + 1).match(/^\s*(\w+)\s*[,}]/);
      if (name) found.push(name[1]);
    }
    depth += 1;
  }

  return found.sort();
}

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Highlight placeholders so a reviewer can see what not to translate. */
const markPlaceholders = (s) =>
  escape(s).replace(/\{[^}]+\}/g, (m) => `<span class="ph">${m}</span>`);

const groups = [];
const seen = new Set();

for (const [key, title, note] of PRIORITY) {
  if (!en[key]) continue;
  groups.push({ key, title, note, priority: true });
  seen.add(key);
}
for (const key of Object.keys(en)) {
  if (key.startsWith("_") || seen.has(key) || LOW_PRIORITY.includes(key)) continue;
  groups.push({ key, title: key, note: null, priority: true });
  seen.add(key);
}
for (const key of LOW_PRIORITY) {
  if (!en[key]) continue;
  groups.push({ key, title: `${key} (staff screens)`, note: "Lower priority — only staff read these.", priority: false });
}

let totalStrings = 0;
let totalMismatches = 0;
const sections = [];

for (const g of groups) {
  const flatEn = flatten(en[g.key] ?? {});
  const flatRw = flatten(rw[g.key] ?? {});
  const rows = [];

  for (const [key, english] of Object.entries(flatEn)) {
    const kinya = flatRw[key];
    const pEn = placeholders(english);
    const pRw = placeholders(kinya ?? "");
    const mismatch =
      kinya !== undefined && JSON.stringify(pEn) !== JSON.stringify(pRw);

    if (mismatch) totalMismatches += 1;
    totalStrings += 1;

    rows.push({ key, english, kinya, mismatch, missing: kinya === undefined });
  }

  if (rows.length) sections.push({ ...g, rows });
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ZuriDrive — Kinyarwanda review</title>
<style>
  :root { --bg:#F7F5F0; --card:#fff; --ink:#1C1C1C; --soft:#5B6472;
          --line:#DDD5C8; --brand:#1B4332; --flag:#96700D; }
  * { box-sizing: border-box; }
  body { margin:0; padding:0 0 4rem; background:var(--bg); color:var(--ink);
         font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif; }
  header { background:var(--brand); color:#fff; padding:1.5rem 1rem; }
  h1 { margin:0 0 .4rem; font-size:1.3rem; }
  header p { margin:.3rem 0 0; opacity:.85; font-size:.9rem; }
  main { max-width:820px; margin:0 auto; padding:1rem; }
  .intro { background:var(--card); border:1px solid var(--line); border-radius:12px;
           padding:1rem; margin-bottom:1.5rem; }
  .intro ol { margin:.5rem 0 0; padding-left:1.2rem; }
  .intro li { margin:.3rem 0; }
  h2 { font-size:1.05rem; margin:2rem 0 .3rem; color:var(--brand); }
  .note { color:var(--soft); font-size:.85rem; margin:0 0 .8rem; }
  .row { background:var(--card); border:1px solid var(--line); border-radius:10px;
         padding:.8rem; margin-bottom:.6rem; }
  .row.flag { border-color:var(--flag); border-width:2px; }
  .en { margin:0 0 .5rem; }
  .rw { margin:0; color:var(--brand); font-weight:500; }
  .rw.absent { color:#B45309; font-style:italic; font-weight:400; }
  .key { display:block; margin-top:.5rem; font:11px ui-monospace,monospace;
         color:var(--soft); word-break:break-all; }
  .ph { background:#FDF2D8; border-radius:3px; padding:0 3px;
        font:12px ui-monospace,monospace; }
  .warn { margin:.5rem 0 0; padding:.4rem .6rem; background:#FDF2D8;
          border-radius:6px; font-size:.82rem; color:#7C5E0A; }
  .label { font-size:.7rem; text-transform:uppercase; letter-spacing:.06em;
           color:var(--soft); display:block; }
</style>
</head>
<body>
<header>
  <h1>ZuriDrive — Kinyarwanda review</h1>
  <p>${totalStrings.toLocaleString()} phrases · ${totalMismatches} needing a closer look</p>
</header>
<main>
  <div class="intro">
    <strong>What this is</strong>
    <p style="margin:.4rem 0 0">Every phrase on ZuriDrive, in English and in
    Kinyarwanda. The Kinyarwanda has never been checked by a Kinyarwanda
    speaker, which is what this is for.</p>
    <ol>
      <li>Read the English, then the Kinyarwanda below it.</li>
      <li>If the Kinyarwanda is wrong, unnatural, or too formal, note the small
      grey code underneath it and what it should say.</li>
      <li>Text in <span class="ph">{braces}</span> is filled in by the system —
      a name, an amount, a date. Leave it exactly as it is.</li>
      <li>The most important sections come first. Text messages are at the top
      because they go to real phones and cannot be corrected once sent.</li>
    </ol>
  </div>
${sections
  .map(
    (s) => `
  <h2>${escape(s.title)}</h2>
  ${s.note ? `<p class="note">${escape(s.note)}</p>` : ""}
  ${s.rows
    .map(
      (r) => `<div class="row${r.mismatch || r.missing ? " flag" : ""}">
    <p class="en"><span class="label">English</span>${markPlaceholders(r.english)}</p>
    <p class="rw${r.missing ? " absent" : ""}"><span class="label">Kinyarwanda</span>${
      r.missing ? "— not translated —" : markPlaceholders(r.kinya)
    }</p>
    ${
      r.mismatch
        ? `<p class="warn">The bracketed parts do not match the English. Something the
           system fills in may come out blank.</p>`
        : ""
    }
    <span class="key">${escape(r.key)}</span>
  </div>`,
    )
    .join("\n  ")}`,
  )
  .join("\n")}
</main>
</body>
</html>`;

writeFileSync("translation-review.html", html);

console.log(`Wrote translation-review.html`);
console.log(`  ${totalStrings.toLocaleString()} phrases across ${sections.length} sections`);
if (totalMismatches) {
  console.log(`  ${totalMismatches} with placeholder differences — flagged in the page`);
}
