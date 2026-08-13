/**
 * /owner/locations — pickup points across the fleet
 *
 * Three tiers exist on the platform:
 *   1 Platform locations — admin-managed, always available on every car
 *   2 Owner locations    — per-car, need Content Moderator approval
 *   3 Custom text        — typed by the client at booking time
 *
 * This page covers tier 2, and shows tier 1 for context so owners understand
 * what clients can already choose without them doing anything.
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";
import { formatRWF } from "@/lib/currency";
import { routes } from "@/lib/routes";
import { MapPin, Check, Clock, Building2, Truck } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("pickupLocations")} — ZuriDrive` };
}

export default async function OwnerLocationsPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const { profile } = await requireOwnerProfile();

  const [cars, platformLocations] = await Promise.all([
    prisma.car.findMany({
      where: { ownerId: profile.id },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        deliverAnywhere: true,
        deliveryFee: true,
        locations: {
          include: { neighborhood: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.platformLocation.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
    }),
  ]);

  const pendingCount = cars.reduce(
    (n, c) => n + c.locations.filter((l) => !l.isApproved).length,
    0,
  );

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">{t("pickupLocations")}</h1>
        <p className="text-sm text-ink-soft">{t("locationsSub")}</p>
      </div>

      {pendingCount > 0 && (
        <div className="rounded-2xl bg-warning-bg p-3">
          <p className="text-xs text-warning">
            {t("locationsPending", { count: pendingCount })}
          </p>
        </div>
      )}

      {/* Tier 1 — platform locations */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">
            {t("zuriDriveLocations")}
          </h2>
        </div>
        <p className="mb-3 text-xs text-ink-soft">
          {t("platformLocationsHint")}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {platformLocations.map((l) => (
            <li
              key={l.id}
              className="rounded-full bg-sand px-2.5 py-1 text-xs text-ink-muted"
            >
              {l.name}
            </li>
          ))}
        </ul>
      </section>

      {/* Tier 2 — per-car owner locations */}
      {cars.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sand">
            <MapPin className="h-5 w-5 text-ink-faint" />
          </div>
          <h2 className="text-base font-semibold text-ink">
            {t("noCarsTitle")}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">{t("locationsPerCar")}</p>
          <Link
            href={routes.ownerFleetNew}
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            {t("listACar")}
          </Link>
        </div>
      ) : (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">
            {t("yourPickupPoints")}
          </h2>

          {cars.map((car) => (
            <div key={car.id} className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-ink">
                  {car.year} {car.make} {car.model}
                </p>
                <Link
                  href={routes.ownerFleetEdit(car.id)}
                  className="shrink-0 text-xs font-semibold text-brand hover:underline"
                >
                  {t("edit")}
                </Link>
              </div>

              {car.deliverAnywhere && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                  <Truck className="h-3 w-3" />
                  {t("deliversAnywhere")}
                  {car.deliveryFee ? ` · ${formatRWF(car.deliveryFee)}` : ""}
                </p>
              )}

              {car.locations.length === 0 ? (
                <p className="mt-2 text-xs text-ink-faint">
                  {t("noCustomPickup")}
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {car.locations.map((l) => (
                    <li
                      key={l.id}
                      className="flex items-start gap-2 rounded-lg bg-bone px-2.5 py-2"
                    >
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-ink-soft" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-ink">{l.name}</p>
                        {l.neighborhood && (
                          <p className="text-[11px] text-ink-soft">
                            {l.neighborhood.name}
                            {l.deliveryFee
                              ? ` · ${t("deliveryFeeSuffix", { amount: formatRWF(l.deliveryFee) })}`
                              : ""}
                          </p>
                        )}
                      </div>
                      <span
                        className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          l.isApproved
                            ? "bg-success-bg text-success"
                            : "bg-warning-tint text-warning-dark"
                        }`}
                      >
                        {l.isApproved ? (
                          <>
                            <Check className="h-2.5 w-2.5" /> {t("approved")}
                          </>
                        ) : (
                          <>
                            <Clock className="h-2.5 w-2.5" /> {t("inReview")}
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
