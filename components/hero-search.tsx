"use client";

// =============================================================================
// ZuriDrive — Hero Search Widget
// The main search/filter entry point on the homepage hero
// Client component — handles local state for the form fields
// On submit: navigates to /cars with query params
// =============================================================================

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations, useLocale } from "next-intl";
import { MapPin, Calendar, Car, Search } from "lucide-react";

type RentalType = "day" | "week" | "month";


// The three search fields share one appearance. This was three identical style
// objects plus onFocus/onBlur handlers writing borderColor to element.style;
// focus-visible does the same declaratively.
const FIELD =
  "w-full rounded-2xl border border-white/15 bg-white/10 py-3 pl-10 pr-3.5 font-sans text-fluid-sm text-white outline-none transition-colors focus:border-accent/60";
const FIELD_ICON =
  "pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/50";

export interface Neighborhood {
  id: string;
  name: string;
}

/**
 * The pickup field was a free-text box whose value was put in the URL and then
 * ignored by the results page. Typed text cannot be matched against anything —
 * pickup points are rows with ids — so it is a picker of real neighbourhoods,
 * and /cars filters on the id.
 */
export default function HeroSearch({
  neighborhoods = [],
}: {
  neighborhoods?: Neighborhood[];
}) {
  const t = useTranslations("home");
  const locale = useLocale();
  const router = useRouter();
  const [location, setLocation] = useState("");
  const [rentalType, setRentalType] = useState<RentalType>("day");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (location) params.set("location", location);
    if (rentalType) params.set("type", rentalType);
    if (startDate) params.set("from", startDate);
    if (endDate) params.set("to", endDate);
    router.push(`/${locale}/cars?${params.toString()}`);
  };

  return (
    <div className="w-full max-w-[760px] rounded-3xl border border-white/[0.12] bg-[rgba(10,20,15,0.6)] p-[clamp(1.25rem,2.5vw,2rem)] backdrop-blur-[20px]">
      {/* Rental type toggle */}
      <div className="mb-4 flex gap-2">
        {(["day", "week", "month"] as RentalType[]).map((type) => (
          <button
            key={type}
            onClick={() => setRentalType(type)}
            className={`cursor-pointer rounded-full border-none px-4 py-1.5 font-sans text-fluid-sm font-medium tracking-[0.01em] transition-all ${
              rentalType === type
                ? "bg-accent text-ink"
                : "bg-white/10 text-white/75"
            }`}
          >
            {t(`per${type.charAt(0).toUpperCase()}${type.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Search fields */}
      <div className="hero-search-grid grid grid-cols-[1fr_1fr_1fr_auto] items-stretch gap-3">
        {/* Location */}
        <div className="relative">
          <MapPin
            size={15}
            className={FIELD_ICON}
          />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            aria-label={t("pickupLocation")}
            className={`${FIELD} appearance-none [color-scheme:dark] ${
              location ? "text-white" : "text-white/50"
            }`}
          >
            <option value="">{t("pickupLocation")}</option>
            {neighborhoods.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </div>

        {/* Start date */}
        <div className="relative">
          <label htmlFor="hero-start-date" className="sr-only">
            {t("startDateLabel")}
          </label>
          <Calendar
            size={15}
            className={FIELD_ICON}
          />
          <input
            id="hero-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            min={new Date().toISOString().split("T")[0]}
            className={`${FIELD} [color-scheme:dark] ${
              startDate ? "text-white" : "text-white/50"
            }`}
          />
        </div>

        {/* End date */}
        <div className="relative">
          <label htmlFor="hero-end-date" className="sr-only">
            {t("endDateLabel")}
          </label>
          <Car
            size={15}
            className={FIELD_ICON}
          />
          <input
            id="hero-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || new Date().toISOString().split("T")[0]}
            className={`${FIELD} [color-scheme:dark] ${
              endDate ? "text-white" : "text-white/50"
            }`}
          />
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          className="btn btn-accent whitespace-nowrap px-6 py-3"
        >
          <Search size={16} />
          <span className="hide-mobile">{t("search")}</span>
        </button>
      </div>
    </div>
  );
}
