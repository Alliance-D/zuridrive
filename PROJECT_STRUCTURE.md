# ZuriDrive — Project Structure

> **This document reflects what actually exists on disk.** Empty directories
> under `app/api/` are scaffolding for routes that have not been written yet —
> they are listed under "Not yet built", not here.

## Stack

- **Framework**: Next.js 14 (App Router), React 18, TypeScript 5
- **Database**: PostgreSQL via Prisma 5
- **Auth**: NextAuth v4 — phone + OTP primary, email + password fallback
- **Styling**: Tailwind CSS 3
- **Storage**: Cloudinary
- **Payments**: MTN MoMo + manual bank transfer
- **SMS**: Africa's Talking
- **Hosting**: Vercel (cron jobs declared in `vercel.json`)

Verified green: `tsc --noEmit` (0 errors), `next lint` (0 errors),
`next build` (succeeds), `prisma validate` (valid).

---

## Database — `prisma/schema.prisma`

31 models, 23 enums. All money is stored as **integer RWF** (no floats).
Financial records are append-only: payments are voided rather than edited, and
deposit changes are recorded as `DepositMovement` rows.

Key conventions worth knowing before writing queries:

| Thing | Actual name |
|---|---|
| Rental period enum | `PER_DAY` / `PER_WEEK` / `PER_MONTH` |
| Payment method enum | `MTN_MOMO` / `BANK_TRANSFER` |
| Car → pricing relation | `car.pricing` (not `pricingMatrix`) |
| Car → owner locations | `car.locations` |
| Booking → location | `booking.location` |
| Booking → payments | `booking.payments` (array; newest non-voided is live) |
| Cover photo | `CarPhoto.order === 0` (there is no `isCover`) |
| Condition photo phase | `isPreTrip: Boolean` (not a `phase` string) |
| Condition photo flags | `isDeleted`, `isLocked`, `isFuelGauge` |
| Booking has **no** `ownerId` | reach the owner via `booking.car.owner.userId` |
| Booking totals | `subtotal` + `depositAmount` (no `totalChargedNow` column) |
| `Car.ownerId` | references `CarOwnerProfile.id`, **not** `User.id` |

---

## Routes that exist

### Public
- `/` — homepage
- `/cars/[id]` — car detail
- `/how-it-works`
- `/become-an-owner`
- `/login` — phone OTP + email fallback

### Booking flow
- `/book/[carId]` — 6-step wizard
- `/book/[carId]/payment`
- `/book/[carId]/confirmation`

### Client dashboard
- `/dashboard` — overview, active trip, stats
- `/dashboard/bookings` — filterable list
- `/dashboard/bookings/[id]` — trip detail
- `/dashboard/bookings/[id]/photos` — condition photo upload
- `/dashboard/profile`

### Owner
- `/owner/dashboard`, `/owner/fleet` — **placeholder markup only**
- `/owner/bookings/[id]`, `/owner/bookings/[id]/photos` — real, working pages

### Admin
- `/admin` — **placeholder markup only**

### API
**Auth** — `auth/[...nextauth]`, `auth/otp`, `auth/verify-otp`, `auth/signup/owner`
**Cars** — `cars` (GET public / POST owner), `cars/[id]`, `cars/[id]/availability`
**Bookings** — `bookings`, `bookings/[id]`, `bookings/[id]/confirm`,
`bookings/[id]/payment`, `bookings/[id]/photos`, `bookings/[id]/return`
**Deposits** — `deposits/[id]` (release / withhold partial / withhold full)
**Payments** — `payments`, `payments/momo/callback`
**Reviews** — `reviews`, `reviews/[id]/reply`
**Profile** — `profile`
**Upload** — `upload` (authenticated; anonymous allowed only for `licenses`, IP rate-limited)
**Admin** — `admin/bookings/[id]/retention`
**Cron** — `cron/auto-confirm`, `cron/activate-trips`, `cron/auto-complete`,
`cron/delete-photos` (all require `Authorization: Bearer $CRON_SECRET`)

---

## Libraries — `lib/`

| File | Purpose |
|---|---|
| `prisma.ts` | Prisma singleton (named + default export) |
| `db/index.ts` | Barrel — exports `db`, `prisma`, and query helpers |
| `db/queries.ts` | Reusable query helpers |
| `auth-options.ts` | **NextAuth config lives here**, not in the route file |
| `auth.ts` | Session getters, role guards, error-message map |
| `api-guard.ts` | `requireRole`, `requireModuleAccess`, `ownsCar`, `isBookingParticipant` |
| `admin-logger.ts` | Append-only `AdminAction` audit writes |
| `notifications.ts` | In-app notifications + `notifyAdminsWithModule` fan-out |
| `sms.ts` | Africa's Talking client, logs every send to `SmsLog` |
| `sms-templates.ts` | Booking message templates (re-exported as `SMS_TEMPLATES`) |
| `booking/pricing.ts` | Pure price calculator (commission = 20%, percent integer) |
| `booking/availability.ts` | Conflict + minimum-duration checks |
| `booking/status.ts` | Status transition helpers |
| `photos/retention.ts` | Condition photo retention rules |
| `photos/categories.ts` | Photo categories (kept out of the route file on purpose) |
| `payments/momo.ts` | MTN MoMo API client |
| `currency.ts`, `routes.ts`, `cloudinary.ts` | Formatting, typed routes, CDN helpers |

**Two App Router rules this codebase learned the hard way:**
1. `route.ts` may only export HTTP method handlers — anything else fails the
   build's route type check. That is why `authOptions` and `PHOTO_CATEGORIES`
   live in `lib/`.
2. `page.tsx` may only export `default` plus Next's reserved config symbols.
3. Server components cannot pass event handlers to the client — hover states
   belong in `globals.css`.

---

## Components

Built and working: `components/booking/` (9), `components/trip/` (7),
`components/dashboard/` (8), `components/photos/` (3), `components/ui/` (11),
plus navbar, footer, car grid/gallery, filter sidebar, reviews, hero search.

`components/admin/` and `components/owner/` are **empty**.

---

## Not yet built

- **Owner section** — onboarding, fleet listing wizard, subscription, payouts,
  profile, reviews, locations. `/owner/dashboard` and `/owner/fleet` are
  hardcoded placeholder markup.
- **Admin section** — finance, disputes, team/RBAC, fleet, users, bookings,
  reviews moderation, notifications, analytics. `/admin` is a placeholder.
- **`/cars` listing page** — `app/cars/cars-page.tsx` exists but is not a route
  file, so the listing linked from the navbar 404s.
- **`/signup` and `/signup/owner`** — linked from login/footer, not implemented.
- **`/terms`, `/privacy`, `/cookies`** — linked from footer, not implemented.
- **Subscription reminder cron** — removed from `vercel.json` until written.
- Empty scaffolding directories remain under `app/api/` for planned endpoints.

---

## Getting started

```bash
npm install
cp .env.local.example .env.local     # then fill in real credentials
npx prisma migrate dev --name init   # no migrations exist yet
npm run dev
```

Useful checks:

```bash
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```
