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

## Check a database before you commit to it

```bash
DATABASE_URL="postgres://..." npm run check:database
```

The one that matters is `btree_gist`. The bookings table carries an exclusion
constraint that physically prevents two overlapping bookings on the same car,
and it needs that extension. A provider that will not allow it fails the
migration — and if that gets skipped past, double bookings return silently:
nothing errors, two people simply arrive for the same car.

The check builds the real constraint on a temporary table and tries to insert
an overlap, because being listed as available is not the same as working. It
writes nothing permanent.

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

## Scheduled jobs run on GitHub Actions, not Vercel

Seven jobs have to run on a timer: auto-confirm, activate-trips, auto-complete,
delete-photos, reconcile, subscription-reminders, trip-reminders. Without them
bookings never auto-confirm, trips never activate, deposits never release, and
nobody is told the books do not balance.

**Vercel's Hobby plan allows crons only once per day**, which is too coarse for
work that has to happen close to when it is due. The deploy is rejected
outright if `vercel.json` asks for anything more frequent.

So the schedules live in `.github/workflows/scheduled-jobs.yml` instead. The
endpoints were always ordinary authenticated HTTP routes, so the only thing
that changed is who calls them. GitHub Actions is free without limit on a
public repository.

**Two repository secrets are required**, under Settings → Secrets and variables
→ Actions:

| Secret | Value |
|---|---|
| `CRON_SECRET` | the same value set in Vercel — if they differ, every job 401s |
| `SITE_URL` | `https://zuridrive.vercel.app`, no trailing slash |

**The one thing that can quietly break it:** GitHub disables scheduled
workflows on a public repository after a long stretch with no activity in the
repo. You get an email. If ZuriDrive goes months without a commit, check the
Actions tab and re-enable.

### Going back to Vercel crons on Pro

Vercel Pro removes the daily limit. To move back:

1. Restore this block to `vercel.json`:

```json
  "crons": [
    { "path": "/api/cron/auto-confirm", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/activate-trips", "schedule": "0 * * * *" },
    { "path": "/api/cron/auto-complete", "schedule": "0 * * * *" },
    { "path": "/api/cron/delete-photos", "schedule": "0 2 * * *" },
    { "path": "/api/cron/subscription-reminders", "schedule": "0 8 * * *" },
    { "path": "/api/cron/reconcile", "schedule": "30 2 * * *" },
    { "path": "/api/cron/trip-reminders", "schedule": "0 9 * * *" }
  ]
```

2. Deploy.
3. **Delete `.github/workflows/scheduled-jobs.yml`.**

Forgetting step 3 does no damage — every job is safe to run twice, which is the
same property that makes running late safe — but it doubles the work and makes
the logs misleading.

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
