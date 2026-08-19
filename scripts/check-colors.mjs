/**
 * scripts/check-colors.mjs
 *
 * The palette is defined twice, and both definitions are load-bearing:
 *
 *   lib/design/tokens.ts  → Tailwind utilities (text-ink-soft, bg-brand, …)
 *   app/globals.css       → hand-written CSS (var(--color-text-muted), …)
 *
 * Nothing makes them agree. Fixing a contrast failure in one file and
 * rebuilding leaves the other still failing, on whichever pages happen to use
 * the other mechanism — which is exactly how the accessibility pass went the
 * first time round.
 *
 * This does not merge them. It just refuses to let them drift apart quietly:
 * for every CSS variable with a counterpart token, the two must be the same
 * colour. Names differ by convention (--color-text-muted is ink.soft), so the
 * pairs are listed explicitly rather than inferred.
 *
 * Also re-checks the contrast that the accessibility work established, so a
 * later "just a shade lighter" has to argue with a number.
 */

import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const tokens = readFileSync("lib/design/tokens.ts", "utf8");

/** --color-<name> → the hex it is set to. */
const cssVars = {};
for (const m of css.matchAll(/--color-([\w-]+):\s*(#[0-9A-Fa-f]{6})/g)) {
  cssVars[m[1]] = m[2].toUpperCase();
}

/** Read one value out of a nested token group, e.g. ink.soft. */
function token(group, key) {
  const block = tokens.match(new RegExp(`\\b${group}:\\s*\\{([^}]*)\\}`, "s"));
  if (!block) return null;
  const hit = block[1].match(new RegExp(`\\b${key}:\\s*"(#[0-9A-Fa-f]{6})"`));
  return hit ? hit[1].toUpperCase() : null;
}

/**
 * The pairs that must agree. Left: CSS variable. Right: the token it mirrors.
 * Anything not listed here is deliberately one-sided.
 */
const PAIRS = [
  ["primary", ["brand", "DEFAULT"]],
  ["accent", ["accent", "DEFAULT"]],
  ["accent-light", ["accent", "light"]],
  ["accent-dark", ["accent", "dark"]],
  ["text", ["ink", "DEFAULT"]],
  ["text-muted", ["ink", "soft"]],
  ["text-subtle", ["ink", "faint"]],
  ["black", ["ink", "black"]],
];

const problems = [];

for (const [cssName, [group, key]] of PAIRS) {
  const a = cssVars[cssName];
  const b = token(group, key);
  if (!a || !b) {
    problems.push(`--color-${cssName} / ${group}.${key}: one side is missing`);
  } else if (a !== b) {
    problems.push(
      `--color-${cssName} is ${a} but ${group}.${key} is ${b} — these must match`,
    );
  }
}

// ── Contrast ────────────────────────────────────────────────────────────────
const luminance = (hex) => {
  const parts = hex.replace("#", "").match(/../g).map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
};
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Text colour, the lightest surface it appears on, and the ratio it owes. */
const CONTRAST = [
  ["text-muted", "bg", 4.5],
  ["text-muted", "surface", 4.5],
  ["text-subtle", "white", 4.5],
  ["text-subtle", "surface", 4.5],
  ["text", "bg", 4.5],
];

const measured = [];
for (const [fg, bg, need] of CONTRAST) {
  const f = cssVars[fg];
  const b = cssVars[bg];
  if (!f || !b) continue;
  const ratio = contrast(f, b);
  measured.push([fg, bg, ratio, need]);
  if (ratio < need) {
    problems.push(
      `--color-${fg} on --color-${bg} is ${ratio.toFixed(2)}:1, needs ${need}:1`,
    );
  }
}

if (problems.length) {
  console.error("Palette problems:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    "\nBoth files are load-bearing: Tailwind utilities read lib/design/tokens.ts," +
      "\nhand-written CSS reads app/globals.css. Change both.",
  );
  process.exit(1);
}

for (const [fg, bg, ratio, need] of measured) {
  console.log(`  ${fg} on ${bg}: ${ratio.toFixed(2)}:1 (needs ${need})`);
}
console.log(
  `\n${PAIRS.length} shared colours agree across globals.css and design tokens.`,
);
