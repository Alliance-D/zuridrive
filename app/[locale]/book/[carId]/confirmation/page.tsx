/**
 * app/book/[carId]/confirmation/page.tsx
 *
 * Server component: loads booking details by ID.
 * Renders animated confirmation screen.
 * For guest users: shows account creation message.
 */

import { notFound } from 'next/navigation'
import { ownerDisplayName } from '@/lib/owner-identity'
import { db } from '@/lib/db'
import { ConfirmationScreen } from '@/components/booking/ConfirmationScreen'

interface Props {
  params: { carId: string }
  searchParams: { bookingId?: string; method?: string }
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  if (!searchParams.bookingId) notFound()

  const booking = await db.booking.findUnique({
    where: { id: searchParams.bookingId },
    include: {
      car: {
        include: {
          photos: { take: 1, orderBy: { order: 'asc' } },
          owner: { include: { user: { select: { name: true, phone: true } } } },
        },
      },
      client: {
        select: { name: true, phone: true, email: true },
      },
      location: {
        include: {
          platformLocation: true,
          ownerLocation: true,
        },
      },
      deposit: true,
    },
  })

  if (!booking || booking.car.id !== params.carId) notFound()

  // Serialize for client component
  const bookingData = {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
    rentalType: booking.rentalType,
    tripScope: booking.tripScope,
    withDriver: booking.driverRequested,
    baseAmount: booking.baseAmount,
    driverSurchargeTotal: booking.driverTotal,
    deliveryFee: booking.deliveryFee,
    subtotal: booking.subtotal,
    depositAmount: booking.deposit?.amount ?? 0,
    totalChargedNow: booking.subtotal + booking.depositAmount,
    paymentMethod: searchParams.method === 'bank' ? 'BANK_TRANSFER' : 'MTN_MOMO',
    car: {
      make: booking.car.make,
      model: booking.car.model,
      year: booking.car.year,
      coverPhotoUrl: booking.car.photos[0]?.url ?? null,
      ownerName: ownerDisplayName(booking.car.owner, 'Owner'),
      ownerPhone: booking.car.owner.user.phone ?? '',
    },
    client: {
      name: booking.client.name ?? '',
      phone: booking.client.phone ?? '',
      isGuest: booking.isGuestBooking,
    },
    pickupLocation:
      booking.location?.platformLocation?.name ??
      booking.location?.ownerLocation?.name ??
      booking.location?.customDescription ??
      'To be confirmed',
  }

  return <ConfirmationScreen booking={bookingData} />
}
