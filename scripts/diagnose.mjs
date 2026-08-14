/**
 * scripts/diagnose.mjs — capture a page's console errors with full stacks.
 *
 * shoot.mjs records that an error happened. This records *where*: it listens
 * for pageerror and console, and for console messages it walks the JSHandle
 * args so an Error object yields its stack rather than "JSHandle@error".
 *
 *   node scripts/diagnose.mjs /rw/book/<carId>
 */

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const SCRATCH = "D:/zd-tmp";
mkdirSync(SCRATCH, { recursive: true });
process.env.TMPDIR = SCRATCH;
process.env.TEMP = SCRATCH;
process.env.TMP = SCRATCH;

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const routes = process.argv.slice(2);
const PHONE = process.env.LOGIN_PHONE ?? null;

const ctx = await chromium.launchPersistentContext(`${SCRATCH}/browser-diag`, {
  channel: "msedge",
  viewport: { width: 1440, height: 900 },
});
const page = await ctx.newPage();

page.on("pageerror", (e) => {
  console.log("\n=== PAGEERROR ===");
  console.log(e.stack ?? e.message);
});

page.on("console", async (m) => {
  if (m.type() !== "error" && m.type() !== "warning") return;
  const parts = [];
  for (const arg of m.args()) {
    try {
      parts.push(
        await arg.evaluate((v) =>
          v instanceof Error ? `${v.message}\n${v.stack}` : String(v),
        ),
      );
    } catch {
      parts.push(m.text());
    }
  }
  const text = parts.join(" ");
  if (/favicon|404 \(Not Found\)|Download the React DevTools/i.test(text)) return;
  console.log(`\n=== CONSOLE ${m.type().toUpperCase()} ===`);
  console.log(text);
  const loc = m.location();
  if (loc?.url) console.log(`  at ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`);
});

if (PHONE) {
  const locale = routes[0]?.split("/")[1] ?? "en";
  await page.goto(`${BASE}/${locale}/login`, {
    waitUntil: "networkidle",
    timeout: 180000,
  });
  // Fill only after hydration: typing into a not-yet-hydrated input is thrown
  // away when React attaches, leaving the submit button disabled.
  await page.waitForTimeout(1500);
  await page.fill('input[type="tel"]', PHONE);
  await page.fill('input[type="password"]', "zuridrive123");
  await page.getByRole("button", { name: /^(Sign In|Injira)$/i }).click();
  await page
    .waitForURL((u) => !u.pathname.includes("/login"), { timeout: 120000 })
    .catch(() => {});
  console.log("signed in ->", page.url().replace(BASE, ""));
}

for (const r of routes) {
  console.log(`\n########## ${r}`);
  try {
    const res = await page.goto(`${BASE}${r}`, {
      waitUntil: "networkidle",
      timeout: 180000,
    });
    console.log("status:", res?.status());
  } catch (e) {
    console.log("NAV_FAIL:", e.message.slice(0, 120));
  }
  await page.waitForTimeout(3000);
}

await ctx.close();
