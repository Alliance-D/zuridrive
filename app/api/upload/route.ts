/**
 * app/api/upload/route.ts
 *
 * POST /api/upload
 * Handles file uploads to Cloudinary.
 * Used by: license photo upload, bank transfer proof, condition photos.
 *
 * Security:
 * - File type validated before upload
 * - Max size: 5MB
 * - Folder scoped per upload type
 * - Signed uploads via Cloudinary SDK (never expose secret to client)
 */

import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { getSession } from '@/lib/auth'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
})

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_DOC_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf']
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

// Folders mapped to upload contexts
const ALLOWED_FOLDERS = ['bank_proofs', 'condition_photos', 'car_photos', 'profile_photos']

// Nothing is uploadable without a session any more. The 'licenses' folder was
// the one exception - guests uploaded a driving licence during the booking
// wizard before an account existed. ZuriDrive no longer collects identity
// documents at all (the owner checks them in person at handover), so the
// anonymous upload path is closed entirely.
// Uploads are limited per account, in the database. There used to be an
// in-memory counter here for anonymous uploads, which was unreachable — guest
// uploads are closed — and would not have worked anyway, since each serverless
// instance has its own memory. Nothing limited signed-in uploads at all, so an
// account could push 5MB at a time to Cloudinary without bound, and storage is
// billed.
const UPLOAD_LIMIT = 40
const UPLOAD_WINDOW_MS = 15 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const folder = (formData.get('folder') as string) || 'misc'

    if (!file) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
    }

    // Validate folder
    if (!ALLOWED_FOLDERS.includes(folder)) {
      return NextResponse.json({ error: 'Invalid upload destination.' }, { status: 400 })
    }

    // Authorise BEFORE touching Cloudinary — an unauthenticated caller must
    // never be able to spend storage on our account.
    const session = await getSession()

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Please sign in to upload files.' },
        { status: 401 },
      )
    }

    // Per account, so one runaway client cannot fill the Cloudinary bill. Forty
    // in fifteen minutes clears the twelve-photo listing wizard and a full set
    // of condition photos with room over.
    const limit = await rateLimit(
      `upload:${session.user.id}`,
      UPLOAD_LIMIT,
      UPLOAD_WINDOW_MS,
    )
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please wait a few minutes and try again.' },
        { status: 429, headers: rateLimitHeaders(limit) },
      )
    }

    // Validate file type
    const allowedTypes = folder === 'bank_proofs' ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Please upload a valid file. Accepted: ${allowedTypes.join(', ')}` },
        { status: 400 },
      )
    }

    // Validate file size
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File must be under 5MB.' },
        { status: 400 },
      )
    }

    // Convert File to Buffer for Cloudinary SDK
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Cloudinary as a Promise
    const result = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `zuridrive/${folder}`,
            resource_type: file.type === 'application/pdf' ? 'raw' : 'image',
            // Auto-optimize images
            transformation:
              folder === 'car_photos' || folder === 'condition_photos'
                ? [{ quality: 'auto', fetch_format: 'auto' }]
                : undefined,
          },
          (error, result) => {
            if (error || !result) reject(error ?? new Error('Upload failed'))
            else resolve(result as { secure_url: string; public_id: string })
          },
        )
        uploadStream.end(buffer)
      },
    )

    return NextResponse.json({
      url: result.secure_url,
      publicId: result.public_id,
    })
  } catch (error) {
    console.error('[POST /api/upload]', error)
    return NextResponse.json(
      { error: 'Upload failed. Please try again.' },
      { status: 500 },
    )
  }
}
