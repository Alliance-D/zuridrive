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

import { readFileSync, readdirSync, statSync } from "node:fs";
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

if (dynamic.length) {
  console.log(`\n${dynamic.length} dynamic key(s) — not statically checkable:`);
  for (const d of dynamic) console.log(`  ${d.file}  ${d.ns}.${d.expr}`);
}

if (missing.length) {
  console.error(`\n${missing.length} MISSING key reference(s):`);
  for (const m of missing) {
    console.error(`  ${m.file}\n    ${m.key}  (missing in ${m.locale})`);
  }
  process.exit(1);
}

console.log("\nAll static t() references resolve in en and rw.");
