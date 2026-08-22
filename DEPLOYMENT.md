# Deploying ZuriDrive

## Where the code runs

`vercel.json` pins `regions: ["fra1"]` — Frankfurt.

Unset, Vercel runs functions in Washington DC, so every request from Kigali
crosses the Atlantic twice before a page renders. On a Rwandan mobile network,
where latency is already the slow part, that is the single cheapest performance
decision available and it costs nothing.

Frankfurt rather than Cape Town (`cpt1`), which is geographically closer:
much East African traffic still routes north through Europe on the undersea
cables, so the shorter distance on a map is often the longer trip in practice.
This is worth measuring rather than believing — if `cpt1` tests faster from
Kigali on real networks, change the one line.

**The database must be in the same region as the functions.** A page here runs
several queries, and each one crosses whatever distance separates them. Getting
this wrong costs more than the region choice itself.

## Where the database runs

Postgres, anywhere that offers a Frankfurt region — Supabase, Neon and Railway
all do. What matters more than the vendor:

- **Point-in-time recovery must be on.** The financial records are append-only
  by design, which is worth nothing if the database is gone. Check this is
  actually enabled rather than assuming the plan includes it.
- **Connection pooling.** Serverless functions open a connection each; without
  a pooler, traffic exhausts the connection limit before it exhausts anything
  else. Supabase and Neon both provide one — use the pooled connection string
  for `DATABASE_URL`, and the direct one for migrations.

## The crons are Vercel-specific

Seven jobs are declared in `vercel.json`: auto-confirm, activate-trips,
auto-complete, delete-photos, subscription-reminders, reconcile, trip-reminders.

They are ordinary authenticated HTTP endpoints, so any scheduler can call them —
but if you leave Vercel, something has to. Without them bookings never
auto-confirm, trips never activate, deposits never release, and nobody is told
their books do not balance.

## Environment variables

Everything in `.env.local` has to exist in the deployment, with **production
values, not the development ones**:

| Variable | Notes |
|---|---|
| `NEXTAUTH_SECRET` | Generate a new one. Never reuse the development secret. |
| `NEXTAUTH_URL` | The real domain, https. |
| `DATABASE_URL` | Pooled connection string. |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | Africa's Talking, live account. |
| `MTN_MOMO_*` | Production credentials, `MTN_MOMO_ENVIRONMENT=production`. |
| `CLOUDINARY_*` | Same account is fine. |
| `CRON_SECRET` | Generate a new one. This is what stops anyone triggering the jobs. |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | `true` once MoMo credentials are live. |
| `NEXT_PUBLIC_CURRENCY` | `RWF`. |
| `SENTRY_DSN` | Optional, but errors are invisible without it. |

## Before the first deploy

```bash
npx prisma migrate deploy    # never `migrate dev` against production
npx prisma db seed           # only if the platform settings row is missing
```

The seed creates the four country rows and the platform settings singleton. It
is safe to run twice — every insert is an upsert — but check what it writes
before pointing it at a live database.

## After deploying, before telling anyone

1. Make one real booking with real money, end to end.
2. Confirm the SMS actually arrived.
3. Cancel it and confirm the refund lands.
4. Check `/admin/finance/reports` reconciles.
5. Confirm the crons ran — Vercel's dashboard shows each invocation.
