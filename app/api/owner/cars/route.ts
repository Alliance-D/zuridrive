/**
 * app/api/owner/cars/route.ts
 *
 * POST /api/owner/cars — create a full car listing from the 5-step wizard.
 *
 * Creates Car + PricingMatrix + FuelPolicy + CarPhoto[] + OwnerLocation[] in
 * one transaction, so a half-built listing can never exist.
 *
 * New listings are created as PENDING_APPROVAL — owners cannot publish
 * directly. A Fleet Manager moves them to LIVE.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { notifyAdminsWithModule } from '@/lib/notifications'
import { getPlatformSettings } from '@/lib/platform-settings'
import {
  getOwnerAllowance,
  formatAllowanceReason,
} from '@/lib/subscriptions/limits'
import { getPhoneVerification } from '@/lib/phone-verification'
import { uploadedFileUrl } from '@/lib/validation/urls'
import { z } from 'zod'

const CreateListingSchema = z.object({
  // Step 1 — basics
  make: z.string().min(1).max(50),
  model: z.string().min(1).max(50),
  year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
  color: z.string().min(1).max(30),
  licensePlate: z.string().min(3).max(20),
  category: z.enum(['ECONOMY', 'SUV', 'LUXURY', 'VAN', 'MINIBUS']),
  fuelType: z.enum(['PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID']),
  transmission: z.enum(['AUTOMATIC', 'MANUAL']),
  seatingCapacity: z.number().int().min(1).max(50),

  // Step 2 — photos (already uploaded to Cloudinary via /api/upload)
  photos: z
    .array(z.object({ url: uploadedFileUrl, publicId: z.string() }))
    .min(3, 'Please add at least three photos.')
    .max(12),

  // Step 3 — pricing, all RWF integers
  perDayInCity: z.number().int().min(1),
  perDayOutsideCity: z.number().int().min(1),
  perWeekInCity: z.number().int().min(1),
  perWeekOutsideCity: z.number().int().min(1),
  perMonth: z.number().int().min(1),
  driverEnabled: z.boolean(),
  driverSurchargePerDay: z.number().int().min(0).optional(),
  depositEnabled: z.boolean(),
  depositAmount: z.number().int().min(0).optional(),

  // Step 4 — availability & delivery
  minBookingDays: z.number().int().min(1).max(90),
  deliverAnywhere: z.boolean(),
  deliveryFee: z.number().int().min(0).optional(),

  // Step 5 — fuel policy & pickup points
  fuelPolicyType: z.enum([
    'FULL_TO_FULL',
    'SAME_LEVEL',
    'FREE_TANK',
    'OWNER_HANDLES',
  ]),
  refuelingFee: z.number().int().min(0).optional(),
  locations: z
    .array(
      z.object({
        name: z.string().min(2).max(120),
        description: z.string().max(500).optional(),
        neighborhoodId: z.string().optional(),
        deliveryFee: z.number().int().min(0).optional(),
      }),
    )
    .max(5)
    .default([]),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Please sign in to continue.' },
        { status: 401 },
      )
    }

    // Car.ownerId points at CarOwnerProfile.id, not User.id.
    const profile = await prisma.carOwnerProfile.findUnique({
      where: { userId: session.user.id },
      select: { id: true, isOnboardingComplete: true },
    })

    if (!profile) {
      return NextResponse.json(
        { error: 'Only registered car owners can list a vehicle.' },
        { status: 403 },
      )
    }

    // Renters have to be able to reach the owner, so a listing needs a proven
    // number. No-op while no SMS provider is configured — see
    // lib/phone-verification for why that is deliberate rather than a gap.
    const verification = await getPhoneVerification(session.user.id)
    if (verification.blocked) {
      return NextResponse.json(
        {
          error:
            'Please confirm your phone number before listing a car — renters need to be able to reach you.',
          needsPhoneVerification: true,
        },
        { status: 403 },
      )
    }

    // Plan limit — checked before anything is validated or written, so an
    // owner at their cap gets a clear answer instead of a half-built listing.
    const allowance = await getOwnerAllowance(profile.id)
    if (!allowance.canListMore) {
      return NextResponse.json(
        {
          error: allowance.reason
            ? formatAllowanceReason(allowance.reason)
            : 'You have reached your listing limit.',
          limit: {
            used: allowance.used,
            maxListings: allowance.maxListings,
            plan: allowance.plan?.name ?? null,
            status: allowance.status,
          },
        },
        { status: 403 },
      )
    }

    const parsed = CreateListingSchema.safeParse(await req.json())
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please check the listing details and try again.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const d = parsed.data

    // Cross-field rules the shape alone can't express
    if (d.driverEnabled && !d.driverSurchargePerDay) {
      return NextResponse.json(
        { error: 'Please set a daily driver surcharge, or turn the driver option off.' },
        { status: 400 },
      )
    }
    if (d.depositEnabled && !d.depositAmount) {
      return NextResponse.json(
        { error: 'Please set a deposit amount, or turn the deposit off.' },
        { status: 400 },
      )
    }
    if (d.deliverAnywhere && d.deliveryFee == null) {
      return NextResponse.json(
        { error: 'Please set a delivery fee for "deliver anywhere".' },
        { status: 400 },
      )
    }

    const plate = d.licensePlate.toUpperCase().trim()
    const clash = await prisma.car.findUnique({
      where: { licensePlate: plate },
      select: { id: true },
    })
    if (clash) {
      return NextResponse.json(
        { error: 'A car with that number plate is already listed.' },
        { status: 409 },
      )
    }

    // Super Admins can turn on auto-publish to skip Fleet Manager review.
    const { autoPublishListings } = await getPlatformSettings()

    const car = await prisma.car.create({
      data: {
        ownerId: profile.id,
        make: d.make.trim(),
        model: d.model.trim(),
        year: d.year,
        color: d.color.trim(),
        licensePlate: plate,
        category: d.category,
        fuelType: d.fuelType,
        transmission: d.transmission,
        seatingCapacity: d.seatingCapacity,
        minBookingDays: d.minBookingDays,
        deliverAnywhere: d.deliverAnywhere,
        deliveryFee: d.deliverAnywhere ? d.deliveryFee : null,
        // Owners never publish directly unless auto-publish is enabled.
        status: autoPublishListings ? 'LIVE' : 'PENDING_APPROVAL',
        publishedAt: autoPublishListings ? new Date() : null,
        pricing: {
          create: {
            perDayInCity: d.perDayInCity,
            perDayOutsideCity: d.perDayOutsideCity,
            perWeekInCity: d.perWeekInCity,
            perWeekOutsideCity: d.perWeekOutsideCity,
            perMonth: d.perMonth,
            driverEnabled: d.driverEnabled,
            driverSurchargePerDay: d.driverEnabled ? d.driverSurchargePerDay : null,
            depositEnabled: d.depositEnabled,
            depositAmount: d.depositEnabled ? d.depositAmount : null,
          },
        },
        fuelPolicy: {
          create: {
            type: d.fuelPolicyType,
            refuelingFee:
              d.fuelPolicyType === 'FULL_TO_FULL' ? (d.refuelingFee ?? null) : null,
          },
        },
        photos: {
          create: d.photos.map((p, order) => ({
            url: p.url,
            publicId: p.publicId,
            order, // order 0 is the cover photo
          })),
        },
        locations: d.locations.length
          ? {
              create: d.locations.map((l) => ({
                name: l.name,
                description: l.description,
                neighborhoodId: l.neighborhoodId,
                deliveryFee: l.deliveryFee,
                // Custom pickup points need Content Moderator approval.
                isApproved: false,
              })),
            }
          : undefined,
      },
      select: { id: true, make: true, model: true, year: true },
    })

    // Mark onboarding complete once the first car exists.
    if (!profile.isOnboardingComplete) {
      await prisma.carOwnerProfile.update({
        where: { id: profile.id },
        data: { isOnboardingComplete: true, onboardingStep: 4 },
      })
    }

    if (!autoPublishListings) {
      await notifyAdminsWithModule('FLEET_MANAGER', {
        type: 'ADMIN_BROADCAST',
        title: 'New car listing awaiting approval',
      titleKey: 'newListingTitle',
      bodyKey: 'newListingBody',
      params: { car: `${car.year} ${car.make} ${car.model}` },
        body: `${car.year} ${car.make} ${car.model} was submitted for review.`,
        actionUrl: '/admin/fleet',
        metadata: { carId: car.id },
      })
    }

    return NextResponse.json(
      { success: true, carId: car.id, published: autoPublishListings },
      { status: 201 },
    )
  } catch (error) {
    console.error('[POST /api/owner/cars]', error)
    return NextResponse.json(
      { error: 'We couldn’t save your listing. Please try again.' },
      { status: 500 },
    )
  }
}
