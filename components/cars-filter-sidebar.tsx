"use client";

/**
 * Car search filters.
 *
 * The controls here used to be pure decoration: local state went nowhere, and
 * "Apply Filters" had no onClick at all. Clicking it did literally nothing, so
 * every visitor saw the unfiltered list no matter what they picked.
 *
 * Filtering is done server-side from searchParams (see app/cars/page.tsx), so
 * this pushes to the URL rather than filtering in the browser. That keeps a
 * filtered search shareable, bookmarkable, and correct on the back button.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, SlidersHorizontal, ChevronDown} from "lucide-react";

interface FilterOption {
  /** Key under the `enum` namespace — these are DB values. */
  labelKey?: string;
  /**
   * Already-readable label, for options that come from data rather than an
   * enum. Country names are rows, not translation keys.
   */
  label?: string;
  value: string;
}

interface CarsFilterSidebarProps {
  /** Filters currently applied via the URL — used to seed the controls. */
  activeFilters?: {
    category?: string;
    transmission?: string;
    fuelType?: string;
    minPrice?: number;
    maxPrice?: number;
    country?: string;
  };
  /**
   * Markets currently trading.
   *
   * The control only appears when there is more than one — a country filter
   * offering a single country is a control that cannot do anything, and it
   * would take up the top of the sidebar for the whole of the Rwanda-only
   * period. It appears by itself the day a second market opens.
   */
  countries?: { code: string; name: string }[];
  totalResults?: number;
}

const PRICE_CEILING = 200_000;

export function CarsFilterSidebar({
  activeFilters,
  countries = [],
  totalResults,
}: CarsFilterSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Collapsed by default on mobile; the lg:block below keeps it open on desktop.
  const t = useTranslations("cars");
  const [mobileOpen, setMobileOpen] = useState(false);

  const [filters, setFilters] = useState({
    priceMin: activeFilters?.minPrice ?? 0,
    priceMax: activeFilters?.maxPrice ?? PRICE_CEILING,
    category: activeFilters?.category ?? "",
    transmission: activeFilters?.transmission ?? "",
    fuelType: activeFilters?.fuelType ?? "",
    country: activeFilters?.country ?? "",
  });

  // Values must match the enums in schema.prisma exactly — anything else
  // silently matches zero cars.
  const categories: FilterOption[] = [
    { labelKey: "category.ECONOMY", value: "ECONOMY" },
    { labelKey: "category.SUV", value: "SUV" },
    { labelKey: "category.LUXURY", value: "LUXURY" },
    { labelKey: "category.VAN", value: "VAN" },
    { labelKey: "category.MINIBUS", value: "MINIBUS" },
  ];

  const transmissions: FilterOption[] = [
    { labelKey: "transmission.MANUAL", value: "MANUAL" },
    { labelKey: "transmission.AUTOMATIC", value: "AUTOMATIC" },
  ];

  const fuelTypes: FilterOption[] = [
    { labelKey: "fuelType.PETROL", value: "PETROL" },
    { labelKey: "fuelType.DIESEL", value: "DIESEL" },
    { labelKey: "fuelType.HYBRID", value: "HYBRID" },
    { labelKey: "fuelType.ELECTRIC", value: "ELECTRIC" },
  ];

  function apply() {
    // Start from the existing query so unrelated params — location, dates,
    // rental type — survive a filter change.
    const params = new URLSearchParams(searchParams.toString());

    const set = (key: string, value: string | number | "") => {
      if (value === "" || value === 0) params.delete(key);
      else params.set(key, String(value));
    };

    set("country", filters.country);
    set("category", filters.category);
    set("transmission", filters.transmission);
    set("fuelType", filters.fuelType);
    set("minPrice", filters.priceMin);
    // Only send a maximum if it is actually a constraint.
    if (filters.priceMax >= PRICE_CEILING) params.delete("maxPrice");
    else params.set("maxPrice", String(filters.priceMax));

    // A new filter means a new result set — page 2 of the old one is meaningless.
    params.delete("page");

    startTransition(() => router.push(`/cars?${params.toString()}`));
  }

  function clearAll() {
    setFilters({
      priceMin: 0,
      priceMax: PRICE_CEILING,
      category: "",
      transmission: "",
      fuelType: "",
      country: "",
    });
    startTransition(() => router.push("/cars"));
  }

  const hasActiveFilters =
    Boolean(filters.category || filters.transmission || filters.fuelType) ||
    filters.priceMin > 0 ||
    filters.priceMax < PRICE_CEILING;

  /** Single-select behaviour: picking a value replaces the previous one. */
  const toggle = (
    key: "category" | "transmission" | "fuelType" | "country",
    value: string,
  ) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? "" : value }));

  /** How many filters are narrowing the results, for the mobile badge. */
  const activeCount =
    (filters.category ? 1 : 0) +
    (filters.transmission ? 1 : 0) +
    (filters.fuelType ? 1 : 0) +
    (filters.country ? 1 : 0) +
    (filters.priceMin > 0 || filters.priceMax < PRICE_CEILING ? 1 : 0);

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-sand-dark">
      {/*
        Below lg the whole panel collapses behind this button. Expanded, it
        filled the entire first screen on a phone, so you scrolled past every
        control before seeing a single car — the results are what people came
        for. On lg and up it is not a button at all, just the panel heading.
      */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-expanded={mobileOpen}
        aria-controls="cars-filter-body"
        className="flex w-full items-baseline justify-between p-6 text-left lg:pointer-events-none lg:cursor-default"
      >
        <span className="flex items-center gap-2 text-lg font-bold text-ink">
          <SlidersHorizontal className="h-4 w-4 text-brand" />
          {t("filters")}
          {activeCount > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white lg:hidden">
              {activeCount}
            </span>
          )}
        </span>

        <span className="flex items-center gap-2">
          {totalResults != null && (
            <span className="text-sm text-ink-soft">
              {totalResults} {totalResults === 1 ? "car" : "cars"}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-ink-soft transition-transform lg:hidden ${
              mobileOpen ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      <div
        id="cars-filter-body"
        className={`px-6 pb-6 ${mobileOpen ? "block" : "hidden"} lg:block`}
      >

      {/* Price */}
      <fieldset className="mb-6">
        <legend className="mb-3 font-semibold text-ink">{t("pricePerDay")}</legend>
        <div className="space-y-3">
          <div>
            <label htmlFor="priceMin" className="text-sm text-ink-soft">
              {t("priceFrom", { amount: filters.priceMin.toLocaleString() })}
            </label>
            <input
              id="priceMin"
              type="range"
              min={0}
              max={PRICE_CEILING}
              step={5_000}
              value={filters.priceMin}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                // Never let the floor cross the ceiling.
                setFilters((f) => ({
                  ...f,
                  priceMin: Math.min(v, f.priceMax),
                }));
              }}
              className="w-full accent-brand"
            />
          </div>
          <div>
            <label htmlFor="priceMax" className="text-sm text-ink-soft">
              {t("priceUpTo", { amount: filters.priceMax.toLocaleString() })}
              {filters.priceMax >= PRICE_CEILING ? "+" : ""}
            </label>
            <input
              id="priceMax"
              type="range"
              min={0}
              max={PRICE_CEILING}
              step={5_000}
              value={filters.priceMax}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setFilters((f) => ({
                  ...f,
                  priceMax: Math.max(v, f.priceMin),
                }));
              }}
              className="w-full accent-brand"
            />
          </div>
        </div>
      </fieldset>

      {countries.length > 1 && (
        <FilterGroup
          legend={t("country")}
          options={countries.map((c) => ({ value: c.code, label: c.name }))}
          selected={filters.country}
          onSelect={(v) => toggle("country", v)}
        />
      )}

      <FilterGroup
        legend={t("category")}
        options={categories}
        selected={filters.category}
        onSelect={(v) => toggle("category", v)}
      />

      <FilterGroup
        legend={t("transmission")}
        options={transmissions}
        selected={filters.transmission}
        onSelect={(v) => toggle("transmission", v)}
      />

      <FilterGroup
        legend={t("fuelType")}
        options={fuelTypes}
        selected={filters.fuelType}
        onSelect={(v) => toggle("fuelType", v)}
        last
      />

      <button
        onClick={apply}
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand py-2.5 font-semibold text-white transition-colors hover:bg-brand-dark disabled:opacity-60"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "…" : t("applyFilters")}
      </button>

      {hasActiveFilters && (
        <button
          onClick={clearAll}
          disabled={isPending}
          className="mt-2 w-full py-2 text-sm text-ink-soft underline hover:text-brand"
        >
          {t("clearAll")}
        </button>
      )}
      </div>
    </div>
  );
}

function FilterGroup({
  legend,
  options,
  selected,
  onSelect,
  last = false,
}: {
  legend: string;
  options: FilterOption[];
  selected: string;
  onSelect: (value: string) => void;
  last?: boolean;
}) {
  const te = useTranslations("enum");
  return (
    <fieldset className={last ? "mb-6" : "mb-6 border-b border-sand pb-6"}>
      <legend className="mb-3 font-semibold text-ink">{legend}</legend>
      <div className="space-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center text-sm text-ink-muted hover:text-brand"
          >
            <input
              type="checkbox"
              value={o.value}
              checked={selected === o.value}
              onChange={() => onSelect(o.value)}
              className="mr-2 accent-brand"
            />
            {o.label ?? te(o.labelKey as never)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// Default export so pages can `import CarsFilterSidebar from "@/components/..."`.
export default CarsFilterSidebar;
