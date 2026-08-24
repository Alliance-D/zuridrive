/**
 * EmptyState — Illustrated empty states for every dashboard context.
 * Never shows blank white space. Each variant has a purpose-built SVG illustration.
 * Server component — no interactivity, pure presentational.
 */

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

type EmptyVariant =
  | "no-bookings"
  | "no-active-trip"
  | "no-upcoming"
  | "no-notifications"
  | "no-reviews"
  | "generic";

interface EmptyStateProps {
  variant?: EmptyVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
}

// ─── Illustrations ────────────────────────────────────────────────────────────

function CarJourneyIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[280px]">
      {/* Road */}
      <rect x="0" y="140" width="280" height="40" rx="0" fill="#E8E4DD"/>
      <rect x="0" y="154" width="280" height="12" fill="#D4CFC8"/>
      {/* Road dashes */}
      {[20,60,100,140,180,220].map(x => (
        <rect key={x} x={x} y="159" width="24" height="4" rx="2" fill="white" opacity="0.7"/>
      ))}
      {/* Car body */}
      <rect x="90" y="108" width="100" height="38" rx="10" fill="#1B4332"/>
      {/* Cabin */}
      <path d="M108 108 L116 82 H164 L172 108 Z" fill="#2D6A4F"/>
      {/* Windows */}
      <rect x="120" y="87" width="17" height="18" rx="3" fill="#A7D1BF" opacity="0.8"/>
      <rect x="143" y="87" width="17" height="18" rx="3" fill="#A7D1BF" opacity="0.8"/>
      {/* Wheels */}
      <circle cx="118" cy="148" r="14" fill="#1C1C1C"/>
      <circle cx="118" cy="148" r="8"  fill="#4B5563"/>
      <circle cx="118" cy="148" r="3"  fill="#9CA3AF"/>
      <circle cx="162" cy="148" r="14" fill="#1C1C1C"/>
      <circle cx="162" cy="148" r="8"  fill="#4B5563"/>
      <circle cx="162" cy="148" r="3"  fill="#9CA3AF"/>
      {/* Headlights */}
      <rect x="184" y="118" width="8" height="6" rx="2" fill="#D4A017" opacity="0.9"/>
      {/* Tail lights */}
      <rect x="88" y="118" width="6" height="6" rx="2" fill="#EF4444" opacity="0.8"/>
      {/* Stars / dots above */}
      <circle cx="60"  cy="40"  r="2.5" fill="#D4A017" opacity="0.6"/>
      <circle cx="90"  cy="20"  r="2"   fill="#D4A017" opacity="0.4"/>
      <circle cx="200" cy="30"  r="3"   fill="#D4A017" opacity="0.5"/>
      <circle cx="230" cy="55"  r="2"   fill="#D4A017" opacity="0.35"/>
      {/* Ground shadow */}
      <ellipse cx="140" cy="150" rx="65" ry="6" fill="#1B4332" opacity="0.08"/>
    </svg>
  );
}

function CalendarEmptyIllustration() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[220px]">
      {/* Calendar */}
      <rect x="30" y="35" width="160" height="130" rx="14" fill="white" stroke="#E5E0D8" strokeWidth="2"/>
      <rect x="30" y="35" width="160" height="48" rx="14" fill="#1B4332"/>
      <rect x="30" y="67" width="160" height="16" fill="#1B4332"/>
      {/* Header rings */}
      <rect x="70"  y="24" width="10" height="22" rx="5" fill="#1B4332"/>
      <rect x="140" y="24" width="10" height="22" rx="5" fill="#1B4332"/>
      {/* Month label */}
      <rect x="85" y="51" width="50" height="8" rx="4" fill="white" opacity="0.3"/>
      {/* Grid cells */}
      {[0,1,2,3,4,5,6].map(col => (
        <rect key={col} x={44 + col*22} y="96" width="13" height="13" rx="3" fill="#F0EDE8"/>
      ))}
      {[0,1,2,3,4,5].map(col => (
        <rect key={col} x={44 + col*22} y="116" width="13" height="13" rx="3" fill="#F0EDE8"/>
      ))}
      {/* Highlight one cell */}
      <rect x="88" y="96" width="13" height="13" rx="3" fill="#D4A017" opacity="0.8"/>
      {/* Question mark */}
      <text x="110" y="160" textAnchor="middle" fontSize="28" fill="#E5E0D8" fontFamily="serif">?</text>
    </svg>
  );
}

function NoActiveTripIllustration() {
  return (
    <svg viewBox="0 0 220 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[220px]">
      {/* Map pin */}
      <path d="M110 20C88 20 70 38 70 60C70 82 110 130 110 130C110 130 150 82 150 60C150 38 132 20 110 20Z" fill="#E8E4DD" stroke="#D4CFC8" strokeWidth="2"/>
      <circle cx="110" cy="60" r="16" fill="white" stroke="#1B4332" strokeWidth="2"/>
      {/* Dashed road */}
      <path d="M20 145 Q110 135 200 145" stroke="#D4CFC8" strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round"/>
      {/* Small car icon */}
      <rect x="96" y="53" width="28" height="14" rx="4" fill="#1B4332" opacity="0.5"/>
      <path d="M100 53 L103 46 H117 L120 53Z" fill="#2D6A4F" opacity="0.5"/>
      <circle cx="102" cy="67" r="4" fill="#374151" opacity="0.4"/>
      <circle cx="118" cy="67" r="4" fill="#374151" opacity="0.4"/>
    </svg>
  );
}

function BellIllustration() {
  return (
    <svg viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[160px]">
      <circle cx="80" cy="80" r="68" fill="#F7F5F0"/>
      <path d="M80 28C57 28 46 48 46 68V96L34 108H126L114 96V68C114 48 103 28 80 28Z" fill="#E8E4DD" stroke="#D4CFC8" strokeWidth="2"/>
      <rect x="68" y="108" width="24" height="10" rx="5" fill="#D4A017" opacity="0.6"/>
      <circle cx="80" cy="28" r="6" fill="#1B4332" opacity="0.3"/>
      {/* Zs — silence */}
      <text x="110" y="56" fontSize="14" fill="#D4CFC8" fontFamily="sans-serif" fontWeight="bold">z</text>
      <text x="122" y="44" fontSize="11" fill="#D4CFC8" fontFamily="sans-serif" fontWeight="bold">z</text>
      <text x="131" y="35" fontSize="8"  fill="#D4CFC8" fontFamily="sans-serif" fontWeight="bold">z</text>
    </svg>
  );
}

// ─── Default content per variant ─────────────────────────────────────────────

const DEFAULTS: Record<
  EmptyVariant,
  { titleKey: string; descKey: string; actionKey?: string; actionHref?: string; Illustration: React.FC }
> = {
  "no-bookings": {
    titleKey: "emptyNoBookingsTitle",
    descKey: "emptyNoBookingsBody",
    actionKey: "emptyBrowseCars",
    actionHref: "/cars",
    Illustration: CarJourneyIllustration,
  },
  "no-active-trip": {
    titleKey: "emptyNoActiveTitle",
    descKey: "emptyNoActiveBody",
    actionKey: "emptyFindCar",
    actionHref: "/cars",
    Illustration: NoActiveTripIllustration,
  },
  "no-upcoming": {
    titleKey: "emptyNoUpcomingTitle",
    descKey: "emptyNoUpcomingBody",
    actionKey: "emptyBookCar",
    actionHref: "/cars",
    Illustration: CalendarEmptyIllustration,
  },
  "no-notifications": {
    titleKey: "emptyNoNotificationsTitle",
    descKey: "emptyNoNotificationsBody",
    Illustration: BellIllustration,
  },
  "no-reviews": {
    titleKey: "emptyNoReviewsTitle",
    descKey: "emptyNoReviewsBody",
    Illustration: CarJourneyIllustration,
  },
  generic: {
    titleKey: "emptyGenericTitle",
    descKey: "emptyGenericBody",
    Illustration: CarJourneyIllustration,
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EmptyState({
  variant = "generic",
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  const t = useTranslations("dashboard");
  const defaults = DEFAULTS[variant];
  const { Illustration } = defaults;

  const displayTitle       = title       ?? t(defaults.titleKey);
  const displayDescription = description ?? t(defaults.descKey);
  const displayActionLabel =
    actionLabel ?? (defaults.actionKey ? t(defaults.actionKey) : undefined);
  const displayActionHref  = actionHref  ?? defaults.actionHref;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Illustration */}
      <div className="mb-6 flex items-center justify-center">
        <Illustration />
      </div>

      {/* Text */}
      <h3 className="mb-2 text-lg font-semibold text-ink">{displayTitle}</h3>
      <p className="mb-6 max-w-xs text-sm leading-relaxed text-ink-soft">{displayDescription}</p>

      {/* CTA */}
      {displayActionLabel && displayActionHref && (
        <Link
          href={displayActionHref}
          className="inline-flex items-center gap-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-light active:scale-95 transition-all duration-150"
        >
          {displayActionLabel}
        </Link>
      )}
    </div>
  );
}
