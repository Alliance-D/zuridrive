/**
 * /owner/bookings — every booking across the owner's fleet
 *
 * Status filter via ?status=. Bookings awaiting confirmation sort first
 * regardless of filter, because they're time-limited (2-hour window).
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";
import { formatRWF } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import { getEnumLabeller } from "@/lib/enum-labels";
import { routes } from "@/lib/routes";
import type { BookingStatus, Prisma } from "@prisma/client";
import { CalendarDays, ArrowRight, Inbox } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("bookings")} — ZuriDrive` };
}

// Keys, not text: evaluated once at import, where no translator exists.
const TABS: { labelKey: string; value: string }[] = [
  { labelKey: "tabAll", value: "ALL" },
  { labelKey: "tabToConfirm", value: "AWAITING_OWNER_CONFIRMATION" },
  { labelKey: "tabUpcoming", value: "CONFIRMED" },
  { labelKey: "tabActive", value: "ACTIVE" },
  { labelKey: "tabCompleted", value: "COMPLETED" },
  { labelKey: "tabCancelled", value: "CANCELLED" },
  { labelKey: "tabDisputed", value: "DISPUTED" },
];

const STATUS_STYLES: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "bg-sand text-ink-soft",
  PAYMENT_CONFIRMED: "bg-info-bg text-info",
  AWAITING_OWNER_CONFIRMATION: "bg-warning-tint text-warning-dark",
  CONFIRMED: "bg-success-bg text-success",
  ACTIVE: "bg-brand text-white",
  COMPLETED: "bg-sand text-ink-muted",
  CANCELLED: "bg-danger-bg text-danger",
  DISPUTED: "bg-danger-bg text-danger",
};

export default async function OwnerBookingsPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { status?: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const label = await getEnumLabeller(params.locale);
  const { profile } = await requireOwnerProfile();

  const requested = searchParams.status ?? "ALL";
  const active = TABS.some((tab) => tab.value === requested) ? requested : "ALL";

  const statusFilter: Prisma.EnumBookingStatusFilter | undefined =
    active === "ALL" ? undefined : { equals: active as BookingStatus };

  const bookings = await prisma.booking.findMany({
    where: {
      car: { ownerId: profile.id },
      ...(statusFilter ? { status: statusFilter } : {}),
    },
    include: {
      car: {
        select: {
          make: true,
          model: true,
          year: true,
          photos: { orderBy: { order: "asc" }, take: 1 },
        },
      },
      client: { select: { name: true, phone: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: 50,
  });

  // Time-limited confirmations float to the top whatever the filter.
  const sorted = [...bookings].sort((a, b) => {
    const aUrgent = a.status === "AWAITING_OWNER_CONFIRMATION" ? 0 : 1;
    const bUrgent = b.status === "AWAITING_OWNER_CONFIRMATION" ? 0 : 1;
    return aUrgent - bUrgent;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("bookings")}</h1>
        <p className="text-sm text-ink-soft">{t("bookingsSub")}</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/owner/bookings?status=${tab.value}`}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              active === tab.value
                ? "bg-brand text-white"
                : "bg-white text-ink-soft hover:text-ink"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <Inbox className="h-5 w-5 text-ink-faint" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            {t("noBookingsHere")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {active === "ALL" ? t("noBookingsAll") : t("noBookingsFilter")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((b) => (
            <li key={b.id}>
              <Link
                href={routes.ownerBookingDetail(b.id)}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm hover:shadow-md"
              >
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-sand">
                  {b.car.photos[0] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={b.car.photos[0].url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <CalendarDays className="h-4 w-4 text-ink-faint" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">
                      {b.car.year} {b.car.make} {b.car.model}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[b.status]}`}
                    >
                      {label("bookingStatus", b.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {b.client.name ?? t("client")} ·{" "}
                    {formatDate(b.startDate, params.locale)} →{" "}
                    {formatDate(b.endDate, params.locale)}
                  </p>
                  <p className="text-[11px] text-ink-faint">{b.reference}</p>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-brand">
                    {formatRWF(b.ownerEarnings)}
                  </p>
                  <p className="text-[10px] text-ink-faint">
                    {t("yourEarningsLabel")}
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
