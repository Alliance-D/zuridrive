/**
 * scripts/trap-appendchild.mjs — catch "Only one element on document allowed".
 *
 * That DOMException comes from appending a second element child to the
 * `document` node. Nothing in this codebase calls appendChild directly, so the
 * caller is either React, the Next dev overlay, or a script we do not own.
 * Waiting for it to appear in a console log tells us nothing about who did it.
 *
 * So we patch the three insertion methods on Node before any page script runs,
 * and record a stack whenever the target is `document` itself. Calls that
 * throw are recorded too — the throw is the symptom we are chasing.
 *
 *   node scripts/trap-appendchild.mjs /rw/dashboard /rw/book/<id>
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SCRATCH = "D:/zd-tmp";
mkdirSync(SCRATCH, { recursive: true });
process.env.TMPDIR = SCRATCH;
process.env.TEMP = SCRATCH;
process.env.TMP = SCRATCH;

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const PHONE = process.env.LOGIN_PHONE ?? null;
const routes = process.argv.slice(2);

const ctx = await chromium.launchPersistentContext(`${SCRATCH}/browser-trap`, {
  channel: process.env.BROWSER_CHANNEL ?? "msedge",
  viewport: { width: 1440, height: 900 },
});

await ctx.addInitScript(() => {
  const hits = [];
  window.__domTrap = hits;

  for (const name of ["appendChild", "insertBefore", "replaceChild"]) {
    const original = Node.prototype[name];
    Node.prototype[name] = function (...args) {
      const targetIsDocument = this === document;
      try {
        return original.apply(this, args);
      } catch (err) {
        hits.push({
          method: name,
          targetIsDocument,
          nodeName: args[0] && args[0].nodeName,
          message: String(err && err.message),
          stack: new Error("trap").stack,
        });
        throw err;
      } finally {
        if (targetIsDocument) {
          hits.push({
            method: name,
            targetIsDocument: true,
            nodeName: args[0] && args[0].nodeName,
            message: "(no throw) appended directly to document",
            stack: new Error("trap").stack,
          });
        }
      }
    };
  }
});

const page = await ctx.newPage();
page.on("pageerror", (e) => {
  if (/appendChild|one element on document/i.test(e.message)) {
    console.log("\n=== PAGEERROR ===\n" + (e.stack ?? e.message));
  }
});

async function dump(label) {
  const hits = await page.evaluate(() => window.__domTrap ?? []).catch(() => []);
  if (!hits.length) return false;
  console.log(`\n!!! ${label}: ${hits.length} document-level insertion(s)`);
  for (const h of hits.slice(0, 5)) {
    console.log(`\n  ${h.method} <${h.nodeName}> — ${h.message}`);
    console.log(
      String(h.stack)
        .split("\n")
        .slice(1, 12)
        .map((l) => "    " + l.trim())
        .join("\n"),
    );
  }
  await page.evaluate(() => (window.__domTrap.length = 0));
  return true;
}

if (PHONE) {
  const locale = routes[0]?.split("/")[1] ?? "en";
  await page.goto(`${BASE}/${locale}/login`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  await page.waitForTimeout(1500);
  await page.fill('input[type="tel"]', PHONE);
  await page.fill('input[type="password"]', "zuridrive123");
  await page.getByRole("button", { name: /^(Sign In|Injira)$/i }).click();
  await page
    .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 })
    .catch(() => {});
  console.log("signed in ->", page.url().replace(BASE, ""));
  await dump("during login");
}

let found = false;
for (const r of routes) {
  console.log(`\n########## ${r}`);
  try {
    const res = await page.goto(`${BASE}${r}`, {
      waitUntil: "networkidle",
      timeout: 180000,
    });
    console.log("status:", res?.status());
  } catch (e) {
    console.log("NAV_FAIL:", e.message.slice(0, 100));
  }
  await page.waitForTimeout(2500);
  found = (await dump(`on ${r}`)) || found;

  // A soft client-side navigation exercises the router rather than a fresh
  // document, which is where a second-document append would show up.
  const link = page.locator('a[href^="/"]').first();
  if (await link.count()) {
    await link.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(2500);
    found = (await dump(`after soft nav from ${r}`)) || found;
    await page.goBack().catch(() => {});
    await page.waitForTimeout(1500);
    found = (await dump(`after back from ${r}`)) || found;
  }
}

console.log(found ? "\nTRAP FIRED" : "\nno document-level insertions seen");
await ctx.close();
