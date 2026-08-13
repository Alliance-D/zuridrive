/**
 * /dashboard/bookings — Full Bookings List
 *
 * Server component with URL-based status filter.
 * Reads ?status= from search params to filter bookings.
 * Renders skeleton during loading via Suspense.
 * Never shows blank white space — illustrated empty state when no results.
 */

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import BookingCard from "@/components/dashboard/BookingCard";
import EmptyState from "@/components/dashboard/EmptyState";
import { BookingsListSkeleton } from "@/components/dashboard/DashboardSkeletons";
import StatusFilterTabs from "@/components/dashboard/StatusFilterTabs";

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingStatus =
  | "ALL"
  | "ACTIVE"
  | "CONFIRMED"
  | "PENDING_PAYMENT"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

interface PageProps {
  params: { locale: string };
  searchParams: { status?: string; page?: string };
}

const PAGE_SIZE = 10;

// ─── Filter options shown in the tab bar ─────────────────────────────────────

// Not exported: page.tsx may only export `default` and Next's reserved
// config symbols, or the route type check fails at build time.
const FILTER_TABS: { labelKey: string; value: BookingStatus }[] = [
  { labelKey: "filterAll",        value: "ALL"              },
  { labelKey: "filterActive",     value: "ACTIVE"           },
  { labelKey: "filterUpcoming",   value: "CONFIRMED"        },
  { labelKey: "filterPending",    value: "PENDING_PAYMENT"  },
  { labelKey: "filterCompleted",  value: "COMPLETED"        },
  { labelKey: "filterCancelled",  value: "CANCELLED"        },
  { labelKey: "filterDisputed",   value: "DISPUTED"         },
];

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function getBookings(
  userId: string,
  status: BookingStatus,
  page: number
) {
  // Build Prisma status filter — "ALL" fetches everything.
  // Note: no `as const` — Prisma's `in` needs a mutable array.
  const statusFilter: Prisma.EnumBookingStatusFilter | undefined =
    status === "ALL"
      ? undefined
      : status === "CONFIRMED"
        // "Upcoming" tab includes both confirmed states
        ? { in: ["CONFIRMED", "AWAITING_OWNER_CONFIRMATION"] }
        : status === "PENDING_PAYMENT"
          ? { in: ["PENDING_PAYMENT", "PAYMENT_CONFIRMED"] }
          : { equals: status };

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where: {
        clientId: userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        car: {
          include: {
            photos:     { orderBy: { order: "asc" }, take: 1 },
            fuelPolicy: true,
          },
        },
        location: { include: { platformLocation: true, ownerLocation: true } },
        conditionPhotos: {
          where: { isDeleted: false },
          select: { id: true, isPreTrip: true, uploadedById: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip:  (page - 1) * PAGE_SIZE,
      take:  PAGE_SIZE,
    }),
    prisma.booking.count({
      where: {
        clientId: userId,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
    }),
  ]);

  return { bookings, total };
}

// ─── Inner content component ──────────────────────────────────────────────────

async function BookingsContent({
  locale,
  userId,
  status,
  page,
}: {
  locale: string;
  userId: string;
  status: BookingStatus;
  page: number;
}) {
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { bookings, total } = await getBookings(userId, status, page);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function photosUploaded(
    booking: (typeof bookings)[0],
    direction: "PRE" | "POST"
  ) {
    return booking.conditionPhotos.some(
      (p) => p.isPreTrip === (direction === "PRE") && p.uploadedById === userId
    );
  }

  function toCardProps(b: (typeof bookings)[0]) {
    const coverUrl = b.car.photos[0]?.url ?? "/images/car-placeholder.jpg";
    const location =
      b.location?.platformLocation?.name ??
      b.location?.ownerLocation?.name ??
      b.location?.customDescription ??
      "Kigali";

    return {
      id:              b.id,
      reference:       b.reference,
      carMake:         b.car.make,
      carModel:        b.car.model,
      carYear:         b.car.year,
      carPhotoUrl:     coverUrl,
      startDate:       b.startDate,
      endDate:         b.endDate,
      totalAmount:     b.subtotal + b.depositAmount,
      status:          b.status as any,
      pickupLocation:  location,
      hasDriverOption: b.driverRequested,
      preTripPhotoPending:  !photosUploaded(b, "PRE"),
      postTripPhotoPending: !photosUploaded(b, "POST"),
    };
  }

  return (
    <div className="space-y-4">
      {/* Status filter tabs — client component for active-state highlight */}
      <StatusFilterTabs tabs={FILTER_TABS} active={status} total={total} />

      {/* Results */}
      {bookings.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-sand-dark">
          <EmptyState
            variant={status === "ALL" ? "no-bookings" : "generic"}
            title={
              status === "ALL"
                ? "No bookings yet"
                : `No ${status.toLowerCase().replace("_", " ")} bookings`
            }
            description={
              status === "ALL"
                ? "Make your first booking to start exploring Rwanda."
                : "Nothing matches this filter right now."
            }
            actionLabel={status === "ALL" ? "Browse Cars" : undefined}
            actionHref={status === "ALL" ? "/cars" : undefined}
          />
        </div>
      ) : (
        <>
          <p className="text-xs text-ink-faint">
            Showing {(page - 1) * PAGE_SIZE + 1}–
            {Math.min(page * PAGE_SIZE, total)} of {total} bookings
          </p>

          <div className="space-y-3">
            {bookings.map((b) => (
              <BookingCard key={b.id} {...toCardProps(b)} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              {page > 1 && (
                <a
                  href={`/dashboard/bookings?status=${status}&page=${page - 1}`}
                  className="rounded-lg border border-sand-dark px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand hover:text-brand transition-colors"
                >
                  {t("previous")}
                </a>
              )}
              <span className="text-sm text-ink-soft">
                Page {page} of {totalPages}
              </span>
              {page < totalPages && (
                <a
                  href={`/dashboard/bookings?status=${status}&page=${page + 1}`}
                  className="rounded-lg border border-sand-dark px-4 py-2 text-sm font-medium text-ink-muted hover:border-brand hover:text-brand transition-colors"
                >
                  {t("next")}
                </a>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default async function BookingsPage({ params, searchParams }: PageProps) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "dashboard",
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/dashboard/bookings"));

  const status = (searchParams.status?.toUpperCase() as BookingStatus) ?? "ALL";
  const page   = Math.max(1, parseInt(searchParams.page ?? "1", 10));

  const validStatuses: BookingStatus[] = [
    "ALL","ACTIVE","CONFIRMED","PENDING_PAYMENT","COMPLETED","CANCELLED","DISPUTED",
  ];
  const safeStatus = validStatuses.includes(status) ? status : "ALL";

  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <BookingsListSkeleton label={t("loadingBookings")} />
        </DashboardLayout>
      }
    >
      <DashboardLayoutWrapper userId={session.user.id}>
        <BookingsContent
          userId={session.user.id}
          status={safeStatus}
          page={page}
          locale={params.locale}
        />
      </DashboardLayoutWrapper>
    </Suspense>
  );
}

// Thin async wrapper to get unread count for the layout
async function DashboardLayoutWrapper({
  userId,
  children,
}: {
  userId: string;
  children: React.ReactNode;
}) {
  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false },
  });
  return (
    <DashboardLayout notificationCount={unreadCount}>
      {children}
    </DashboardLayout>
  );
}
