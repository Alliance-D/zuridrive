/**
 * app/owner/bookings/[bookingId]/page.tsx
 *
 * Owner-facing booking detail page.
 * Reuses the same BookingDetailView component.
 * Adds owner-specific action: accept/reject (when AWAITING_OWNER_CONFIRMATION).
 */

import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { BookingDetailView } from '@/components/trip/BookingDetailView'
import { OwnerConfirmBanner } from '@/components/trip/OwnerConfirmBanner'
import CancelBookingButton from '@/components/trip/CancelBookingButton'

export default async function OwnerBookingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const booking = await db.booking.findUnique({
    where: { id: params.id },
    include: {
      car: {
        include: {
          photos: { take: 1, orderBy: { order: 'asc' } },
          fuelPolicy: true,
          owner: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
      },
      client: { select: { id: true, name: true, phone: true } },
      location: {
        include: { platformLocation: true, ownerLocation: true },
      },
      payments: {
        where: { isVoided: false },
        orderBy: { createdAt: 'desc' },
        select: {
          status: true,
          method: true,
          rentalAmount: true,
          depositAmount: true,
          totalAmount: true,
          confirmedAt: true,
          proofUrl: true,
        },
      },
      deposit: {
        include: { movements: { orderBy: { createdAt: 'asc' } } },
      },
      conditionPhotos: { where: { isDeleted: false }, orderBy: { createdAt: 'asc' } },
      dispute: true,
      // One review per booking, always written by the client.
      review: true,
    },
  })

  if (!booking) notFound()

  // Must be the car's owner
  const isOwner = booking.car.owner.user.id === session.user.id
  if (!isOwner) notFound()

  const awaitingConfirmation = booking.status === 'AWAITING_OWNER_CONFIRMATION'

  // The live payment is the newest non-voided row.
  const payment = booking.payments[0] ?? null
  const ownerUserId = booking.car.owner.user.id

  // The earliest retainUntil across surviving photos is when they start to go.
  const photoDeleteAt = booking.conditionPhotos
    .map((p) => p.retainUntil)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null

  const data = {
    id: booking.id,
    reference: booking.reference,
    status: booking.status,
    rentalType: booking.rentalType,
    tripScope: booking.tripScope,
    startDate: booking.startDate.toISOString(),
    endDate: booking.endDate.toISOString(),
    withDriver: booking.driverRequested,
    baseAmount: booking.baseAmount,
    driverSurchargeTotal: booking.driverTotal,
    deliveryFee: booking.deliveryFee,
    subtotal: booking.subtotal,
    totalChargedNow: booking.subtotal + booking.depositAmount,
    clientConfirmedReturn: booking.clientConfirmedReturn,
    ownerConfirmedReturn: booking.ownerConfirmedReturn,
    conditionPhotosDeleteAt: photoDeleteAt?.toISOString() ?? null,
    car: {
      make: booking.car.make,
      model: booking.car.model,
      year: booking.car.year,
      coverPhotoUrl: booking.car.photos[0]?.url ?? null,
      fuelPolicyType: booking.car.fuelPolicy?.type ?? null,
      fuelRefuelFee: booking.car.fuelPolicy?.refuelingFee ?? null,
      ownerName: booking.car.owner.user.name ?? 'You',
      ownerId: ownerUserId,
      ownerPhone: booking.car.owner.user.phone ?? '',
    },
    client: {
      id: booking.client.id,
      name: booking.client.name ?? '',
      phone: booking.client.phone ?? '',
    },
    pickupLocation:
      booking.location?.platformLocation?.name ??
      booking.location?.ownerLocation?.name ??
      booking.location?.customDescription ?? null,
    payment: payment
      ? {
          status: payment.status,
          method: payment.method,
          amount: payment.totalAmount,
          confirmedAt: payment.confirmedAt?.toISOString() ?? null,
        }
      : null,
    deposit: booking.deposit
      ? {
          id: booking.deposit.id,
          amount: booking.deposit.amount,
          status: booking.deposit.status,
          releasedAt: booking.deposit.releasedAt?.toISOString() ?? null,
          withheldAmount: booking.deposit.ownerAwardAmount ?? 0,
          releasedAmount: booking.deposit.clientRefundAmount ?? 0,
          movements: booking.deposit.movements.map((m) => ({
            type: m.toStatus,
            amount: m.amount,
            reason: m.reason,
            createdAt: m.createdAt.toISOString(),
          })),
        }
      : null,
    conditionPhotos: booking.conditionPhotos.map((p) => ({
      id: p.id,
      url: p.url,
      phase: (p.isPreTrip ? 'PRE_TRIP' : 'POST_TRIP') as 'PRE_TRIP' | 'POST_TRIP',
      uploadedBy: (p.uploadedById === ownerUserId ? 'OWNER' : 'CLIENT') as
        | 'OWNER'
        | 'CLIENT',
      createdAt: p.createdAt.toISOString(),
    })),
    dispute: booking.dispute
      ? {
          id: booking.dispute.id,
          category: booking.dispute.type,
          description: booking.dispute.description,
          status: booking.dispute.status,
          openedAt: booking.dispute.createdAt.toISOString(),
        }
      : null,
    hasReviewed: false,
    viewerRole: 'OWNER' as const,
  }

  return (
    <div>
      {/* Owner accept/reject banner — shown only when awaiting confirmation */}
      {awaitingConfirmation && (
        <OwnerConfirmBanner
          bookingId={booking.id}
          bookingRef={booking.reference}
          clientName={booking.client.name ?? 'Client'}
          startDate={booking.startDate.toISOString()}
          endDate={booking.endDate.toISOString()}
          totalAmount={data.totalChargedNow}
        />
      )}
      <BookingDetailView booking={data} />
      {['PENDING_PAYMENT','PAYMENT_CONFIRMED','AWAITING_OWNER_CONFIRMATION','CONFIRMED'].includes(booking.status) && (
        <div className="mx-auto max-w-3xl px-4 pb-8">
          <CancelBookingButton
            bookingId={booking.id}
            refundableDeposit={
              booking.deposit && booking.deposit.status === 'HELD'
                ? booking.deposit.amount
                : 0
            }
            viewerRole="OWNER"
          />
        </div>
      )}
    </div>
  )
}
