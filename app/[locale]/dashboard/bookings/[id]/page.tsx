/**
 * app/dashboard/bookings/[bookingId]/page.tsx
 *
 * Client-facing booking detail page.
 * Server component: loads booking, determines user role, renders appropriate view.
 *
 * Shows:
 * - Full booking summary (car, dates, pricing, location)
 * - Status timeline
 * - Return confirmation / dispute buttons (when ACTIVE)
 * - Condition photo upload prompt (when CONFIRMED or ACTIVE)
 * - Deposit status card
 * - Review prompt (when COMPLETED)
 */

import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loginPath } from '@/lib/navigation'
import { db } from '@/lib/db'
import { BookingDetailView } from '@/components/trip/BookingDetailView'
import CancelBookingButton from '@/components/trip/CancelBookingButton'
import DisputeCancellationFee from '@/components/trip/DisputeCancellationFee'

export default async function BookingDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(await loginPath())

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
      client: {
        select: { id: true, name: true, phone: true },
      },
      location: {
        include: {
          platformLocation: true,
          ownerLocation: true,
        },
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
        include: {
          movements: { orderBy: { createdAt: 'asc' } },
        },
      },
      conditionPhotos: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'asc' },
      },
      dispute: true,
      // Review is a one-to-one on Booking — it always belongs to the client.
      review: true,
    },
  })

  if (!booking) notFound()

  // Verify this user is either the client or the owner
  const isClient = booking.client.id === session.user.id
  const isOwner = booking.car.owner.user.id === session.user.id

  if (!isClient && !isOwner) notFound()

  // The live payment is the newest non-voided row.
  const payment = booking.payments[0] ?? null

  // Photos record only the uploader's id — resolve it to a role for display.
  const ownerUserId = booking.car.owner.user.id

  // The earliest retainUntil across surviving photos is when they start to go.
  const photoDeleteAt = booking.conditionPhotos
    .map((p) => p.retainUntil)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null

  // Serialize for client component
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
      ownerName: booking.car.owner.user.name ?? 'Owner',
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
      booking.location?.customDescription ??
      null,
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
    hasReviewed: booking.review !== null,
    viewerRole: (isClient ? 'CLIENT' : 'OWNER') as 'CLIENT' | 'OWNER',
  }

  // A booking can still be called off until the car is handed over.
  const canCancel = ['PENDING_PAYMENT','PAYMENT_CONFIRMED','AWAITING_OWNER_CONFIRMATION','CONFIRMED'].includes(booking.status)
  const refundableDeposit =
    booking.deposit && booking.deposit.status === 'HELD' ? booking.deposit.amount : 0

  // A fee was kept on a cancelled booking — offer the client a way to
  // challenge it with proof.
  const cancellationFee =
    booking.status === 'CANCELLED' ? (booking.deposit?.ownerAwardAmount ?? 0) : 0

  return (
    <div>
      <BookingDetailView booking={data} />
      {isClient && cancellationFee > 0 && (
        <div className="mx-auto max-w-3xl px-4 pb-4">
          <DisputeCancellationFee
            bookingId={booking.id}
            feeCharged={cancellationFee}
            alreadyDisputed={booking.dispute !== null}
          />
        </div>
      )}
      {canCancel && (
        <div className="mx-auto max-w-3xl px-4 pb-8">
          <CancelBookingButton
            bookingId={booking.id}
            refundableDeposit={refundableDeposit}
            viewerRole={isClient ? 'CLIENT' : 'OWNER'}
          />
        </div>
      )}
    </div>
  )
}
