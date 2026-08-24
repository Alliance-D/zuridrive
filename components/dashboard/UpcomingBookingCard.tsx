"use client";

/**
 * UpcomingBookingCard — Compact card for the next CONFIRMED booking.
 * Shows a live countdown to the trip start date.
 * Placed just below the ActiveTripCard on the overview page.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import { CalendarDays, MapPin, ChevronRight, Clock } from "lucide-react";
import { formatMoney } from "@/lib/currency";

interface UpcomingBookingCardProps {
  bookingId:      string;
  reference:      string;
  carMake:        string;
  carModel:       string;
  carYear:        number;
  carPhotoUrl:    string;
  startDate:      Date;
  endDate:        Date;
  pickupLocation: string;
  totalAmount:    number;
}

function useCountdownDays(target: Date) {
  const [diff, setDiff] = useState(() => target.getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 60_000);
    return () => clearInterval(id);
  }, [target]);

  const days  = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  const hours = Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
  return { days, hours, isToday: days === 0 };
}

function formatShortDate(d: Date) {
  return d.toLocaleDateString("en-RW", { weekday: "short", month: "short", day: "numeric" });
}

export default function UpcomingBookingCard({
  bookingId,
  reference,
  carMake,
  carModel,
  carYear,
  carPhotoUrl,
  startDate,
  endDate,
  pickupLocation,
  totalAmount,
}: UpcomingBookingCardProps) {
  const t = useTranslations("dashboard");
  const { days, hours, isToday } = useCountdownDays(startDate);

  const countdownText = isToday
    ? "Starts today!"
    : days === 1
      ? "Starts tomorrow"
      : days <= 3
        ? `Starts in ${days} days`
        : `${days} days away`;

  const countdownColor = isToday
    ? "bg-emerald-50 text-emerald-700"
    : days <= 3
      ? "bg-amber-50 text-amber-700"
      : "bg-sand text-ink-soft";

  return (
    <Link
      href={`/dashboard/bookings/${bookingId}`}
      className="group flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-sand-dark hover:ring-brand hover:shadow-md transition-all duration-200"
    >
      {/* Label pill */}
      <div className="absolute" />

      {/* Thumbnail */}
      <div className="relative h-16 w-22 flex-shrink-0 overflow-hidden rounded-xl bg-sand sm:h-20 sm:w-28">
        <Image
          src={carPhotoUrl}
          alt={`${carMake} ${carModel}`}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="112px"
        />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Upcoming label */}
        <span className="text-[10px] font-bold uppercase tracking-widest text-brand">
          {t("upcomingBooking")}
        </span>

        <h3 className="truncate text-sm font-semibold text-ink">
          {carMake} {carModel}{" "}
          <span className="font-normal text-ink-soft">({carYear})</span>
        </h3>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-soft">
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {formatShortDate(startDate)} – {formatShortDate(endDate)}
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {pickupLocation}
          </span>
        </div>

        <div className="mt-1 flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${countdownColor}`}
          >
            <Clock className="h-3 w-3" />
            {countdownText}
          </span>
          <span className="text-sm font-bold text-brand">{formatMoney(totalAmount)}</span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-ink-faint transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}
