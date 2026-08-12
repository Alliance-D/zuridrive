# Load testing

Two k6 scripts. k6 is a standalone binary, not an npm package.

```
winget install k6            # Windows
brew install k6              # macOS
```

## Running them

**Always against a production build.** `next dev` compiles on demand and is
several times slower, so numbers from it tell you nothing.

```bash
npm run build && npm start           # terminal 1
npm run load:smoke                   # terminal 2
```

Against staging:

```bash
BASE_URL=https://staging.zuridrive.rw npm run load:smoke
```

| Script | Purpose | Peak |
|---|---|---|
| `smoke.js` | Does it hold up under realistic early traffic? Has pass/fail thresholds. | 25 concurrent |
| `stress.js` | Where does it break? For information, not a pass mark. | 300 concurrent |

## What these do and don't cover

They exercise **public GET paths only** — landing, car browsing with filters,
and the static pages. Nothing books a car, takes a payment or writes a row.

That is deliberate. A load test that created real bookings would put fake money
through the ledger and make reconciliation lie about the platform's true
position. If you ever want to load-test the booking flow, do it against a
scratch database you are willing to throw away, never staging-with-real-data.

Consequently these say nothing about write throughput, MoMo latency, or how the
system behaves when a hundred people try to book the same car at once. Those
need their own harness.

## The number that actually matters

Watch **database connections**, not CPU.

Every concurrent serverless function opens its own Prisma connection pool, so a
traffic spike the CPU shrugs off can still exhaust Postgres. `stress.js` tracks
this as `db_errors` and reports it explicitly.

If you see `too many clients already` or `Timed out fetching a new connection`,
the fix is a connection pooler — PgBouncer, or the pooled connection string that
Neon and Supabase provide — not a bigger instance. On a serverless host this is
the single most likely way the platform falls over under real load.
