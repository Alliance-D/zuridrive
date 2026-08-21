/**
 * /dashboard — Client Dashboard Overview
 *
 * Server component. Fetches all needed data in parallel, passes to client
 * subcomponents. Shows:
 *  • Active trip card (if any ACTIVE booking)
 *  • Upcoming booking card (next CONFIRMED booking)
 *  • Quick stats (total, active, completed, pending)
 *  • Recent bookings list
 *
 * All monetary values via formatMoney(). Skeleton loading via Suspense.
 */

import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { loginPath } from "@/lib/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import ActiveTripCard from "@/components/dashboard/ActiveTripCard";
import UpcomingBookingCard from "@/components/dashboard/UpcomingBookingCard";
import BookingCard from "@/components/dashboard/BookingCard";
import EmptyState from "@/components/dashboard/EmptyState";
import { OverviewSkeleton } from "@/components/dashboard/DashboardSkeletons";
import {
  CalendarDays,
  Car,
  CheckCircle2,
  Clock,
} from "lucide-react";

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  value,
  label,
  accent = false,
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-4 shadow-sm ${accent ? "bg-brand text-white" : "bg-white"}`}>
      <div
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${
          accent ? "bg-white/15" : "bg-sand"
        }`}
      >
        <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-brand"}`} />
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-white" : "text-ink"}`}>{value}</p>
      <p className={`mt-0.5 text-xs ${accent ? "text-brand-tint" : "text-ink-soft"}`}>{label}</p>
    </div>
  );
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function getDashboardData(userId: string) {
  const [bookings, unreadCount] = await Promise.all([
    prisma.booking.findMany({
      where: { clientId: userId },
      include: {
        car: {
          include: {
            // order 0 is the cover photo — there is no isCover column
            photos:     { orderBy: { order: "asc" }, take: 1 },
            fuelPolicy: true,
          },
        },
        location: {
          include: { platformLocation: true, ownerLocation: true },
        },
        conditionPhotos: {
          where: { isDeleted: false },
          select: { id: true, isPreTrip: true, uploadedById: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.count({
      where: { userId, isRead: false },
    }),
  ]);

  return { bookings, unreadCount };
}

// ─── Inner async component (wrapped in Suspense) ──────────────────────────────

async function OverviewContent({
  userId,
  locale,
}: {
  userId: string;
  locale: string;
}) {
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const { bookings, unreadCount } = await getDashboardData(userId);

  // Classify bookings
  const activeBooking = bookings.find((b) => b.status === "ACTIVE");
  const upcomingBooking = bookings.find((b) =>
    ["CONFIRMED", "AWAITING_OWNER_CONFIRMATION"].includes(b.status)
  );
  const recentBookings = bookings
    .filter((b) => !["ACTIVE"].includes(b.status))
    .slice(0, 5);

  // Stats
  const totalBookings     = bookings.length;
  const completedBookings = bookings.filter((b) => b.status === "COMPLETED").length;
  const pendingBookings   = bookings.filter((b) =>
    ["PENDING_PAYMENT", "PAYMENT_CONFIRMED", "AWAITING_OWNER_CONFIRMATION"].includes(b.status)
  ).length;

  // Helper: check if photos are done for a booking and direction
  function photosUploaded(booking: (typeof bookings)[0], direction: "PRE" | "POST") {
    return booking.conditionPhotos.some(
      (p) => p.isPreTrip === (direction === "PRE") && p.uploadedById === userId
    );
  }

  // Pickup location can come from any of the three location tiers.
  function pickupLabel(b: (typeof bookings)[0]) {
    return (
      b.location?.platformLocation?.name ??
      b.location?.ownerLocation?.name ??
      b.location?.customDescription ??
      "Kigali"
    );
  }

  // What the client actually paid: rental subtotal plus the refundable deposit.
  function totalCharged(b: (typeof bookings)[0]) {
    return b.subtotal + b.depositAmount;
  }

  // Format a booking for BookingCard
  function toCardProps(b: (typeof bookings)[0]) {
    const coverUrl = b.car.photos[0]?.url ?? "/images/car-placeholder.jpg";
    const location = pickupLabel(b);
    return {
      id:              b.id,
      reference:       b.reference,
      carMake:         b.car.make,
      carModel:        b.car.model,
      carYear:         b.car.year,
      carPhotoUrl:     coverUrl,
      startDate:       b.startDate,
      endDate:         b.endDate,
      totalAmount:     totalCharged(b),
      status:          b.status as any,
      pickupLocation:  location,
      hasDriverOption: b.driverRequested,
      preTripPhotoPending:  !photosUploaded(b, "PRE"),
      postTripPhotoPending: !photosUploaded(b, "POST"),
    };
  }

  return (
    <DashboardLayout notificationCount={unreadCount}>
      <div className="space-y-5">

        {/* ── Active Trip ─────────────────────────────────────────────── */}
        {activeBooking ? (
          <ActiveTripCard
            bookingId={activeBooking.id}
            reference={activeBooking.reference}
            carMake={activeBooking.car.make}
            carModel={activeBooking.car.model}
            carYear={activeBooking.car.year}
            carPhotoUrl={activeBooking.car.photos[0]?.url ?? "/images/car-placeholder.jpg"}
            returnDate={activeBooking.endDate}
            pickupLocation={pickupLabel(activeBooking)}
            totalAmount={totalCharged(activeBooking)}
            preTripPhotosDone={photosUploaded(activeBooking, "PRE")}
            postTripPhotosDone={photosUploaded(activeBooking, "POST")}
          />
        ) : null}

        {/* ── Upcoming Booking ─────────────────────────────────────────── */}
        {upcomingBooking ? (
          <UpcomingBookingCard
            bookingId={upcomingBooking.id}
            reference={upcomingBooking.reference}
            carMake={upcomingBooking.car.make}
            carModel={upcomingBooking.car.model}
            carYear={upcomingBooking.car.year}
            carPhotoUrl={upcomingBooking.car.photos[0]?.url ?? "/images/car-placeholder.jpg"}
            startDate={upcomingBooking.startDate}
            endDate={upcomingBooking.endDate}
            pickupLocation={pickupLabel(upcomingBooking)}
            totalAmount={totalCharged(upcomingBooking)}
          />
        ) : null}

        {/* ── Stats Row ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard icon={CalendarDays} value={totalBookings}     label={t("totalBookings")}     />
          <StatCard icon={Car}          value={activeBooking ? 1 : 0} label={t("activeTrips")} accent={!!activeBooking} />
          <StatCard icon={CheckCircle2} value={completedBookings} label={t("completedTrips")}    />
          <StatCard icon={Clock}        value={pendingBookings}   label={t("pendingBookings")}   />
        </div>

        {/* ── Recent Bookings ──────────────────────────────────────────── */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-ink">{t("recentBookings")}</h2>
            <a href="/dashboard/bookings" className="text-sm font-medium text-brand hover:underline">
              {t("viewAll")}
            </a>
          </div>

          {recentBookings.length === 0 ? (
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-sand-dark">
              <EmptyState
                variant="no-bookings"
                title="No bookings yet"
                description="Browse available cars and make your first booking in minutes."
                actionLabel="Browse Cars"
                actionHref="/cars"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {recentBookings.map((b) => (
                <BookingCard key={b.id} {...toCardProps(b)} />
              ))}
            </div>
          )}
        </div>

      </div>
    </DashboardLayout>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default async function DashboardPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({
    locale: params.locale,
    namespace: "dashboard",
  });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath("/dashboard"));

  return (
    <Suspense
      fallback={
        <DashboardLayout>
          <OverviewSkeleton label={t("loadingDashboard")} />
        </DashboardLayout>
      }
    >
      <OverviewContent userId={session.user.id} locale={params.locale} />
    </Suspense>
  );
}
