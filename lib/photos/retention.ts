/**
 * lib/photos/retention.ts
 *
 * Photo retention management utilities.
 * Called whenever a booking changes status — keeps retainUntil dates in sync.
 *
 * Rules from spec:
 * - Trip completed, no dispute → delete 3 days after completion
 * - Dispute opened → retain indefinitely (isLocked = true)
 * - Dispute resolved → retain 3 days after resolution
 * - Admin locked → retain indefinitely until admin unlocks
 *
 * All updates are append-safe — we only ever push the retainUntil date
 * forward, never backward. This prevents data loss if functions are called
 * out of order.
 *
 * KNOWN LIMITATION — isLocked means two different things.
 * It is set both by lockPhotosForDispute (a dispute is open) and by
 * adminLockPhotos (an admin placed a hold), and nothing distinguishes them.
 * So setRetentionOnDisputeResolution releases an admin hold as a side effect,
 * and the photos become deletable three days later.
 *
 * Not reachable today: adminLockPhotos, adminUnlockPhotos and extendRetention
 * have no callers and no UI. It becomes a live evidence-destruction bug the
 * moment a "legal hold" button is wired up. Fixing it properly means recording
 * WHY a photo is locked (a lockReason column), not adding more booleans.
 * Pinned by a test in tests/integration/photo-retention.test.ts.
 *
 * Schema note: BookingConditionPhoto uses `isDeleted` / `isLocked` /
 * `isPreTrip` / `isFuelGauge` — there is no `deleted`, `lockedByDispute`,
 * `phase` or `category` column.
 */

import { db } from '@/lib/db'
import { getPlatformSettings } from '@/lib/platform-settings'

/** Retention window, read from platform settings (default 3 days). */
async function retentionWindowMs(): Promise<number> {
  const { photoRetentionDays } = await getPlatformSettings()
  return photoRetentionDays * 24 * 60 * 60 * 1000
}

/**
 * Called when a booking is marked COMPLETED (no dispute).
 * Sets retainUntil to 3 days from now for all non-locked photos.
 */
export async function setRetentionOnCompletion(bookingId: string): Promise<void> {
  const retainUntil = new Date(Date.now() + (await retentionWindowMs()))

  await db.bookingConditionPhoto.updateMany({
    where: {
      bookingId,
      isLocked: false,
      isDeleted: false,
      // Only set if not already set to a later date
      OR: [
        { retainUntil: null },
        { retainUntil: { lt: retainUntil } },
      ],
    },
    data: { retainUntil },
  })
}

/**
 * Called when a dispute is opened on a booking.
 * Locks all photos — they stay until admin unlocks or dispute resolves.
 */
export async function lockPhotosForDispute(bookingId: string): Promise<void> {
  await db.bookingConditionPhoto.updateMany({
    where: { bookingId, isDeleted: false },
    data: {
      isLocked: true,
      retainUntil: null,  // null = indefinite
    },
  })
}

/**
 * Called when a dispute is resolved by admin.
 * Unlocks photos and sets retainUntil to 3 days from resolution.
 */
export async function setRetentionOnDisputeResolution(bookingId: string): Promise<void> {
  const retainUntil = new Date(Date.now() + (await retentionWindowMs()))

  await db.bookingConditionPhoto.updateMany({
    where: { bookingId, isDeleted: false },
    data: {
      isLocked: false,
      retainUntil,
    },
  })
}

/**
 * Called by admin to manually lock all photos on a booking indefinitely.
 * Used for legal holds or extended investigations.
 */
export async function adminLockPhotos(bookingId: string): Promise<number> {
  const result = await db.bookingConditionPhoto.updateMany({
    where: { bookingId, isDeleted: false },
    data: {
      isLocked: true,
      retainUntil: null,
    },
  })
  return result.count
}

/**
 * Called by admin to release a manual lock.
 * Sets retainUntil to 3 days from now.
 */
export async function adminUnlockPhotos(bookingId: string): Promise<number> {
  const retainUntil = new Date(Date.now() + (await retentionWindowMs()))

  const result = await db.bookingConditionPhoto.updateMany({
    where: { bookingId, isDeleted: false },
    data: {
      isLocked: false,
      retainUntil,
    },
  })
  return result.count
}

/**
 * Extend photo retention by N days from today.
 * Never reduces an existing retainUntil date.
 */
export async function extendRetention(bookingId: string, days: number): Promise<number> {
  const newRetainUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000)

  const result = await db.bookingConditionPhoto.updateMany({
    where: {
      bookingId,
      isDeleted: false,
      isLocked: false,
      OR: [
        { retainUntil: null },
        { retainUntil: { lt: newRetainUntil } },
      ],
    },
    data: { retainUntil: newRetainUntil },
  })
  return result.count
}

/**
 * Get a summary of photo upload status for a booking.
 * Used to check if both parties have completed their uploads.
 *
 * Photos only record the uploader's user id, so we resolve "client vs owner"
 * by comparing against the booking's client and the car owner's user id.
 */
export async function getPhotoUploadStatus(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      clientId: true,
      car: { select: { owner: { select: { userId: true } } } },
      conditionPhotos: {
        where: { isDeleted: false },
        select: { isPreTrip: true, uploadedById: true, isFuelGauge: true },
      },
    },
  })

  const empty = {
    preTripClient: 0,
    preTripOwner: 0,
    postTripClient: 0,
    postTripOwner: 0,
    hasFuelGaugePre: false,
    hasFuelGaugePost: false,
    bothUploadedPreTrip: false,
    bothUploadedPostTrip: false,
  }

  if (!booking) return empty

  const clientId = booking.clientId
  const ownerUserId = booking.car.owner.userId
  const photos = booking.conditionPhotos

  const summary = {
    preTripClient:  photos.filter((p) =>  p.isPreTrip && p.uploadedById === clientId).length,
    preTripOwner:   photos.filter((p) =>  p.isPreTrip && p.uploadedById === ownerUserId).length,
    postTripClient: photos.filter((p) => !p.isPreTrip && p.uploadedById === clientId).length,
    postTripOwner:  photos.filter((p) => !p.isPreTrip && p.uploadedById === ownerUserId).length,
    hasFuelGaugePre:  photos.some((p) =>  p.isPreTrip && p.isFuelGauge),
    hasFuelGaugePost: photos.some((p) => !p.isPreTrip && p.isFuelGauge),
  }

  return {
    ...summary,
    bothUploadedPreTrip:  summary.preTripClient > 0 && summary.preTripOwner > 0,
    bothUploadedPostTrip: summary.postTripClient > 0 && summary.postTripOwner > 0,
  }
}
