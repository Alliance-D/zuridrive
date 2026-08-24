/**
 * /owner/fleet/[id]/edit — edit a listing
 *
 * Ownership is checked here as well as in the PATCH endpoint: the page must
 * not render another owner's car even read-only.
 */

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getEnumLabeller } from "@/lib/enum-labels";
import LocationManager from "@/components/owner/LocationManager";
import PricingEditor from "@/components/owner/PricingEditor";
import PhotoManager from "@/components/owner/PhotoManager";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { requireOwnerProfile } from "@/lib/owner";

import { routes } from "@/lib/routes";
import CarEditForm from "@/components/owner/CarEditForm";
import { ChevronLeft, AlertTriangle } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  return { title: `${t("editCar")} — ZuriDrive` };
}

export default async function EditCarPage({
  params,
}: {
  params: { id: string; locale: string };
}) {
  const t = await getTranslations({ locale: params.locale, namespace: "owner" });
  const label = await getEnumLabeller(params.locale);
  const { profile } = await requireOwnerProfile();

  const car = await prisma.car.findUnique({
    where: { id: params.id },
    include: {
      photos: { orderBy: { order: "asc" } },
      locations: { orderBy: { createdAt: "asc" } },
      pricing: true,
      fuelPolicy: true,
    },
  });

  // Not found, or not this owner's car — same response either way, so the
  // endpoint can't be used to probe which car ids exist.
  if (!car || car.ownerId !== profile.id) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href={routes.ownerFleet}
          className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink"
        >
          <ChevronLeft className="h-3 w-3" />
          {t("backToFleet")}
        </Link>
        <h1 className="text-xl font-bold text-ink">
          {car.year} {car.make} {car.model}
        </h1>
        <p className="text-sm text-ink-soft">
          {car.licensePlate} · {label("carStatus", car.status)}
        </p>
      </div>

      {car.status === "SUSPENDED" && car.rejectionReason && (
        <div className="flex items-start gap-2 rounded-2xl bg-danger-bg p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div>
            <p className="text-sm font-semibold text-danger">
              {t("listingSuspended")}
            </p>
            <p className="mt-0.5 text-xs text-danger">
              {car.rejectionReason}
            </p>
          </div>
        </div>
      )}

      <CarEditForm
        carId={car.id}
        initial={{
          make: car.make,
          model: car.model,
          year: String(car.year),
          color: car.color,
          licensePlate: car.licensePlate,
          category: car.category,
          fuelType: car.fuelType,
          transmission: car.transmission,
          seatingCapacity: String(car.seatingCapacity),
          minBookingDays: String(car.minBookingDays ?? 1),
          deliverAnywhere: car.deliverAnywhere,
          deliveryFee: car.deliveryFee ? String(car.deliveryFee) : "",
          isActive: car.isActive,
        }}
      />

      <PricingEditor
        carId={car.id}
        initial={
          car.pricing
            ? {
                perDayInCity: car.pricing.perDayInCity,
                perDayOutsideCity: car.pricing.perDayOutsideCity,
                perWeekInCity: car.pricing.perWeekInCity,
                perWeekOutsideCity: car.pricing.perWeekOutsideCity,
                perMonth: car.pricing.perMonth,
                driverEnabled: car.pricing.driverEnabled,
                driverSurchargePerDay: car.pricing.driverSurchargePerDay ?? 0,
                depositEnabled: car.pricing.depositEnabled,
                depositAmount: car.pricing.depositAmount,
              }
            : null
        }
      />

      <PhotoManager
        carId={car.id}
        initial={car.photos.map((p) => ({ id: p.id, url: p.url, order: p.order }))}
      />

      <LocationManager
        carId={car.id}
        initial={car.locations.map((l) => ({
          id: l.id,
          name: l.name,
          description: l.description,
          isApproved: l.isApproved,
        }))}
      />

    </div>
  );
}
