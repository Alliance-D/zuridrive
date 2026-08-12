"use client";

/**
 * ActiveTripCard — Prominent card shown at the top of the client dashboard
 * whenever the user has an ACTIVE booking. Shows car photo, key trip details,
 * a live countdown to the return date, and quick action buttons.
 *
 * Uses a rich forest-green background to visually stand out.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Car,
  MapPin,
  Clock,
  Camera,
  AlertTriangle,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { formatRWF } from "@/lib/currency";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveTripCardProps {
  bookingId:       string;
  reference:       string;
  carMake:         string;
  carModel:        string;
  carYear:         number;
  carPhotoUrl:     string;
  returnDate:      Date;
  pickupLocation:  string;
  totalAmount:     number;          // in RWF integers
  preTripPhotosDone:   boolean;
  postTripPhotosDone:  boolean;
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(target: Date) {
  const [diff, setDiff] = useState(() => target.getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setDiff(target.getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  const totalSeconds = Math.max(0, Math.floor(diff / 1000));
  const days    = Math.floor(totalSeconds / 86400);
  const hours   = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const isOverdue = diff < 0;

  return { days, hours, minutes, seconds, isOverdue };
}

// ─── Pad helper ───────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActiveTripCard({
  bookingId,
  reference,
  carMake,
  carModel,
  carYear,
  carPhotoUrl,
  returnDate,
  pickupLocation,
  totalAmount,
  preTripPhotosDone,
  postTripPhotosDone,
}: ActiveTripCardProps) {
  const { days, hours, minutes, seconds, isOverdue } = useCountdown(returnDate);

  const countdownLabel = isOverdue
    ? "Return overdue"
    : days > 0
      ? `${days}d ${pad(hours)}h remaining`
      : `${pad(hours)}:${pad(minutes)}:${pad(seconds)} remaining`;

  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand text-white shadow-lg shadow-brand/20">
      {/* Decorative background texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            white 0px, white 1px,
            transparent 1px, transparent 14px
          )`,
        }}
      />

      {/* Gold accent bar at top */}
      <div className="h-1 w-full bg-gradient-to-r from-accent via-accent-strong to-accent" />

      <div className="relative p-5 sm:p-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-accent">
              <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-accent opacity-60" />
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-brand-tint">
              Active Trip
            </span>
          </div>
          <span className="text-xs text-brand-tint">Ref: {reference}</span>
        </div>

        {/* Main content row */}
        <div className="flex gap-4">
          {/* Car photo */}
          <div className="relative h-24 w-32 flex-shrink-0 overflow-hidden rounded-xl sm:h-28 sm:w-40 bg-brand-light">
            <Image
              src={carPhotoUrl}
              alt={`${carMake} ${carModel}`}
              fill
              className="object-cover"
              sizes="160px"
            />
          </div>

          {/* Details */}
          <div className="flex flex-1 flex-col justify-between min-w-0">
            <div>
              <h2 className="text-base font-bold sm:text-lg">
                {carMake} {carModel}
                <span className="ml-1.5 text-sm font-normal text-brand-tint">
                  {carYear}
                </span>
              </h2>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-brand-tint">
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {pickupLocation}
                </span>
                <span className="flex items-center gap-1">
                  <Car className="h-3 w-3" />
                  {formatRWF(totalAmount)} total
                </span>
              </div>
            </div>

            {/* Countdown */}
            <div
              className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${
                isOverdue
                  ? "bg-red-500/20 text-red-200"
                  : "bg-accent/20 text-accent-strong"
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              {countdownLabel}
            </div>
          </div>
        </div>

        {/* Photo upload checklist */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
              preTripPhotosDone
                ? "bg-brand-light text-brand-tint"
                : "bg-accent/10 text-accent-strong ring-1 ring-accent/30"
            }`}
          >
            {preTripPhotosDone ? (
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <Camera className="h-3.5 w-3.5 flex-shrink-0 animate-pulse" />
            )}
            Pre-trip photos {preTripPhotosDone ? "done ✓" : "needed"}
          </div>
          <div
            className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${
              postTripPhotosDone
                ? "bg-brand-light text-brand-tint"
                : "bg-white/5 text-brand-tint"
            }`}
          >
            {postTripPhotosDone ? (
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            ) : (
              <Camera className="h-3.5 w-3.5 flex-shrink-0" />
            )}
            Post-trip photos {postTripPhotosDone ? "done ✓" : "pending"}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/dashboard/bookings/${bookingId}`}
            className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand hover:bg-bone active:scale-95 transition-all duration-150"
          >
            View Trip Details
            <ChevronRight className="h-4 w-4" />
          </Link>
          {!preTripPhotosDone && (
            <Link
              href={`/dashboard/bookings/${bookingId}?action=photos`}
              className="flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-accent-mid active:scale-95 transition-all duration-150"
            >
              <Camera className="h-4 w-4" />
              Upload Photos
            </Link>
          )}
          <Link
            href={`/dashboard/bookings/${bookingId}?action=report`}
            className="flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 active:scale-95 transition-all duration-150"
          >
            <AlertTriangle className="h-4 w-4" />
            Report Issue
          </Link>
        </div>
      </div>
    </div>
  );
}
