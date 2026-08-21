/**
 * /admin/fleet — car moderation
 *
 * Cars awaiting approval sort first: an owner can't earn until someone reviews
 * their listing, so that queue is the one with a person waiting on it.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getEnumLabeller } from "@/lib/enum-labels";
import { requireAdminModule } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
} from "@/components/admin/ui";
import ModerationActions from "@/components/admin/ModerationActions";
import type { CarStatus, Prisma } from "@prisma/client";
import { Car, Star, Search } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("fleet")} — ZuriDrive Admin` };
}

const TONE: Record<CarStatus, "success" | "warn" | "neutral" | "danger"> = {
  LIVE: "success",
  PENDING_APPROVAL: "warn",
  DRAFT: "neutral",
  SUSPENDED: "danger",
};

export default async function AdminFleetPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { status?: string; q?: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  const label = await getEnumLabeller(params.locale);
  await requireAdminModule("FLEET_MANAGER");

  const status = searchParams.status ?? "PENDING_APPROVAL";
  const q = searchParams.q?.trim() ?? "";

  const where: Prisma.CarWhereInput = {
    ...(status !== "ALL" ? { status: status as CarStatus } : {}),
    ...(q
      ? {
          OR: [
            { make: { contains: q, mode: "insensitive" } },
            { model: { contains: q, mode: "insensitive" } },
            { licensePlate: { contains: q, mode: "insensitive" } },
            {
              owner: {
                user: { name: { contains: q, mode: "insensitive" } },
              },
            },
          ],
        }
      : {}),
  };

  const [cars, counts] = await Promise.all([
    prisma.car.findMany({
      where,
      include: {
        photos: { orderBy: { order: "asc" }, take: 1 },
        pricing: true,
        owner: { select: { user: { select: { id: true, name: true, phone: true } } } },
        _count: { select: { bookings: true, reviews: true } },
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
    }),
    prisma.car.groupBy({ by: ["status"], _count: true }),
  ]);

  const countFor = (s: CarStatus) =>
    counts.find((c) => c.status === s)?._count ?? 0;

  return (
    <div>
      <PageHeader
        title={t("fleet")}
        subtitle={t("fleetSub")}
      />

      <SubNav
        active={`/admin/fleet?status=${status}`}
        items={[
          {
            label: t("awaitingReview"),
            href: "/admin/fleet?status=PENDING_APPROVAL",
            count: countFor("PENDING_APPROVAL"),
          },
          { label: t("live"), href: "/admin/fleet?status=LIVE" },
          { label: t("draft"), href: "/admin/fleet?status=DRAFT" },
          { label: t("suspended"), href: "/admin/fleet?status=SUSPENDED" },
          { label: t("all"), href: "/admin/fleet?status=ALL" },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t("awaitingReview")}
          value={countFor("PENDING_APPROVAL")}
          tone={countFor("PENDING_APPROVAL") > 0 ? "warn" : "default"}
        />
        <StatCard label={t("live")} value={countFor("LIVE")} tone="dark" />
        <StatCard label={t("suspended")} value={countFor("SUSPENDED")} />
        <StatCard label={t("draft")} value={countFor("DRAFT")} />
      </div>

      {/* Search */}
      <form className="mb-4" action="/admin/fleet">
        <input type="hidden" name="status" value={status} />
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t("searchCars")}
            className="w-full rounded-lg border border-sand-dark bg-white py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </form>

      <Card title={t("carsCount", { count: cars.length })}>
        {cars.length === 0 ? (
          <EmptyRow>
            {q
              ? t("nothingMatches", { q })
              : status === "PENDING_APPROVAL"
                ? t("noListingsWaiting")
                : t("noCarsInState")}
          </EmptyRow>
        ) : (
          <ul className="divide-y divide-sand">
            {cars.map((car) => (
              <li key={car.id} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {car.photos[0] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={car.photos[0].url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Car className="h-4 w-4 text-ink-faint" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/cars/${car.id}`}
                        className="text-sm font-semibold text-ink hover:text-brand"
                      >
                        {car.year} {car.make} {car.model}
                      </Link>
                      <Badge tone={TONE[car.status]}>
                        {label("carStatus", car.status)}
                      </Badge>
                      {car.isFeatured && (
                        <span className="flex items-center gap-0.5 rounded-full bg-warning-tint px-2 py-0.5 text-[10px] font-semibold text-warning-dark">
                          <Star className="h-2.5 w-2.5 fill-current" />
                          {t("featured")}
                        </span>
                      )}
                    </div>

                    <p className="mt-0.5 text-xs text-ink-soft">
                      {car.licensePlate} · {label("category", car.category)} ·{" "}
                      {t("seatCount", { count: car.seatingCapacity })} ·{" "}
                      {car.pricing
                        ? t("perDay", {
                            amount: formatMoney(car.pricing.perDayInCity),
                          })
                        : t("noPricing")}
                    </p>
                    <p className="text-[11px] text-ink-faint">
                      {car.owner.user.name ?? t("ownerFallback")} ·{" "}
                      {car.owner.user.phone} ·{" "}
                      {t("bookingCount", { count: car._count.bookings })} ·{" "}
                      {t("reviewCount", { count: car._count.reviews })}
                    </p>

                    {car.rejectionReason && (
                      <p className="mt-1.5 rounded-lg bg-danger-bg px-2.5 py-1.5 text-[11px] text-danger">
                        {car.rejectionReason}
                      </p>
                    )}

                    {!car.pricing && car.status === "PENDING_APPROVAL" && (
                      <p className="mt-1.5 rounded-lg bg-warning-tint px-2.5 py-1.5 text-[11px] text-warning-dark">
                        {t("noPricingWarning")}
                      </p>
                    )}
                  </div>

                  <div className="w-full lg:w-auto">
                    <ModerationActions
                      endpoint={`/api/admin/cars/${car.id}`}
                      actions={actionsFor(car.status, car.isFeatured, t)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// The translator is passed in: this is a module-level function, so it has no
// hook context and no request locale of its own.
function actionsFor(
  status: CarStatus,
  isFeatured: boolean,
  t: (key: string) => string,
) {
  if (status === "PENDING_APPROVAL") {
    return [
      { id: "approve", label: t("approve"), tone: "primary" as const },
      {
        id: "reject",
        label: t("reject"),
        tone: "danger" as const,
        needsReason: true,
        reasonPlaceholder: t("rejectReason"),
      },
    ];
  }

  if (status === "LIVE") {
    return [
      isFeatured
        ? { id: "unfeature", label: t("unfeature") }
        : { id: "feature", label: t("feature") },
      {
        id: "suspend",
        label: t("suspend"),
        tone: "danger" as const,
        needsReason: true,
        reasonPlaceholder: t("suspendCarReason"),
        warning: t("suspendCarWarning"),
      },
    ];
  }

  if (status === "SUSPENDED") {
    return [
      { id: "reinstate", label: t("reinstate"), tone: "primary" as const },
    ];
  }

  // DRAFT — the owner is still editing; nothing to moderate.
  return [];
}
