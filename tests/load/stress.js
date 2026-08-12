/**
 * k6 stress test — find where it breaks, before a launch does it for you.
 *
 *   BASE_URL=https://staging.zuridrive.rw npm run load:stress
 *
 * Ramps well past expected traffic. The goal is NOT to pass; it is to learn
 * the number at which latency turns the corner, and to confirm the platform
 * degrades by getting slower rather than by erroring or corrupting data.
 *
 * NEVER point this at production with real customers on it.
 *
 * The thing to watch on a serverless host is the DATABASE CONNECTION COUNT.
 * Every concurrent function instance opens its own Prisma pool, so a spike
 * that the CPU shrugs off can still exhaust Postgres connections. If this test
 * produces "too many clients already", that is the finding — and the fix is a
 * pooler (PgBouncer / Neon / Supabase pooling), not a bigger server.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:3000";

const errors = new Rate("errors");
const dbErrors = new Rate("db_errors");
const browseTime = new Trend("browse_duration");

export const options = {
  stages: [
    { duration: "1m", target: 50 },
    { duration: "2m", target: 150 },
    { duration: "2m", target: 300 },
    { duration: "1m", target: 0 },
  ],
  thresholds: {
    // Deliberately loose. This test is for information, not a pass mark —
    // but a 5% error rate means something is actually broken, not just busy.
    errors: ["rate<0.05"],
    // This one is not negotiable. Running out of connections is a
    // configuration failure, not a capacity limit.
    db_errors: ["rate<0.001"],
  },
};

export default function () {
  const responses = http.batch([
    ["GET", `${BASE}/`, null, { tags: { page: "home" } }],
    ["GET", `${BASE}/cars`, null, { tags: { page: "cars" } }],
    ["GET", `${BASE}/how-it-works`, null, { tags: { page: "static" } }],
  ]);

  for (const res of responses) {
    const ok = check(res, {
      "not a server error": (r) => r.status < 500,
      "responded": (r) => r.status !== 0,
    });
    errors.add(!ok);

    // The signature of connection-pool exhaustion.
    const body = typeof res.body === "string" ? res.body : "";
    dbErrors.add(
      /too many clients|connection pool|ECONNREFUSED|Timed out fetching a new connection/i.test(
        body,
      ),
    );

    if (res.request.url.includes("/cars")) browseTime.add(res.timings.duration);
  }

  sleep(Math.random() * 2);
}

export function handleSummary(data) {
  const m = data.metrics;
  const line = (label, value) => `  ${label.padEnd(22)} ${value}\n`;

  return {
    stdout:
      "\n" +
      line("peak VUs", m.vus_max?.values.max ?? "?") +
      line("requests", m.http_reqs.values.count) +
      line("p95", `${Math.round(m.http_req_duration.values["p(95)"])}ms`) +
      line("p99", `${Math.round(m.http_req_duration.values["p(99)"])}ms`) +
      line("error rate", `${((m.errors?.values.rate ?? 0) * 100).toFixed(2)}%`) +
      line(
        "db exhaustion",
        (m.db_errors?.values.rate ?? 0) > 0
          ? "YES — add a connection pooler"
          : "none",
      ) +
      "\n",
  };
}
