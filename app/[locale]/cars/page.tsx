// =============================================================================
// ZuriDrive — Car Listings Page (/cars)
// Server component — filters applied server-side via searchParams
// Shows: filter sidebar, results grid, active filter chips
// =============================================================================

import { Suspense } from "react";
import { getEnumLabeller } from "@/lib/enum-labels";
import { getTranslations } from "next-intl/server";
import { formatEnumLabel } from "@/lib/labels";
import Navbar from "@/components/navbar";
import Footer from "@/components/footer";
import CarCardGrid from "@/components/car-card-grid";
import CarsFilterSidebar from "@/components/cars-filter-sidebar";
import { prisma } from "@/lib/prisma";
import type { Metadata } from "next";
import type { CarCategory, TransmissionType } from "@prisma/client";
import { SlidersHorizontal } from "lucide-react";

export const metadata: Metadata = {
  title: "Browse Cars",
  description: "Browse verified rental cars across Rwanda. Filter by price, type, location and more.",
};

// Parse and validate filter values from URL searchParams
interface FilterParams {
  location?: string;
  type?: string;        // day | week | month
  from?: string;
  to?: string;
  category?: CarCategory;
  transmission?: TransmissionType;
  fuelType?: string;
  minPrice?: number;
  maxPrice?: number;
  driver?: boolean;
  page?: number;
}

function parseFilters(params: Record<string, string | string[] | undefined>): FilterParams {
  return {
    location: typeof params.location === "string" ? params.location : undefined,
    type: typeof params.type === "string" ? params.type : undefined,
    from: typeof params.from === "string" ? params.from : undefined,
    to: typeof params.to === "string" ? params.to : undefined,
    category: typeof params.category === "string" ? params.category as CarCategory : undefined,
    transmission: typeof params.transmission === "string" ? params.transmission as TransmissionType : undefined,
    fuelType: typeof params.fuelType === "string" ? params.fuelType : undefined,
    minPrice: typeof params.minPrice === "string" ? parseInt(params.minPrice) : undefined,
    maxPrice: typeof params.maxPrice === "string" ? parseInt(params.maxPrice) : undefined,
    driver: params.driver === "true",
    page: typeof params.page === "string" ? Math.max(1, parseInt(params.page)) : 1,
  };
}

const PAGE_SIZE = 12;

async function getCars(filters: FilterParams) {
  try {
    const where: Record<string, unknown> = {
      status: "LIVE",
      isActive: true,
    };

    // Category filter
    if (filters.category) where.category = filters.category;

    // Transmission filter
    if (filters.transmission) where.transmission = filters.transmission;

    // Fuel type. The sidebar has always offered this control; the page simply
    // never read it, so choosing a fuel type changed nothing.
    if (filters.fuelType) where.fuelType = filters.fuelType;

    // Driver filter — only show cars with driver option enabled
    if (filters.driver) {
      where.pricing = { driverEnabled: true };
    }

    // Price filter — on per-day in-city rate
    if (filters.minPrice || filters.maxPrice) {
      where.pricing = {
        ...(where.pricing as object ?? {}),
        perDayInCity: {
          ...(filters.minPrice ? { gte: filters.minPrice } : {}),
          ...(filters.maxPrice ? { lte: filters.maxPrice } : {}),
        },
      };
    }

    const page = filters.page ?? 1;
    const skip = (page - 1) * PAGE_SIZE;

    const [cars, total] = await Promise.all([
      prisma.car.findMany({
        where,
        include: {
          photos: { orderBy: { order: "asc" }, take: 1 },
          pricing: true,
          owner: { include: { user: { select: { name: true } } } },
          reviews: { select: { overallRating: true } },
          _count: { select: { bookings: true } },
        },
        orderBy: [
          { isFeatured: "desc" },
          { publishedAt: "desc" },
        ],
        take: PAGE_SIZE,
        skip,
      }),
      prisma.car.count({ where }),
    ]);

    return { cars, total, totalPages: Math.ceil(total / PAGE_SIZE) };
  } catch {
    return { cars: [], total: 0, totalPages: 0 };
  }
}

interface CarsPageProps {
  params: { locale: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function CarsPage({ params, searchParams }: CarsPageProps) {
  const t = await getTranslations({ locale: params.locale, namespace: "cars" });
  const filters = parseFilters(searchParams);
  const { cars, total, totalPages } = await getCars(filters);
  const currentPage = filters.page ?? 1;

  return (
    <div className="min-h-screen bg-bone">
      <Navbar />

      {/* Page header */}
      <div className="border-b border-sand-light bg-sand pb-[clamp(1.5rem,3vw,2.5rem)] pt-[calc(var(--nav-height)_+_clamp(2rem,4vw,3rem))]">
        <div className="container">
          <h1 className="mb-2 font-display text-fluid-3xl font-normal tracking-[-0.03em] text-ink">
            {/* Same naive capitalise that rendered SUV as "Suv" on the detail
                page — formatEnumLabel keeps acronyms intact. */}
            {filters.category
              ? t("categoryTitle", { category: (await getEnumLabeller(params.locale))("category", filters.category) })
              : t("title")}
          </h1>
          <p className="text-fluid-sm text-ink-soft">
            {t("found", { count: total })}{" "}
            {filters.location
              ? t("near", { location: filters.location })
              : t("acrossRwanda")}
          </p>
        </div>
      </div>

      {/* Main layout — sidebar + grid */}
      {/* cars-layout drops this to a single column under 900px. The class is
          required: the columns are set inline, and an inline style beats a
          stylesheet rule unless that rule is !important — which is why the
          media query in globals.css carries it. Without the class the sidebar
          kept its 280px track on a phone and pushed the results off-screen. */}
      <div className="container cars-layout grid grid-cols-[280px_1fr] items-start gap-[clamp(1.5rem,3vw,2.5rem)] pb-[clamp(3rem,6vw,5rem)] pt-[clamp(2rem,4vw,3rem)]">
        {/* Filter sidebar — sticky on desktop, static once stacked */}
        <aside className="cars-sidebar sticky top-[calc(var(--nav-height)_+_1rem)]">
          <Suspense fallback={<FilterSidebarSkeleton />}>
            <CarsFilterSidebar activeFilters={filters} totalResults={total} />
          </Suspense>
        </aside>

        {/* Results */}
        <div>
          {/* Active filter chips */}
          <ActiveFilterChips filters={filters} />

          <Suspense fallback={<CarCardGrid cars={[]} locale={params.locale} showSkeleton columns={3} />}>
            <CarCardGrid cars={cars} locale={params.locale} columns={3} />
          </Suspense>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              filters={filters}
            />
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

// --------------------------------------------------------------------------
// ACTIVE FILTER CHIPS
// Shows applied filters as dismissible chips
// --------------------------------------------------------------------------

function ActiveFilterChips({ filters }: { filters: FilterParams }) {
  const chips: { label: string; removeParam: string }[] = [];

  if (filters.category) chips.push({ label: filters.category, removeParam: "category" });
  if (filters.transmission) chips.push({ label: filters.transmission, removeParam: "transmission" });
  if (filters.driver) chips.push({ label: "Driver included", removeParam: "driver" });
  if (filters.minPrice) chips.push({ label: `From RWF ${filters.minPrice.toLocaleString()}`, removeParam: "minPrice" });
  if (filters.maxPrice) chips.push({ label: `Up to RWF ${filters.maxPrice.toLocaleString()}`, removeParam: "maxPrice" });

  if (chips.length === 0) return null;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1 text-fluid-sm text-ink-soft">
        <SlidersHorizontal size={13} /> Filters:
      </span>
      {chips.map((chip) => (
        <span
          key={chip.label}
          className="badge badge-green cursor-pointer"
        >
          {chip.label} ×
        </span>
      ))}
    </div>
  );
}

// --------------------------------------------------------------------------
// PAGINATION
// --------------------------------------------------------------------------

function Pagination({
  currentPage,
  totalPages,
  filters,
}: {
  currentPage: number;
  totalPages: number;
  filters: FilterParams;
}) {
  const buildPageUrl = (page: number) => {
    const params = new URLSearchParams();
    if (filters.location) params.set("location", filters.location);
    if (filters.type) params.set("type", filters.type);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.category) params.set("category", filters.category);
    if (filters.transmission) params.set("transmission", filters.transmission);
    if (filters.driver) params.set("driver", "true");
    params.set("page", page.toString());
    return `/cars?${params.toString()}`;
  };

  return (
    <div className="mt-[clamp(2rem,4vw,3rem)] flex justify-center gap-2">
      {/* Prev */}
      {currentPage > 1 && (
        <a href={buildPageUrl(currentPage - 1)} className="btn btn-secondary btn-sm">
          ← Prev
        </a>
      )}

      {/* Page numbers */}
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
        return (
          <a
            key={page}
            href={buildPageUrl(page)}
            className={`btn btn-sm border-[1.5px] ${
              page === currentPage
                ? "border-brand bg-brand text-white"
                : "border-sand-edge bg-sand text-ink"
            }`}
          >
            {page}
          </a>
        );
      })}

      {/* Next */}
      {currentPage < totalPages && (
        <a href={buildPageUrl(currentPage + 1)} className="btn btn-secondary btn-sm">
          Next →
        </a>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// SKELETONS
// --------------------------------------------------------------------------

function FilterSidebarSkeleton() {
  return (
    <div className="rounded-3xl border border-sand-light bg-white p-5">
      {[140, 100, 120, 100, 140].map((w, i) => (
        <div key={i} className="skeleton mb-4 h-4" style={{ width: w }} />
      ))}
    </div>
  );
}
