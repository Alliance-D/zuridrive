/**
 * k6 smoke test — the public read paths, under mild but real concurrency.
 *
 *   npm run load:smoke                       (against localhost:3000)
 *   BASE_URL=https://staging.zuridrive.rw npm run load:smoke
 *
 * Run this against a PRODUCTION BUILD (`npm run build && npm start`), never
 * `next dev`. Dev mode compiles on demand and is several times slower, so
 * numbers from it are meaningless.
 *
 * Only GETs on public pages. Nothing here books a car, takes a payment or
 * writes a row — a load test that creates real bookings pollutes the ledger
 * and makes reconciliation lie.
 *
 * Thresholds are set for a Rwandan audience on mobile networks, where the
 * server budget has to leave room for a slow last mile.
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

const failures = new Rate("failed_requests");

export const options = {
  stages: [
    { duration: "30s", target: 10 }, // warm up
    { duration: "1m", target: 25 }, // a realistic early-days peak
    { duration: "30s", target: 0 }, // wind down
  ],
  thresholds: {
    // Server time budget. The client still has a mobile network to cross.
    http_req_duration: ["p(95)<800", "p(99)<2000"],
    failed_requests: ["rate<0.01"],
    checks: ["rate>0.99"],
  },
};

/** Filter combinations a real visitor would produce. */
const SEARCHES = [
  "",
  "?category=SUV",
  "?category=ECONOMY",
  "?transmission=AUTOMATIC",
  "?minPrice=20000&maxPrice=80000",
  "?category=LUXURY&transmission=AUTOMATIC",
];

export default function () {
  group("landing", () => {
    const res = http.get(`${BASE}/`, { tags: { page: "home" } });
    const ok = check(res, {
      "home 200": (r) => r.status === 200,
      "home has content": (r) => r.body.length > 1000,
    });
    failures.add(!ok);
  });

  sleep(1);

  group("browsing", () => {
    const query = SEARCHES[Math.floor(Math.random() * SEARCHES.length)];
    const res = http.get(`${BASE}/cars${query}`, { tags: { page: "cars" } });
    const ok = check(res, { "cars 200": (r) => r.status === 200 });
    failures.add(!ok);
  });

  sleep(2);

  group("static pages", () => {
    const pages = ["/how-it-works", "/help", "/terms", "/privacy", "/about"];
    const path = pages[Math.floor(Math.random() * pages.length)];
    const res = http.get(`${BASE}${path}`, { tags: { page: "static" } });
    const ok = check(res, { "static 200": (r) => r.status === 200 });
    failures.add(!ok);
  });

  sleep(1);
}

export function handleSummary(data) {
  const p95 = data.metrics.http_req_duration.values["p(95)"];
  const failed = data.metrics.failed_requests?.values.rate ?? 0;

  return {
    stdout:
      `\n  p95 ${Math.round(p95)}ms   failures ${(failed * 100).toFixed(2)}%   ` +
      `requests ${data.metrics.http_reqs.values.count}\n\n`,
  };
}
