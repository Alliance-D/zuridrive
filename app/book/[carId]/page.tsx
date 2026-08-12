/**
 * app/book/[carId]/page.tsx
 *
 * Server component: loads car + pricing + locations data.
 * Renders the BookingWizard client component with all data pre-loaded.
 */

import { notFound, redirect } from 'next/navigation'
import { ownerDisplayName } from '@/lib/owner-identity'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { BookingWizard } from '@/components/booking/BookingWizard'
import type { Metadata } from 'next'

interface Props {
  params: { carId: string }
  searchParams: {
    startDate?: string
    endDate?: string
    rentalType?: string
    tripScope?: string
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const car = await db.car.findUnique({
    where: { id: params.carId },
    select: { make: true, model: true, year: true },
  })
  if (!car) return { title: 'Car Not Found — ZuriDrive' }
  return { title: `Book ${car.year} ${car.make} ${car.model} — ZuriDrive` }
}

export default async function BookCarPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions)

  // Load car with all data needed for booking
  const car = await db.car.findUnique({
    where: { id: params.carId, status: 'LIVE' },
    include: {
      photos: { orderBy: { order: 'asc' }, take: 1 },
      pricing: true,
      fuelPolicy: true,
      owner: {
        include: {
          user: {
            select: { name: true, phone: true, createdAt: true },
          },
        },
      },
      // Owner's custom pickup locations (approved only).
      // Platform locations are global, not per-car — loaded separately below.
      locations: {
        where: { isApproved: true },
        include: { neighborhood: true },
      },
    },
  })

  if (!car) notFound()

  // Load platform locations (Tier 1 — admin managed)
  const platformLocations = await db.platformLocation.findMany({
    where: { isActive: true },
    orderBy: [{ order: 'asc' }, { name: 'asc' }],
  })

  // Client profile (pre-fill if logged in)
  let clientProfile = null
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        phone: true,
        email: true,
      },
    })

    // Identity documents are no longer stored - see the identity-check note
    // on the Booking model. The wizard collects an attestation instead.
    if (user) {
      clientProfile = user
    }
  }

  // Serialize for client component (dates must be strings)
  const carData = {
    id: car.id,
    make: car.make,
    model: car.model,
    year: car.year,
    coverPhotoUrl: car.photos[0]?.url ?? null,
    minBookingDays: car.minBookingDays,
    pricing: car.pricing
      ? {
          perDayInCity: car.pricing.perDayInCity,
          perDayOutsideCity: car.pricing.perDayOutsideCity,
          perWeekInCity: car.pricing.perWeekInCity,
          perWeekOutsideCity: car.pricing.perWeekOutsideCity,
          perMonth: car.pricing.perMonth,
          driverEnabled: car.pricing.driverEnabled,
          driverSurchargePerDay: car.pricing.driverSurchargePerDay ?? 0,
          depositEnabled: car.pricing.depositEnabled,
          depositAmount: car.pricing.depositAmount ?? 0,
        }
      : null,
    fuelPolicy: car.fuelPolicy
      ? {
          type: car.fuelPolicy.type,
          refuelFee: car.fuelPolicy.refuelingFee,
          description: null,
        }
      : null,
    ownerName: ownerDisplayName(car.owner, 'Owner'),
    ownerSince: car.owner.user.createdAt.toISOString(),
    // "Deliver anywhere" is a car-level setting, not per pickup location.
    deliverAnywhere: car.deliverAnywhere,
    deliveryFee: car.deliveryFee ?? 0,
  }

  const locationsData = {
    platformLocations: platformLocations.map((l) => ({
      id: `platform_${l.id}`,
      name: l.name,
      description: l.description,
      icon: null,
    })),
    ownerLocations: car.locations.map((l) => ({
      id: `owner_${l.id}`,
      name: l.name,
      description: l.description,
      neighborhood: l.neighborhood?.name ?? null,
      deliveryFee: l.deliveryFee ?? 0,
    })),
  }

  return (
    <BookingWizard
      car={carData}
      locations={locationsData}
      clientProfile={clientProfile}
      isLoggedIn={!!session}
      prefill={{
        startDate: searchParams.startDate,
        endDate: searchParams.endDate,
        rentalType: searchParams.rentalType as 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH' | undefined,
        tripScope: searchParams.tripScope as 'IN_CITY' | 'OUTSIDE_CITY' | undefined,
      }}
    />
  )
}
