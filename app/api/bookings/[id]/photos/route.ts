/**
 * app/api/bookings/[bookingId]/photos/route.ts
 *
 * POST /api/bookings/[bookingId]/photos
 * Upload condition photos for a booking (pre-trip or post-trip).
 *
 * Rules:
 * - PRE_TRIP: allowed when status is CONFIRMED or ACTIVE
 * - POST_TRIP: allowed when status is ACTIVE
 * - Both client and owner can upload photos
 * - Fuel gauge photo is REQUIRED for FULL_TO_FULL and SAME_LEVEL fuel policies
 * - Photos stored in Cloudinary, record in DB with retainUntil set
 * - Photos linked to booking with phase, uploader role, timestamp
 *
 * GET /api/bookings/[bookingId]/photos
 * Returns all condition photos for the booking.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { v2 as cloudinary } from 'cloudinary'
import { uploadedFileUrl } from '@/lib/validation/urls'
import { z } from 'zod'
import {
  FUEL_GAUGE_REQUIRED_POLICIES,
  PHOTO_CATEGORIES,
} from '@/lib/photos/categories'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

const UploadPhotoSchema = z.object({
  phase: z.enum(['PRE_TRIP', 'POST_TRIP']),
  category: z.enum([
    'EXTERIOR_FRONT', 'EXTERIOR_REAR', 'EXTERIOR_LEFT', 'EXTERIOR_RIGHT',
    'INTERIOR', 'FUEL_GAUGE', 'OTHER',
  ]),
  // Base64 image data or URL (from Cloudinary direct upload)
  imageUrl: uploadedFileUrl.optional(),
  imageBase64: z.string().optional(),
  notes: z.string().max(500).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 })
    }

    const body = await req.json()
    const parsed = UploadPhotoSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid photo upload request.', fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      )
    }

    const { phase, category, imageUrl, imageBase64, notes } = parsed.data

    // Load booking with fuel policy
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
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    // Verify user is client or owner
    const isClient = booking.client.id === session.user.id
    const isOwner = booking.car.owner.user.id === session.user.id
    if (!isClient && !isOwner) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    // Validate booking status allows photo upload
    const allowedStatuses =
      phase === 'PRE_TRIP' ? ['CONFIRMED', 'ACTIVE'] : ['ACTIVE']

    if (!allowedStatuses.includes(booking.status)) {
      return NextResponse.json(
        {
          error: phase === 'PRE_TRIP'
            ? 'Pre-trip photos can only be uploaded once your booking is confirmed.'
            : 'Post-trip photos can only be uploaded during an active trip.',
        },
        { status: 400 },
      )
    }

    // Get the final image URL — either already uploaded or upload from base64
    let finalUrl: string
    let cloudinaryPublicId: string | null = null

    if (imageUrl) {
      // Already uploaded to Cloudinary via direct upload widget
      finalUrl = imageUrl
    } else if (imageBase64) {
      // Upload to Cloudinary from base64
      const uploadResult = await cloudinary.uploader.upload(imageBase64, {
        folder: `zuridrive/condition_photos/${booking.id}`,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      })
      finalUrl = uploadResult.secure_url
      cloudinaryPublicId = uploadResult.public_id
    } else {
      return NextResponse.json(
        { error: 'Please provide an image to upload.' },
        { status: 400 },
      )
    }

    // Calculate retainUntil — 3 days after booking completion
    // Set to null for now; updated when booking completes
    // For disputed bookings, retainUntil stays null (indefinite)
    const retainUntil = booking.status === 'COMPLETED'
      ? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      : null

    // Save to database.
    // The schema models phase as a boolean (isPreTrip) and singles out the
    // fuel gauge (isFuelGauge) because it drives fuel dispute resolution.
    // The finer-grained category and any free-text notes go into `caption`.
    const caption = [category, notes].filter(Boolean).join(' — ')

    const photo = await db.bookingConditionPhoto.create({
      data: {
        bookingId: booking.id,
        uploadedById: session.user.id,
        isPreTrip: phase === 'PRE_TRIP',
        isFuelGauge: category === 'FUEL_GAUGE',
        url: finalUrl,
        publicId: cloudinaryPublicId ?? '',
        caption,
        retainUntil,
        isLocked: booking.status === 'DISPUTED',
      },
    })

    return NextResponse.json({
      success: true,
      photo: {
        id: photo.id,
        url: photo.url,
        phase: photo.isPreTrip ? 'PRE_TRIP' : 'POST_TRIP',
        category,
        uploadedBy: isClient ? 'CLIENT' : 'OWNER',
        createdAt: photo.createdAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('[POST /api/bookings/[bookingId]/photos]', error)
    return NextResponse.json(
      { error: 'Photo upload failed. Please try again.' },
      { status: 500 },
    )
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })
    }

    const booking = await db.booking.findUnique({
      where: { id: params.id },
      include: {
        car: {
          include: {
            fuelPolicy: { select: { type: true } },
            owner: { include: { user: { select: { id: true } } } },
          },
        },
        client: { select: { id: true } },
        conditionPhotos: { orderBy: { createdAt: 'asc' } },
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    }

    const isClient = booking.client.id === session.user.id
    const isOwner = booking.car.owner.user.id === session.user.id
    if (!isClient && !isOwner) {
      return NextResponse.json({ error: 'Access denied.' }, { status: 403 })
    }

    // Tell the client whether fuel gauge is required
    const fuelGaugeRequired = FUEL_GAUGE_REQUIRED_POLICIES.includes(
      booking.car.fuelPolicy?.type ?? '',
    )

    return NextResponse.json({
      photos: booking.conditionPhotos,
      fuelGaugeRequired,
      fuelPolicyType: booking.car.fuelPolicy?.type ?? null,
    })
  } catch {
    return NextResponse.json({ error: 'Could not load photos.' }, { status: 500 })
  }
}
