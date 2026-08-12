/**
 * scripts/shoot.mjs — visual audit harness.
 *
 * Signs in as a real seeded user, walks a list of routes, and writes a
 * screenshot plus any console/page errors for each one.
 *
 *   node scripts/shoot.mjs owner
 *   node scripts/shoot.mjs admin
 *   node scripts/shoot.mjs client
 *   node scripts/shoot.mjs public
 *
 * Errors are captured per-page because a React error boundary renders a
 * perfectly innocent-looking page while the console carries the real failure.
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

// Keep the browser entirely off C:. That drive is full on this machine, and
// Windows re-expands the pagefile into anything freed there, so any temp file
// the browser wants must land on D: instead.
const SCRATCH = "D:/zd-tmp";
mkdirSync(SCRATCH, { recursive: true });
process.env.TMPDIR = SCRATCH;
process.env.TEMP = SCRATCH;
process.env.TMP = SCRATCH;

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PASSWORD = "zuridrive123";

const ROLES = {
  public: { phone: null, routes: ["/", "/cars", "/how-it-works", "/become-an-owner", "/login", "/signup", "/about", "/contact", "/help", "/terms", "/privacy", "/cookies", "/cars/cmsn6jaof000pe5r7baebzqvr", "/book/cmsn6jaof000pe5r7baebzqvr"] },
  owner: { phone: "0781111101", routes: ["/owner/dashboard", "/owner/fleet", "/owner/bookings", "/owner/analytics", "/owner/earnings", "/owner/payouts", "/owner/subscription", "/owner/profile", "/owner/reviews", "/owner/locations", "/owner/notifications", "/owner/support", "/owner/onboarding"] },
  client: { phone: "0782222201", routes: ["/dashboard", "/dashboard/bookings", "/dashboard/profile", "/dashboard/notifications"] },
  admin: { phone: "0780000001", routes: ["/admin", "/admin/analytics", "/admin/bookings", "/admin/disputes", "/admin/finance", "/admin/finance/commissions", "/admin/finance/deposits", "/admin/finance/extra-charges", "/admin/finance/payments", "/admin/finance/payouts", "/admin/finance/reports", "/admin/finance/subscriptions", "/admin/fleet", "/admin/locations", "/admin/neighborhoods", "/admin/notifications", "/admin/reviews", "/admin/settings", "/admin/support", "/admin/team", "/admin/users"] },
};

const role = process.argv[2] ?? "public";
const cfg = ROLES[role];
if (!cfg) {
  console.error(`unknown role: ${role}. one of: ${Object.keys(ROLES).join(", ")}`);
  process.exit(1);
}

const OUT = `shots/${role}`;
mkdirSync(OUT, { recursive: true });

// Uses the system Edge/Chrome instead of Playwright's own browser download.
// The C: drive on this machine is full, and Playwright's installer needs
// scratch space there even when PLAYWRIGHT_BROWSERS_PATH points elsewhere.
// Edge is always present on Windows, so this needs no download at all.
// A dedicated profile directory on D:. The C: drive on this machine is full,
// and Windows keeps re-expanding the pagefile into anything freed there, so
// the browser is kept off C: entirely rather than fighting for room on it.
const context = await chromium.launchPersistentContext(
  process.env.BROWSER_PROFILE ?? `${SCRATCH}/browser`,
  {
    channel: process.env.BROWSER_CHANNEL ?? "msedge",
    viewport: { width: 1440, height: 900 },
  },
);
const browser = context.browser();
const page = await context.newPage();

const report = [];
let pageErrors = [];
let consoleErrors = [];

page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

// ---- sign in -------------------------------------------------------------
if (cfg.phone) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="tel"]', cfg.phone);
  await page.fill('input[type="password"]', PASSWORD);
  // The submit button, not the nav link or the mode toggle - three elements
  // match "Sign In" on this page.
  // Exact accessible name. ":has-text" is a substring match, so it also hits
  // "Sign in with email instead" and "Forgot it? Sign in with a one-time code".
  await page.getByRole("button", { name: /^Sign In$/i }).click();
  // Dev-mode Next compiles routes on demand, so the first authenticated
  // navigation can take several seconds. Wait for the URL to actually change
  // rather than guessing a duration.
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45000 })
    .catch(() => {});
  const landed = page.url().replace(BASE, "");
  console.log(`signed in as ${role} -> landed on ${landed || "/"}`);
  report.push({ route: "LOGIN", landedOn: landed, pageErrors: [...pageErrors], consoleErrors: [...consoleErrors] });
}

// ---- walk routes ---------------------------------------------------------
for (const route of cfg.routes) {
  pageErrors = [];
  consoleErrors = [];

  let status = "?";
  try {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30000 });
    status = res?.status() ?? "?";
  } catch (e) {
    status = `NAV_FAIL: ${e.message.slice(0, 80)}`;
  }

  await page.waitForTimeout(700);

  const name = route.replace(/\//g, "_") || "_root";
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true }).catch(() => {});

  // What the user would actually see if it broke.
  const visibleError = await page
    .locator("text=/Application error|Unhandled Runtime Error|something went wrong|Error:/i")
    .first()
    .textContent()
    .catch(() => null);

  const bodyText = await page.locator("body").innerText().catch(() => "");

  report.push({
    route,
    status,
    finalUrl: page.url().replace(BASE, ""),
    visibleError: visibleError?.trim().slice(0, 200) ?? null,
    textLength: bodyText.length,
    pageErrors: [...pageErrors],
    consoleErrors: consoleErrors.filter((e) => !/favicon|404 \(Not Found\)/i.test(e)).slice(0, 5),
  });

  const flag = pageErrors.length || visibleError ? "  <-- ERROR" : "";
  console.log(`  ${String(status).padEnd(4)} ${route.padEnd(32)} text:${String(bodyText.length).padStart(6)}${flag}`);
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
await context.close();
console.log(`\nwrote ${OUT}/report.json and ${cfg.routes.length} screenshots`);
