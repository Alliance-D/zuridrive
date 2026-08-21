/**
 * BookingCard — Compact booking summary card for list views.
 * Shows car photo, status badge, dates, price, and contextual action buttons.
 * Includes a photo-upload reminder banner when condition photos are pending.
 * Client component for interactive hover states.
 */

"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { CalendarDays, MapPin, Camera, ChevronRight, User } from "lucide-react";
import { formatMoney } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "AWAITING_OWNER_CONFIRMATION"
  | "CONFIRMED"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "DISPUTED";

interface BookingCardProps {
  id:            string;
  reference:     string;
  carMake:       string;
  carModel:      string;
  carYear:       number;
  carPhotoUrl:   string;
  startDate:     Date;
  endDate:       Date;
  totalAmount:   number;   // in RWF integers
  status:        BookingStatus;
  pickupLocation: string;
  hasDriverOption: boolean;
  /** True when pre-trip photos haven't been uploaded by the client */
  preTripPhotoPending?:  boolean;
  /** True when post-trip photos haven't been uploaded by the client */
  postTripPhotoPending?: boolean;
}

// ─── Status Config ────────────────────────────────────────────────────────────
// Single source of truth for colours + label keys. Text lives in the message
// files; this is module scope, where no translator exists.
export const STATUS_CONFIG: Record<
  BookingStatus,
  { labelKey: string; bg: string; text: string; dot: string }
> = {
  PENDING_PAYMENT:             { labelKey: "statusPendingPayment",   bg: "bg-amber-50",  text: "text-amber-700",  dot: "bg-amber-500"  },
  PAYMENT_CONFIRMED:           { labelKey: "statusPaymentConfirmed", bg: "bg-blue-50",   text: "text-blue-700",   dot: "bg-blue-500"   },
  AWAITING_OWNER_CONFIRMATION: { labelKey: "statusAwaitingOwner",    bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  CONFIRMED:                   { labelKey: "statusConfirmed",         bg: "bg-emerald-50",text: "text-emerald-700",dot: "bg-emerald-500"},
  ACTIVE:                      { labelKey: "statusActive",       bg: "bg-brand", text: "text-white",      dot: "bg-accent"  },
  COMPLETED:                   { labelKey: "statusCompleted",         bg: "bg-gray-100",  text: "text-gray-600",   dot: "bg-gray-400"   },
  CANCELLED:                   { labelKey: "statusCancelled",         bg: "bg-red-50",    text: "text-red-600",    dot: "bg-red-400"    },
  DISPUTED:                    { labelKey: "statusDisputed",          bg: "bg-orange-50", text: "text-orange-700", dot: "bg-orange-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const startStr = start.toLocaleDateString("en-RW", opts);
  const endStr   = end.toLocaleDateString("en-RW", { ...opts, year: "numeric" });
  return `${startStr} – ${endStr}`;
}

function dayCount(start: Date, end: Date): number {
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BookingCard({
  id,
  reference,
  carMake,
  carModel,
  carYear,
  carPhotoUrl,
  startDate,
  endDate,
  totalAmount,
  status,
  pickupLocation,
  hasDriverOption,
  preTripPhotoPending  = false,
  postTripPhotoPending = false,
}: BookingCardProps) {
  const t = useTranslations("dashboard");
  const tt = useTranslations("trip");
  const cfg  = STATUS_CONFIG[status];
  const days = dayCount(startDate, endDate);

  // When should we show the photo reminder banner?
  const showPhotoReminder =
    (status === "CONFIRMED"  && preTripPhotoPending)  ||
    (status === "ACTIVE"     && preTripPhotoPending)  ||
    (status === "COMPLETED"  && postTripPhotoPending);

  const photoReminderText =
    status === "COMPLETED"
      ? "Post-trip photos pending — upload before they're due"
      : "Pre-trip photos needed before your trip starts";

  return (
    <Link
      href={`/dashboard/bookings/${id}`}
      className="group block rounded-2xl bg-white shadow-sm ring-1 ring-sand-dark hover:ring-brand hover:shadow-md transition-all duration-200 overflow-hidden"
    >
      {/* Photo reminder banner */}
      {showPhotoReminder && (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 border-b border-amber-100">
          <Camera className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <span className="text-xs font-medium text-amber-700">{photoReminderText}</span>
        </div>
      )}

      <div className="flex gap-3 p-4 sm:gap-4 sm:p-5">
        {/* Car thumbnail */}
        <div className="relative h-20 w-28 flex-shrink-0 overflow-hidden rounded-xl sm:h-24 sm:w-32 bg-sand">
          <Image
            src={carPhotoUrl}
            alt={`${carMake} ${carModel}`}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="128px"
          />
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            {/* Title row */}
            <div className="mb-1 flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-ink sm:text-base">
                {carMake} {carModel} <span className="font-normal text-ink-soft">({carYear})</span>
              </h3>
              {/* Status badge */}
              <span
                className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cfg.bg} ${cfg.text}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
                {tt(cfg.labelKey)}
              </span>
            </div>

            {/* Meta rows */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {formatDateRange(startDate, endDate)} · {days}d
              </span>
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {pickupLocation}
              </span>
              {hasDriverOption && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {t("withDriver")}
                </span>
              )}
            </div>
          </div>

          {/* Bottom row: price + ref + arrow */}
          <div className="mt-2.5 flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-brand">{formatMoney(totalAmount)}</span>
              <span className="ml-1 text-xs text-ink-faint">Ref: {reference}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5" />
          </div>
        </div>
      </div>
    </Link>
  );
}
