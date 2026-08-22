/**
 * scripts/check-messages.mjs — verify every t() call resolves to a real key.
 *
 * The en/rw parity check compares the two message files against each other. It
 * cannot catch a key that is missing from BOTH, which is what happens when a
 * key is added to the wrong namespace: parity stays green and the page throws
 * MISSING_MESSAGE at runtime. That shipped once (admin.signOut added to `nav`),
 * so this checks the other direction — code against messages.
 *
 * Per file it maps translator variables to their namespace:
 *
 *   const t  = useTranslations("admin")
 *   const t  = await getTranslations({ locale, namespace: "admin" })
 *   const te = useTranslations("enum")
 *
 * then resolves every t("key") / t.rich("key") against the message tree.
 *
 * Template-literal keys — t(`${x}Title`) — cannot be resolved statically and
 * are reported separately as unchecked rather than silently ignored.
 *
 *   node scripts/check-messages.mjs
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib"];
const LOCALES = ["en", "rw"];

const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(`messages/${l}.json`, "utf8")),
  ]),
);

function resolve(tree, path) {
  return path
    .split(".")
    .reduce((node, part) => (node == null ? undefined : node[part]), tree);
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === ".next") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const missing = [];
const dynamic = [];
/** Dynamic keys this run managed to resolve after all. */
const resolvedDynamic = new Set();

for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = readFileSync(file, "utf8");
  if (!src.includes("Translations(")) continue;

  // variable -> namespaces. A name can map to more than one: a file often has
  // `const t` in generateMetadata and another `const t` in the component, on
  // different namespaces. Collect every binding and accept a key that resolves
  // under any of them, rather than guessing which scope a call sits in.
  const ns = {};
  const add = (v, n) => (ns[v] ??= new Set()).add(n);
  for (const m of src.matchAll(
    /const\s+(\w+)\s*=\s*useTranslations\(\s*["'`]([\w.]+)["'`]\s*\)/g,
  )) {
    add(m[1], m[2]);
  }
  for (const m of src.matchAll(
    /const\s+(\w+)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace:\s*["'`]([\w.]+)["'`]/gs,
  )) {
    add(m[1], m[2]);
  }
  if (Object.keys(ns).length === 0) continue;

  const vars = Object.keys(ns).sort((a, b) => b.length - a.length).join("|");

  // t("key") and t.rich("key")
  for (const m of src.matchAll(
    new RegExp(`\\b(${vars})(?:\\.rich)?\\(\\s*"([^"]+)"`, "g"),
  )) {
    const candidates = [...ns[m[1]]].map((n) => `${n}.${m[2]}`);
    for (const loc of LOCALES) {
      const ok = candidates.some(
        (full) => typeof resolve(messages[loc], full) === "string",
      );
      if (!ok) {
        missing.push({ file, key: candidates.join(" | "), locale: loc });
      }
    }
  }

  // t(`...${x}...`) — record, do not resolve
  for (const m of src.matchAll(
    new RegExp(`\\b(${vars})(?:\\.rich)?\\(\\s*\`([^\`]*\\$\\{[^\`]*)\``, "g"),
  )) {
    dynamic.push({ file, ns: [...ns[m[1]]].join("|"), expr: m[2] });
  }
}

// Notification keys are passed to createNotification as plain strings, not
// through t(), so the scan above never sees them. They fail the same silent
// way, so check them against the `notification` namespace here.
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = readFileSync(file, "utf8");
  // Scoped to files that actually write notifications. `titleKey` is also an
  // ordinary prop name elsewhere — EmptyState takes one that resolves against
  // `dashboard` — and checking those against `notification` reports nonsense.
  // `notification.create` is here because some routes write the row directly
  // through Prisma rather than through createNotification, and those were
  // exactly the ones that stayed English longest — nothing was looking at them.
  if (
    !/createNotification|notifyAdminsWithModule|sendSms|sendOtpSms|notification\.create/.test(
      src,
    )
  )
    continue;

  // sendSms takes `messageKey` against the `sms` namespace, the same way
  // createNotification takes titleKey/bodyKey against `notification`.
  for (const m of src.matchAll(/\bmessageKey:\s*["'`]([\w.]+)["'`]/g)) {
    const full = `sms.${m[1]}`;
    for (const loc of LOCALES) {
      if (typeof resolve(messages[loc], full) !== "string") {
        missing.push({ file, key: full, locale: loc });
      }
    }
  }

  if (!/titleKey|bodyKey/.test(src)) continue;
  for (const m of src.matchAll(/\b(?:titleKey|bodyKey):\s*["'`]([\w.]+)["'`]/g)) {
    const full = `notification.${m[1]}`;
    for (const loc of LOCALES) {
      if (typeof resolve(messages[loc], full) !== "string") {
        missing.push({ file, key: full, locale: loc });
      }
    }
  }
}


// ---------------------------------------------------------------------------
// Enum coverage.
//
// `t(`enum.${kind}.${value}`)` cannot be resolved by reading the call site, so
// the scan above can only list it as unchecked. But the values are not
// arbitrary: they come from Prisma enums, and the whole list is in the schema.
// A new enum value added there with no message key renders as a raw key on a
// page nobody may look at for weeks, which is exactly what happened to the
// analytics price table.
//
// Every EnumKind must appear below. A kind with no Prisma counterpart is
// listed as null so that adding one to the type and forgetting it here fails
// rather than silently skipping the check.
// ---------------------------------------------------------------------------
const ENUM_SOURCE = {
  category: "CarCategory",
  fuelType: "FuelType",
  transmission: "TransmissionType",
  fuelPolicy: "FuelPolicyType",
  fuelPolicyLong: "FuelPolicyType",
  bookingStatus: "BookingStatus",
  payoutStatus: "PayoutStatus",
  ticketCategory: "SupportCategory",
  ticketStatus: "SupportStatus",
  carStatus: "CarStatus",
  disputeType: "DisputeType",
  disputeTypeLong: "DisputeType",
  resolutionOutcome: "DisputeOutcome",
  userRole: "UserRole",
  paymentStatus: "PaymentStatus",
  depositStatus: "DepositStatus",
  chargeType: "ExtraChargeType",
  chargeStatus: "ExtraChargeStatus",
  subscriptionStatus: "SubscriptionStatus",
  rentalType: "RentalType",
  tripScope: "TripScope",
  // No Prisma enum behind these — they are our own vocabularies.
  analyticsLevel: null,
  disputeStatus: null,
  depositMovement: null,
};

const schema = readFileSync("prisma/schema.prisma", "utf8");

/** Values of a Prisma enum, ignoring comments and trailing notes. */
function prismaEnumValues(name) {
  const block = schema.match(new RegExp(`enum ${name} \\{([^}]*)\\}`));
  if (!block) return null;
  return block[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => /^[A-Z_][A-Z0-9_]*$/.test(line));
}

// Every kind the labeller declares has to be accounted for above.
const declaredKinds = [
  ...readFileSync("lib/enum-labels.ts", "utf8").matchAll(/^\s*\|\s*"(\w+)"/gm),
].map((m) => m[1]);

for (const kind of declaredKinds) {
  if (!(kind in ENUM_SOURCE)) {
    missing.push({
      file: "scripts/check-messages.mjs",
      key: `ENUM_SOURCE is missing "${kind}" — add it, or map it to null`,
      locale: "n/a",
    });
  }
}

for (const [kind, enumName] of Object.entries(ENUM_SOURCE)) {
  if (!enumName) continue;
  const values = prismaEnumValues(enumName);
  if (!values) {
    missing.push({
      file: "prisma/schema.prisma",
      key: `enum ${enumName} (referenced by ENUM_SOURCE.${kind}) not found`,
      locale: "n/a",
    });
    continue;
  }
  for (const value of values) {
    for (const loc of LOCALES) {
      if (typeof resolve(messages[loc], `enum.${kind}.${value}`) !== "string") {
        missing.push({ file: "prisma/schema.prisma", key: `enum.${kind}.${value}`, locale: loc });
      }
    }
  }
}


// ---------------------------------------------------------------------------
// Dynamic keys whose values live in the same file.
//
// `t(`${item.key}Title`)` looks unresolvable, but `item` comes from an array
// a few lines above with `key: "prop1"` in it. Collecting those literals turns
// most of the remaining dynamic keys into ordinary checkable ones, which
// matters because these drive the homepage and the owner onboarding — pages
// where a missing key is a raw string in front of every visitor.
// ---------------------------------------------------------------------------
for (const { file, ns: nsList, expr } of dynamic) {
  // Only the shape `${something.key}Suffix` or `${something.key}`, where the
  // suffix is plain text. Anything more involved stays unchecked.
  const shape = expr.match(/^\$\{[\w.]*key\}(\w*)$/);
  if (!shape) continue;

  const suffix = shape[1];
  const src = readFileSync(file, "utf8");
  const literals = [...src.matchAll(/key:\s*["'`]([\w.]+)["'`]/g)].map((m) => m[1]);
  if (literals.length === 0) continue;

  const namespaces = nsList.split("|");
  for (const literal of literals) {
    const candidates = namespaces.map((n) => `${n}.${literal}${suffix}`);
    for (const loc of LOCALES) {
      const ok = candidates.some(
        (full) => typeof resolve(messages[loc], full) === "string",
      );
      if (!ok) {
        missing.push({ file, key: candidates.join(" | "), locale: loc });
      }
    }
    resolvedDynamic.add(`${file}::${expr}`);
  }
}

// ---------------------------------------------------------------------------
// The last few dynamic shapes, each with an enumerable set of values.
// ---------------------------------------------------------------------------
for (const { file, ns: nsList, expr } of dynamic) {
  const namespaces = nsList.split("|");

  // enum.<kind>.${value} is already covered exhaustively by ENUM_SOURCE above,
  // so mark it resolved rather than reporting it as unchecked forever. Same
  // for the labeller itself, which is where that lookup lives.
  const enumKind = expr.match(/^(\w+)\.\$\{[^}]+\}$/);
  if (
    file.endsWith("enum-labels.ts") ||
    (nsList === "enum" && enumKind && enumKind[1] in ENUM_SOURCE)
  ) {
    resolvedDynamic.add(`${file}::${expr}`);
    continue;
  }

  let values = null;
  let prefix = "";

  // owner.allowance.${reason.key} — the AllowanceReason union.
  if (/^allowance\.\$\{[^}]*key\}$/.test(expr)) {
    const limits = readFileSync("lib/subscriptions/limits.ts", "utf8");
    values = [...limits.matchAll(/\|\s*\{\s*key:\s*"(\w+)"/g)].map((m) => m[1]);
    prefix = "allowance.";
  }

  // home.per${Day|Week|Month} — the RentalType union, title-cased.
  if (/^per\$\{/.test(expr)) {
    const union = readFileSync(file, "utf8").match(/type RentalType = ([^;]+);/);
    if (union) {
      values = [...union[1].matchAll(/"(\w+)"/g)].map(
        (m) => m[1][0].toUpperCase() + m[1].slice(1),
      );
      prefix = "per";
    }
  }

  if (!values || values.length === 0) continue;

  for (const value of values) {
    const candidates = namespaces.map((n) => `${n}.${prefix}${value}`);
    for (const loc of LOCALES) {
      const ok = candidates.some(
        (full) => typeof resolve(messages[loc], full) === "string",
      );
      if (!ok) missing.push({ file, key: candidates.join(" | "), locale: loc });
    }
  }
  resolvedDynamic.add(`${file}::${expr}`);
}

// Only the ones nothing above managed to pin down.
const stillDynamic = dynamic.filter(
  (d) => !resolvedDynamic.has(`${d.file}::${d.expr}`),
);

if (stillDynamic.length) {
  console.log(
    `\n${stillDynamic.length} dynamic key(s) — not statically checkable:`,
  );
  for (const d of stillDynamic) console.log(`  ${d.file}  ${d.ns}.${d.expr}`);
  console.log(
    "  (analytics.rating* is covered by tests/integration/analytics-labels.test.ts,\n" +
      "   which asserts on the keys the queries actually return.)",
  );
}

if (missing.length) {
  console.error(`\n${missing.length} MISSING key reference(s):`);
  for (const m of missing) {
    console.error(`  ${m.file}\n    ${m.key}  (missing in ${m.locale})`);
  }
  process.exit(1);
}

console.log("\nAll static t() references resolve in en and rw.");

/** Leaf strings in a nested message object. */
function countKeys(obj) {
  let n = 0;
  for (const v of Object.values(obj)) {
    n += v && typeof v === "object" ? countKeys(v) : 1;
  }
  return n;
}

// -- Is every offered language actually readable? ---------------------------
//
// A locale can be routable long before it is translated. Offering one that is
// empty makes the switcher a lie: somebody picks it, the page stays in
// English, and they conclude the site is broken rather than untranslated.
//
// So OFFERED_LOCALES has to be backed by real files. This refuses to let a
// language be advertised before it can be read.
const routingSource = readFileSync("i18n/routing.ts", "utf8");
const offered =
  routingSource
    .match(/OFFERED_LOCALES\s*=\s*\[([^\]]*)\]/)?.[1]
    ?.match(/"(\w+)"/g)
    ?.map((q) => q.replace(/"/g, "")) ?? [];

const englishTotal = countKeys(JSON.parse(readFileSync("messages/en.json", "utf8")));
const thin = [];

for (const locale of offered) {
  const file = `messages/${locale}.json`;
  if (!existsSync(file)) {
    thin.push(`${locale} is offered but ${file} does not exist`);
    continue;
  }
  const keys = countKeys(JSON.parse(readFileSync(file, "utf8")));
  // A little drift is normal while a translation catches up. An empty or
  // barely-started file is not a translation.
  if (keys < englishTotal * 0.9) {
    thin.push(
      `${locale} is offered but has ${keys} of ${englishTotal} strings ` +
        `(${Math.round((keys / englishTotal) * 100)}%)`,
    );
  }
}

if (thin.length) {
  console.error("\nLanguages offered before they are ready:\n");
  for (const t of thin) console.error(`  ${t}`);
  console.error(
    "\nEither finish the translation or take the locale out of " +
      "OFFERED_LOCALES in i18n/routing.ts.",
  );
  process.exit(1);
}

console.log(`${offered.length} language(s) offered to users: ${offered.join(", ")}.`);
