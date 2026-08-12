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
const GUEST_UPLOADABLE_FOLDERS = new Set<string>()

const ANON_RATE_LIMIT_MAX = 5
const ANON_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const anonUploads = new Map<string, { count: number; windowStart: number }>()

function checkAnonRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = anonUploads.get(ip)

  if (!entry || now - entry.windowStart > ANON_RATE_LIMIT_WINDOW_MS) {
    anonUploads.set(ip, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= ANON_RATE_LIMIT_MAX) return false

  entry.count += 1
  return true
}

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
      if (!GUEST_UPLOADABLE_FOLDERS.has(folder)) {
        return NextResponse.json(
          { error: 'Please sign in to upload files.' },
          { status: 401 },
        )
      }

      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        req.headers.get('x-real-ip') ??
        'unknown'

      if (!checkAnonRateLimit(ip)) {
        return NextResponse.json(
          { error: 'Too many uploads. Please wait a few minutes and try again.' },
          { status: 429 },
        )
      }
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
