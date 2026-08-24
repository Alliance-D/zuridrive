/**
 * /owner/dashboard — Owner overview
 *
 * Server component. Everything here is derived from real rows:
 *   • Action-required queue (bookings awaiting this owner's confirmation)
 *   • Active trips
 *   • Earnings from the Commission ledger
 *   • Fleet status counts
 *
 * Earnings read Commission.netOwnerAmount rather than recomputing, so the
 * figures always agree with what finance will actually pay out.
 */

import { redirect } from "next/navigation";
import { localePath, loginPath } from "@/lib/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { routes } from "@/lib/routes";
import {
  Car,
  CalendarClock,
  Wallet,
  TrendingUp,
  ArrowRight,
  Plus,
  Inbox,
} from "lucide-react";

function StatCard({
  icon: Icon,
  value,
  label,
  hint,
  accent = false,
}: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 shadow-sm ${
        accent ? "bg-brand text-white" : "bg-white"
      }`}
    >
      <div
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full ${
          accent ? "bg-white/15" : "bg-sand"
        }`}
      >
        <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-brand"}`} />
      </div>
      <p className={`text-2xl font-bold ${accent ? "text-white" : "text-ink"}`}>
        {value}
      </p>
      <p className={`mt-0.5 text-xs ${accent ? "text-brand-tint" : "text-ink-soft"}`}>
        {label}
      </p>
      {hint && (
        <p
          className={`mt-1 text-[11px] ${
            accent ? "text-brand-tint" : "text-ink-faint"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

export default async function OwnerDashboardPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect(await loginPath());

  const profile = await prisma.carOwnerProfile.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });

  // An OWNER with no profile row has not started onboarding yet.
  if (!profile) redirect(await localePath("/owner/onboarding"));

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    cars,
    awaitingConfirmation,
    activeTrips,
    lifetimeEarnings,
    monthEarnings,
    completedCount,
  ] = await Promise.all([
    prisma.car.findMany({
      where: { ownerId: profile.id },
      select: { id: true, status: true, isActive: true },
    }),
    prisma.booking.findMany({
      where: {
        car: { ownerId: profile.id },
        status: "AWAITING_OWNER_CONFIRMATION",
      },
      include: {
        car: { select: { make: true, model: true, year: true } },
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
    prisma.booking.findMany({
      where: { car: { ownerId: profile.id }, status: "ACTIVE" },
      include: {
        car: { select: { make: true, model: true, year: true } },
        client: { select: { name: true, phone: true } },
      },
      orderBy: { endDate: "asc" },
      take: 5,
    }),
    prisma.commission.aggregate({
      _sum: { netOwnerAmount: true },
      where: { booking: { car: { ownerId: profile.id }, status: "COMPLETED" } },
    }),
    prisma.commission.aggregate({
      _sum: { netOwnerAmount: true },
      where: {
        booking: {
          car: { ownerId: profile.id },
          status: "COMPLETED",
          tripEndedAt: { gte: monthStart },
        },
      },
    }),
    prisma.booking.count({
      where: { car: { ownerId: profile.id }, status: "COMPLETED" },
    }),
  ]);

  const liveCars = cars.filter((c) => c.status === "LIVE" && c.isActive).length;
  const pendingCars = cars.filter((c) => c.status === "PENDING_APPROVAL").length;
  const draftCars = cars.filter((c) => c.status === "DRAFT").length;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{t("overview")}</h1>
          <p className="text-sm text-ink-soft">
            {t("overviewSub")}
          </p>
        </div>
        <Link
          href={routes.ownerFleetNew}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          <Plus className="h-4 w-4" />
          {t("listACar")}
        </Link>
      </div>

      {/* ── Stats ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={Wallet}
          value={formatMoney(monthEarnings._sum.netOwnerAmount ?? 0)}
          label={t("earnedThisMonth")}
          accent
        />
        <StatCard
          icon={TrendingUp}
          value={formatMoney(lifetimeEarnings._sum.netOwnerAmount ?? 0)}
          label={t("lifetimeEarnings")}
          hint={t("completedTripCount", { count: completedCount })}
        />
        <StatCard
          icon={Car}
          value={liveCars}
          label={t("carsLive")}
          hint={
            pendingCars || draftCars
              ? t("pendingDraftHint", {
                  pending: pendingCars,
                  draft: draftCars,
                })
              : undefined
          }
        />
        <StatCard
          icon={CalendarClock}
          value={activeTrips.length}
          label={t("activeTrips")}
        />
      </div>

      {/* ── Action required ───────────────────────────────────────────── */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">{t("waitingOnYou")}</h2>
          {awaitingConfirmation.length > 0 && (
            <span className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-semibold text-warning-dark">
              {t("toConfirmCount", { count: awaitingConfirmation.length })}
            </span>
          )}
        </div>

        {awaitingConfirmation.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl bg-bone px-4 py-6">
            <Inbox className="h-5 w-5 shrink-0 text-ink-faint" />
            <p className="text-sm text-ink-soft">
              {t("nothingWaiting")}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-sand">
            {awaitingConfirmation.map((b) => (
              <li key={b.id}>
                <Link
                  href={routes.ownerBookingDetail(b.id)}
                  className="flex items-center gap-3 py-3 hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {b.car.year} {b.car.make} {b.car.model}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {b.client.name ?? t("client")} ·{" "}
                      {formatDate(b.startDate, params.locale)} →{" "}
                      {formatDate(b.endDate, params.locale)} · {b.reference}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-brand">
                    {formatMoney(b.ownerEarnings)}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Active trips ──────────────────────────────────────────────── */}
      {activeTrips.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ink">
            {t("carsCurrentlyOut")}
          </h2>
          <ul className="divide-y divide-sand">
            {activeTrips.map((b) => (
              <li key={b.id}>
                <Link
                  href={routes.ownerBookingDetail(b.id)}
                  className="flex items-center gap-3 py-3 hover:opacity-80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {b.car.year} {b.car.make} {b.car.model}
                    </p>
                    <p className="text-xs text-ink-soft">
                      {t("withClientDueBack", {
                        name: b.client.name ?? t("clientLower"),
                        date: formatDate(b.endDate, params.locale),
                      })}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Empty fleet nudge ─────────────────────────────────────────── */}
      {cars.length === 0 && (
        <section className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <Car className="h-5 w-5 text-brand" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            {t("noCarListedYet")}
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
            {t("noCarListedHint")}
          </p>
          <Link
            href={routes.ownerFleetNew}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            <Plus className="h-4 w-4" />
            {t("listFirstCar")}
          </Link>
        </section>
      )}
    </div>
  );
}
