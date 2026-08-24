/**
 * /admin/locations — pickup point moderation
 *
 * Owner locations are created unapproved by the listing wizard, so this queue
 * is the only thing that makes them selectable at booking time. Platform
 * locations (airport, convention centre) are listed for reference — they're
 * always available on every car.
 */

import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import AddPlatformLocation from "@/components/admin/AddPlatformLocation";
import { prisma } from "@/lib/db";
import { requireAdminModule } from "@/lib/auth";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/dates";
import {
  PageHeader,
  StatCard,
  Card,
  Badge,
  EmptyRow,
  SubNav,
} from "@/components/admin/ui";
import ModerationActions from "@/components/admin/ModerationActions";
import { MapPin, Building2, Check, Clock } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  return { title: `${t("pickupLocations")} — ZuriDrive Admin` };
}

export default async function AdminLocationsPage({
  params,
  searchParams,
}: {
  params: { locale: string };
  searchParams: { filter?: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "admin" });
  await requireAdminModule("CONTENT_MODERATOR");

  const filter = searchParams.filter ?? "PENDING";

  const [locations, pendingCount, approvedCount, platformLocations] =
    await Promise.all([
      prisma.ownerLocation.findMany({
        where:
          filter === "ALL" ? {} : { isApproved: filter === "APPROVED" },
        include: {
          neighborhood: { select: { name: true } },
          car: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              owner: { select: { user: { select: { name: true, phone: true } } } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 100,
      }),
      prisma.ownerLocation.count({ where: { isApproved: false } }),
      prisma.ownerLocation.count({ where: { isApproved: true } }),
      prisma.platformLocation.findMany({
        where: { isActive: true },
        orderBy: [{ order: "asc" }, { name: "asc" }],
      }),
    ]);

  return (
    <div>
      <PageHeader
        title={t("pickupLocations")}
        subtitle={t("locationsSub")}
      />

      <SubNav
        active={`/admin/locations?filter=${filter}`}
        items={[
          {
            label: t("awaitingReview"),
            href: "/admin/locations?filter=PENDING",
            count: pendingCount,
          },
          { label: t("approved"), href: "/admin/locations?filter=APPROVED" },
          { label: t("all"), href: "/admin/locations?filter=ALL" },
        ]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t("awaitingReview")}
          value={pendingCount}
          tone={pendingCount > 0 ? "warn" : "default"}
          hint={t("notSelectableHint")}
        />
        <StatCard label={t("approved")} value={approvedCount} tone="dark" />
        <StatCard
          label={t("zuriDriveLocations")}
          value={platformLocations.length}
          hint={t("availableEveryCar")}
        />
      </div>

      <div className="mb-4">
        <Card title={t("ownerPickupPoints")}>
          {locations.length === 0 ? (
            <EmptyRow>
              {filter === "PENDING"
                ? t("nothingWaitingReview")
                : t("noLocationsInView")}
            </EmptyRow>
          ) : (
            <ul className="divide-y divide-sand">
              {locations.map((l) => (
                <li key={l.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
                        <span className="text-sm font-semibold text-ink">
                          {l.name}
                        </span>
                        <Badge tone={l.isApproved ? "success" : "warn"}>
                          <span className="inline-flex items-center gap-1">
                            {l.isApproved ? (
                              <>
                                <Check className="h-2.5 w-2.5" />{" "}
                                {t("approvedBadge")}
                              </>
                            ) : (
                              <>
                                <Clock className="h-2.5 w-2.5" />{" "}
                                {t("inReviewBadge")}
                              </>
                            )}
                          </span>
                        </Badge>
                      </div>

                      {l.description && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {l.description}
                        </p>
                      )}

                      <p className="mt-0.5 text-[11px] text-ink-faint">
                        <Link
                          href={`/cars/${l.car.id}`}
                          className="hover:text-brand"
                        >
                          {l.car.year} {l.car.make} {l.car.model}
                        </Link>{" "}
                        · {l.car.owner.user.name ?? t("ownerFallback")} ·{" "}
                        {l.neighborhood?.name ?? t("noNeighbourhood")}
                        {l.deliveryFee
                          ? ` · ${t("deliveryFeeSuffix", { amount: formatMoney(l.deliveryFee) })}`
                          : ""}{" "}
                        ·{" "}
                        {t("addedOn", {
                          date: formatDate(l.createdAt, params.locale),
                        })}
                      </p>
                    </div>

                    <div className="w-full lg:w-auto">
                      <ModerationActions
                        endpoint={`/api/admin/locations/${l.id}`}
                        actions={
                          l.isApproved
                            ? [
                                {
                                  id: "reject",
                                  label: t("withdraw"),
                                  tone: "danger" as const,
                                  needsReason: true,
                                  reasonPlaceholder: t("withdrawReason"),
                                  warning: t("withdrawWarning"),
                                },
                              ]
                            : [
                                {
                                  id: "approve",
                                  label: t("approve"),
                                  tone: "primary" as const,
                                },
                                {
                                  id: "reject",
                                  label: t("reject"),
                                  tone: "danger" as const,
                                  needsReason: true,
                                  reasonPlaceholder: t("rejectLocationReason"),
                                  warning: t("rejectLocationWarning"),
                                },
                              ]
                        }
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title={t("zuriDriveLocations")}>
        <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-soft">
          <Building2 className="h-3.5 w-3.5" />
          {t("availableEveryListing")}
        </p>

        <div className="mb-3">
          <AddPlatformLocation />
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {platformLocations.map((p) => (
            <li
              key={p.id}
              className="rounded-full bg-sand px-2.5 py-1 text-xs text-ink-muted"
            >
              {p.name}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
