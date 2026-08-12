/**
 * app/owner/bookings/[bookingId]/photos/page.tsx
 *
 * Owner-facing photo upload page.
 * Identical logic to the client version — just a different URL.
 * Reuses the same ConditionPhotoUploader component.
 */

import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { ConditionPhotoUploader } from '@/components/photos/ConditionPhotoUploader'

interface Props {
  params: { id: string }
  searchParams: { phase?: string }
}

export default async function OwnerPhotoUploadPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/login')

  const phase = searchParams.phase === 'POST_TRIP' ? 'POST_TRIP' : 'PRE_TRIP'

  const booking = await db.booking.findUnique({
    where: { id: params.id },
    include: {
      car: {
        include: {
          fuelPolicy: true,
          owner: { include: { user: { select: { id: true } } } },
        },
      },
      client: { select: { id: true } },
      conditionPhotos: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!booking) notFound()

  // Must be the owner
  const isOwner = booking.car.owner.user.id === session.user.id
  if (!isOwner) notFound()

  // Validate phase for booking status
  if (phase === 'POST_TRIP' && booking.status !== 'ACTIVE') {
    redirect(`/owner/bookings/${params.id}`)
  }
  if (phase === 'PRE_TRIP' && !['CONFIRMED', 'ACTIVE'].includes(booking.status)) {
    redirect(`/owner/bookings/${params.id}`)
  }

  const fuelPolicyType = booking.car.fuelPolicy?.type ?? null
  const fuelGaugeRequired = ['FULL_TO_FULL', 'SAME_LEVEL'].includes(fuelPolicyType ?? '')

  // Photos store only the uploader's id — compare against the owner's user id.
  const myExistingPhotos = booking.conditionPhotos.filter(
    (p) => p.isPreTrip === (phase === 'PRE_TRIP') && p.uploadedById === session.user.id,
  )

  return (
    <ConditionPhotoUploader
      bookingId={booking.id}
      bookingRef={booking.reference}
      phase={phase}
      viewerRole="OWNER"
      carName={`${booking.car.year} ${booking.car.make} ${booking.car.model}`}
      fuelPolicyType={fuelPolicyType}
      fuelGaugeRequired={fuelGaugeRequired}
      fuelRefuelFee={booking.car.fuelPolicy?.refuelingFee ?? null}
      existingPhotos={myExistingPhotos.map((p) => ({
        id: p.id,
        url: p.url,
        // `caption` holds "CATEGORY — notes"; split it back apart for the UI.
        category: p.caption?.split(' — ')[0] ?? 'OTHER',
        notes: p.caption?.split(' — ').slice(1).join(' — ') || null,
      }))}
    />
  )
}
