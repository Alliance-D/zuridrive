/**
 * app/dashboard/bookings/[bookingId]/photos/page.tsx
 *
 * Server component: loads booking + existing photos + fuel policy.
 * Renders the ConditionPhotoUploader client component.
 *
 * Accessible at:
 *   /dashboard/bookings/[id]/photos  (client)
 *   /owner/bookings/[id]/photos      (owner — same component, different route)
 */

import { notFound, redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { loginPath } from '@/lib/navigation'
import { db } from '@/lib/db'
import { ConditionPhotoUploader } from '@/components/photos/ConditionPhotoUploader'

interface Props {
  params: { id: string }
  searchParams: { phase?: string }
}

export default async function PhotoUploadPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect(await loginPath())

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

  const isClient = booking.client.id === session.user.id
  const isOwner = booking.car.owner.user.id === session.user.id
  if (!isClient && !isOwner) notFound()

  // Validate phase is appropriate for booking status
  if (phase === 'POST_TRIP' && booking.status !== 'ACTIVE') {
    redirect(`/dashboard/bookings/${params.id}`)
  }
  if (phase === 'PRE_TRIP' && !['CONFIRMED', 'ACTIVE'].includes(booking.status)) {
    redirect(`/dashboard/bookings/${params.id}`)
  }

  const fuelPolicyType = booking.car.fuelPolicy?.type ?? null
  const fuelGaugeRequired = ['FULL_TO_FULL', 'SAME_LEVEL'].includes(fuelPolicyType ?? '')

  // Which photos has THIS user already uploaded for this phase?
  // Photos store only the uploader's id, so compare against the session user.
  const myRole: 'CLIENT' | 'OWNER' = isClient ? 'CLIENT' : 'OWNER'
  const myExistingPhotos = booking.conditionPhotos.filter(
    (p) => p.isPreTrip === (phase === 'PRE_TRIP') && p.uploadedById === session.user.id,
  )

  const data = {
    bookingId: booking.id,
    bookingRef: booking.reference,
    phase: phase as 'PRE_TRIP' | 'POST_TRIP',
    viewerRole: myRole,
    carName: `${booking.car.year} ${booking.car.make} ${booking.car.model}`,
    fuelPolicyType,
    fuelGaugeRequired,
    fuelRefuelFee: booking.car.fuelPolicy?.refuelingFee ?? null,
    existingPhotos: myExistingPhotos.map((p) => ({
      id: p.id,
      url: p.url,
      // `caption` holds "CATEGORY — notes"; split it back apart for the UI.
      category: p.caption?.split(' — ')[0] ?? 'OTHER',
      notes: p.caption?.split(' — ').slice(1).join(' — ') || null,
    })),
  }

  return <ConditionPhotoUploader {...data} />
}
