/**
 * app/api/cron/delete-photos/route.ts
 *
 * GET /api/cron/delete-photos
 * Runs daily at 2am via Vercel Cron.
 *
 * Deletion logic per spec:
 * - Trip completed, no dispute → deleted 3 days after completion
 * - Dispute opened → retained until dispute resolved + 3 days
 * - Admin locked record → retained indefinitely until admin unlocks
 *
 * Process:
 * 1. Find all photos where retainUntil <= now AND deleted = false AND locked = false
 * 2. Delete from Cloudinary
 * 3. Mark as deleted in DB (never hard-delete the record — just clear the URL)
 * 4. Log deletion
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

const CRON_SECRET = process.env.CRON_SECRET!

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let deleted = 0
  let errors = 0

  // Find all photos due for deletion
  // retainUntil <= now means the retention window has expired
  // isLocked = false means no active dispute or admin lock
  // isDeleted = false means not already deleted
  const photosToDelete = await db.bookingConditionPhoto.findMany({
    where: {
      retainUntil: { lte: now },
      isLocked: false,
      isDeleted: false,
    },
    select: {
      id: true,
      publicId: true,
      bookingId: true,
    },
  })

  console.log(`[cron/delete-photos] Found ${photosToDelete.length} photos to delete`)

  for (const photo of photosToDelete) {
    try {
      // 1. Delete from Cloudinary if we have a public ID
      if (photo.publicId) {
        await cloudinary.uploader.destroy(photo.publicId, {
          resource_type: 'image',
        })
      }

      // 2. Mark as deleted in DB — keep the record, clear the URL
      // This preserves the audit trail (photo existed, was uploaded, was deleted on date X)
      await db.bookingConditionPhoto.update({
        where: { id: photo.id },
        data: {
          isDeleted: true,
          deletedAt: now,
          url: '',       // Clear URL — no longer accessible
          publicId: '',  // Cloudinary asset is gone
        },
      })

      deleted++
    } catch (err) {
      console.error(`[cron/delete-photos] Failed to delete photo ${photo.id}:`, err)
      errors++
    }
  }

  console.log(`[cron/delete-photos] Deleted: ${deleted}, Errors: ${errors}`)

  return NextResponse.json({
    ok: true,
    processed: photosToDelete.length,
    deleted,
    errors,
    timestamp: now.toISOString(),
  })
}
