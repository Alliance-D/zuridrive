/**
 * DashboardSkeletons — Skeleton loading screens for every dashboard section.
 * Used instead of spinners — always matches the shape of the real content.
 * Server component (pure CSS, no state).
 */

// ─── Base Skeleton Block ────────────────────────────────────────────────────

function Sk({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-sand-warm ${className}`}
      aria-hidden="true"
    />
  );
}

// ─── Overview Page Skeleton ─────────────────────────────────────────────────

export function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard…">
      {/* Welcome banner */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <Sk className="mb-2 h-7 w-48" />
        <Sk className="h-4 w-64" />
      </div>

      {/* Active trip card */}
      <div className="rounded-2xl border-2 border-sand-warm bg-white p-6 shadow-sm">
        <Sk className="mb-4 h-5 w-32" />
        <div className="flex gap-4">
          <Sk className="h-24 w-32 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Sk className="h-6 w-40" />
            <Sk className="h-4 w-56" />
            <Sk className="h-4 w-36" />
            <div className="flex gap-2 mt-3">
              <Sk className="h-9 w-28 rounded-full" />
              <Sk className="h-9 w-28 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
            <Sk className="mb-3 h-8 w-8 rounded-full" />
            <Sk className="mb-1 h-7 w-16" />
            <Sk className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Upcoming + Recent */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <Sk className="mb-4 h-5 w-40" />
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="flex gap-3">
                <Sk className="h-16 w-20 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <Sk className="h-4 w-36" />
                  <Sk className="h-3 w-24" />
                  <Sk className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <Sk className="mb-4 h-5 w-40" />
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Sk className="h-10 w-10 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Sk className="h-3.5 w-48" />
                  <Sk className="h-3 w-24" />
                </div>
                <Sk className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bookings List Skeleton ─────────────────────────────────────────────────

export function BookingsListSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading bookings…">
      {/* Filter bar */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[...Array(5)].map((_, i) => (
          <Sk key={i} className="h-8 w-24 flex-shrink-0 rounded-full" />
        ))}
      </div>

      {/* Cards */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex gap-4">
            <Sk className="h-20 w-28 rounded-xl flex-shrink-0 sm:h-24 sm:w-32" />
            <div className="flex-1 min-w-0">
              <div className="flex justify-between mb-2">
                <Sk className="h-5 w-40" />
                <Sk className="h-6 w-20 rounded-full" />
              </div>
              <Sk className="mb-1 h-3.5 w-32" />
              <Sk className="mb-3 h-3.5 w-28" />
              <div className="flex gap-2">
                <Sk className="h-8 w-24 rounded-lg" />
                <Sk className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Profile Skeleton ────────────────────────────────────────────────────────

export function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading profile…">
      {/* Photo section */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center gap-5">
          <Sk className="h-20 w-20 rounded-full flex-shrink-0" />
          <div className="space-y-2">
            <Sk className="h-6 w-40" />
            <Sk className="h-4 w-56" />
            <Sk className="h-8 w-32 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Personal info form */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <Sk className="mb-5 h-5 w-36" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={i === 5 ? "sm:col-span-2" : ""}>
              <Sk className="mb-1.5 h-3.5 w-24" />
              <Sk className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Sk className="mt-5 h-10 w-32 rounded-lg" />
      </div>

      {/* License upload */}
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <Sk className="mb-4 h-5 w-44" />
        <Sk className="h-32 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ─── Single Booking Detail Skeleton (reused from trip lifecycle) ────────────

export function BookingDetailSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading booking…">
      {/* Status timeline */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <Sk className="mb-4 h-5 w-32" />
        <div className="flex gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="flex-1">
              <Sk className="mx-auto mb-1.5 h-8 w-8 rounded-full" />
              <Sk className="mx-auto h-2.5 w-12" />
            </div>
          ))}
        </div>
      </div>

      {/* Car info */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex gap-4">
          <Sk className="h-28 w-40 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Sk className="h-6 w-48" />
            <Sk className="h-4 w-32" />
            <Sk className="h-4 w-40" />
          </div>
        </div>
      </div>

      {/* Price breakdown */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <Sk className="mb-4 h-5 w-36" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex justify-between py-2 border-b border-sand last:border-0">
            <Sk className="h-4 w-36" />
            <Sk className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
