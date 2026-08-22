/**
 * /admin/fleet/[id] — one listing, in full.
 *
 * The fleet list exists to approve and moderate in bulk. This is the page for
 * the case where that is not enough: a listing that has been reported, an
 * owner disputing a rejection, a car that keeps turning up in complaints.
 *
 * It shows what the listing claims, what it has actually done, and what admins
 * have already done to it — so a decision can be made from the record rather
 * than from whoever remembers the last conversation.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireAdminModule, hasAdminModule } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatMoney } from "@/lib/currency";
import { formatPhone } from "@/lib/phone";
import { PageHeader, Card, Badge } from "@/components/admin/ui";
import { getAdminActionLog } from "@/lib/admin-logger";
import ModerationActions from "@/components/admin/ModerationActions";
import type { CarStatus } from "@prisma/client";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("listingDetail")} — ZuriDrive Admin` };
}

const STATUS_TONE: Record<CarStatus, "neutral" | "info" | "warn" | "success" | "danger"> = {
  DRAFT: "neutral",
  PENDING_APPROVAL: "warn",
  LIVE: "success",
  SUSPENDED: "danger",
};

export default async function AdminFleetDetailPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  await requireAdminModule("FLEET_MANAGER");
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });

  const canSeeFinance = await hasAdminModule("FINANCE_MANAGER");

  const car = await prisma.car.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      color: true,
      licensePlate: true,
      category: true,
      fuelType: true,
      transmission: true,
      seatingCapacity: true,
      status: true,
      isActive: true,
      isFeatured: true,
      publishedAt: true,
      createdAt: true,
      countryCode: true,
      country: { select: { name: true, currency: true } },
      photos: { select: { id: true, url: true }, orderBy: { order: "asc" }, take: 10 },
      pricing: true,
      fuelPolicy: true,
      owner: {
        select: {
          id: true,
          hasVerifiedBadge: true,
          user: { select: { id: true, name: true, phone: true } },
        },
      },
      bookings: {
        select: {
          id: true,
          reference: true,
          status: true,
          startDate: true,
          currency: true,
          subtotal: true,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      reviews: { select: { id: true, overallRating: true } },
    },
  });

  if (!car) notFound();

  const actions = await getAdminActionLog("Car", car.id);

  const averageRating =
    car.reviews.length > 0
      ? (
          car.reviews.reduce((sum: number, r: { overallRating: number }) => sum + r.overallRating, 0) /
          car.reviews.length
        ).toFixed(1)
      : null;

  // Prices belong to the car's market, not the admin's. A Ugandan listing
  // reads UGX on a Rwandan screen.
  const money = (amount: number | null | undefined) =>
    amount == null ? "—" : formatMoney(amount, car.country.currency);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/fleet"
        className="inline-flex items-center gap-1 text-xs text-ink-soft no-underline hover:text-brand"
      >
        <ChevronLeft size={14} />
        {t("backToFleet")}
      </Link>

      <PageHeader
        title={`${car.make} ${car.model} (${car.year})`}
        subtitle={car.licensePlate}
        action={
          <ModerationActions
            endpoint={`/api/admin/fleet/${car.id}`}
            actions={[
              car.status === "PENDING_APPROVAL"
                ? { id: "approve", label: t("approve"), tone: "primary" as const }
                : car.status === "SUSPENDED"
                  ? { id: "unsuspend", label: t("reinstate"), tone: "primary" as const }
                  : {
                      id: "suspend",
                      label: t("suspend"),
                      tone: "warn" as const,
                      needsReason: true,
                      reasonPlaceholder: t("suspendReason"),
                    },
              car.isFeatured
                ? { id: "unfeature", label: t("unfeature") }
                : { id: "feature", label: t("feature") },
            ]}
          />
        }
      />

      {car.photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {car.photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={p.url}
              alt=""
              className="h-24 w-32 shrink-0 rounded-lg object-cover"
            />
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card title={t("listing")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("colStatus")}>
              <Badge tone={STATUS_TONE[car.status]}>{car.status}</Badge>
            </Row>
            <Row label={t("colCountry")}>{car.country.name}</Row>
            <Row label={t("colCategory")}>{car.category}</Row>
            <Row label={t("colTransmission")}>{car.transmission}</Row>
            <Row label={t("colFuelType")}>{car.fuelType}</Row>
            <Row label={t("colSeats")}>{car.seatingCapacity}</Row>
            <Row label={t("colColour")}>{car.color}</Row>
            <Row label={t("featured")}>{car.isFeatured ? t("yes") : t("no")}</Row>
            <Row label={t("listed")}>
              {car.publishedAt ? formatDate(car.publishedAt, params.locale) : "—"}
            </Row>
            <Row label={t("created")}>{formatDate(car.createdAt, params.locale)}</Row>
          </dl>
        </Card>

        <Card title={t("owner")}>
          <dl className="space-y-1.5 text-xs">
            <Row label={t("colName")}>
              <Link
                href={`/admin/users/${car.owner.user.id}`}
                className="text-ink no-underline hover:text-brand"
              >
                {car.owner.user.name ?? "—"}
              </Link>
            </Row>
            <Row label={t("colPhone")}>
              {formatPhone(car.owner.user.phone, car.countryCode)}
            </Row>
            <Row label={t("verifiedBadge")}>
              {car.owner.hasVerifiedBadge ? t("yes") : t("no")}
            </Row>
            <Row label={t("rating")}>
              {averageRating ? `${averageRating} (${car.reviews.length})` : "—"}
            </Row>
          </dl>
        </Card>
      </div>

      {car.pricing && (
        <Card title={t("pricing")}>
          <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
            <Row label={t("perDayInCity")}>{money(car.pricing.perDayInCity)}</Row>
            <Row label={t("perDayOutside")}>{money(car.pricing.perDayOutsideCity)}</Row>
            <Row label={t("perWeekInCity")}>{money(car.pricing.perWeekInCity)}</Row>
            <Row label={t("perWeekOutside")}>{money(car.pricing.perWeekOutsideCity)}</Row>
            <Row label={t("perMonth")}>{money(car.pricing.perMonth)}</Row>
            <Row label={t("deposit")}>
              {car.pricing.depositEnabled ? money(car.pricing.depositAmount) : t("no")}
            </Row>
            <Row label={t("driver")}>
              {car.pricing.driverEnabled
                ? money(car.pricing.driverSurchargePerDay)
                : t("no")}
            </Row>
            {car.fuelPolicy && (
              <Row label={t("fuelPolicy")}>{car.fuelPolicy.type}</Row>
            )}
          </dl>
        </Card>
      )}

      {car.bookings.length > 0 && (
        <Card title={t("recentBookings")}>
          <ul className="divide-y divide-sand text-xs">
            {car.bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link
                    href={`/admin/bookings/${b.id}`}
                    className="text-ink no-underline hover:text-brand"
                  >
                    {b.reference}
                  </Link>
                  <span className="ml-2 text-ink-faint">
                    {formatDate(b.startDate, params.locale)}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <Badge tone={b.status === "COMPLETED" ? "success" : "neutral"}>
                    {b.status}
                  </Badge>
                  {canSeeFinance && (
                    <span className="mt-1 block text-ink-faint">
                      {formatMoney(b.subtotal, b.currency)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {actions.length > 0 && (
        <Card title={t("adminHistory")}>
          <ul className="divide-y divide-sand text-xs">
            {actions.map((a) => (
              <li key={a.id} className="py-2">
                <span className="text-ink">{a.actionType}</span>
                <span className="ml-2 text-ink-faint">
                  {a.actor?.name ?? t("unknownAdmin")} ·{" "}
                  {formatDateTime(a.createdAt, params.locale)}
                </span>
                {a.reason && <span className="block text-ink-faint">{a.reason}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-ink-faint">{label}</dt>
      <dd className="text-right text-ink">{children}</dd>
    </div>
  );
}
