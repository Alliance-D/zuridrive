/**
 * app/api/bookings/route.ts
 *
 * POST /api/bookings — Create a new booking.
 *
 * Flow:
 * 1. Validate input
 * 2. Check car exists and is LIVE
 * 3. Check availability (no conflicts)
 * 4. Calculate price server-side (never trust client-side totals)
 * 5. Create or find User (guest auto-account creation)
 * 6. Create Booking + Payment + Deposit records atomically
 * 7. Return booking reference + payment instructions
 *
 * Financial integrity rules:
 * - Payment and Deposit are always separate records
 * - Commission calculated but stored — never recalculated later
 * - All records immutable after creation
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { checkCarAvailability } from '@/lib/booking/availability'
import { calculateBookingPrice } from '@/lib/booking/pricing'
import { getCommissionRateForOwner } from '@/lib/subscriptions/limits'
import { paymentsEnabled } from '@/lib/payments'
import { sendSms } from '@/lib/sms'
import { localeFromRequest } from '@/lib/locale-cookie'
import { formatMoney } from '@/lib/currency'
import { hasContactDetails } from '@/lib/contact-detection'
import { NotificationType } from '@prisma/client'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'

// --- Input validation schema ---
// Enum values mirror the Prisma enums exactly — do not introduce short aliases.
const CreateBookingSchema = z.object({
  carId: z.string().cuid(),
  rentalType: z.enum(['PER_DAY', 'PER_WEEK', 'PER_MONTH']),
  tripScope: z.enum(['IN_CITY', 'OUTSIDE_CITY']).nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  withDriver: z.boolean(),
  pickupLocationId: z.string().optional(),         // Platform or Owner location ID
  customLocationText: z.string().max(500).optional(), // Tier 3 free text
  customLocationLat: z.number().optional(),
  customLocationLng: z.number().optional(),
  deliveryFee: z.number().int().min(0).default(0),

  // Client info (required if guest, pre-filled if logged in)
  clientName: z.string().min(2).max(100),
  clientPhone: z.string().min(10).max(15),
  clientEmail: z.string().email().optional(),
  /**
   * The renter confirms they hold a valid licence and will show it, with ID,
   * before taking the car. Required - a booking cannot be made without it.
   * We store that they confirmed, never the documents themselves.
   */
  licenceAttested: z.literal(true, {
    errorMap: () => ({
      message:
        'Please confirm you hold a valid driving licence and will present it at handover.',
    }),
  }),

  paymentMethod: z.enum(['MTN_MOMO', 'BANK_TRANSFER', 'DIRECT']),

  /**
   * Anything the renter wants the owner to know before handover: a flight
   * number, a late arrival, a child seat. Optional, and capped — this is
   * context for one handover, not a message thread.
   */
  renterNote: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateBookingSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Please check your booking details and try again.',
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const data = parsed.data
    const startDate = new Date(data.startDate)
    const endDate = new Date(data.endDate)

    // Validate dates make sense
    if (endDate <= startDate) {
      return NextResponse.json(
        { error: 'Your return date must be after your pickup date.' },
        { status: 400 },
      )
    }

    // Monthly rentals must not have a tripScope
    if (data.rentalType === 'PER_MONTH' && data.tripScope !== null) {
      return NextResponse.json(
        { error: 'Monthly rentals apply a flat rate — no city restriction needed.' },
        { status: 400 },
      )
    }

    // Day/Week rentals must have a tripScope
    if (data.rentalType !== 'PER_MONTH' && !data.tripScope) {
      return NextResponse.json(
        { error: 'Please select whether your trip is in-city or outside city.' },
        { status: 400 },
      )
    }

    // --- Load car with all pricing data ---
    const car = await db.car.findUnique({
      where: { id: data.carId },
      include: {
        pricing: true,
        fuelPolicy: true,
        country: { select: { code: true, currency: true } },
        owner: {
          include: { user: { select: { id: true, phone: true, name: true } } },
        },
      },
    })

    if (!car) {
      return NextResponse.json({ error: 'This car is no longer available.' }, { status: 404 })
    }

    if (car.status !== 'LIVE') {
      return NextResponse.json(
        { error: 'This car is not currently available for booking.' },
        { status: 400 },
      )
    }

    if (!car.pricing) {
      return NextResponse.json(
        { error: 'This car has no pricing set up yet. Please try another car.' },
        { status: 400 },
      )
    }

    // Validate driver option
    if (data.withDriver && !car.pricing.driverEnabled) {
      return NextResponse.json(
        { error: 'This car does not offer a driver option.' },
        { status: 400 },
      )
    }

    // --- Availability check ---
    const availability = await checkCarAvailability(data.carId, startDate, endDate)
    if (!availability.available) {
      return NextResponse.json({ error: availability.message }, { status: 409 })
    }

    // --- Server-side price calculation (never trust client) ---
    // The rate is read here and snapshotted onto the Booking and Commission
    // rows, so a later rate change never rewrites historical bookings.
    //
    // It comes from the owner's plan when that plan sets one, so a higher
    // subscription can buy a smaller cut, and falls back to the platform rate
    // otherwise.
    const commissionRatePercent = await getCommissionRateForOwner(
      car.ownerId,
      undefined,
      car.countryCode,
    )

    const pricing = calculateBookingPrice({
      commissionRatePercent,
      rentalType: data.rentalType,
      tripScope: data.tripScope,
      startDate,
      endDate,
      withDriver: data.withDriver,
      deliveryFee: data.deliveryFee,
      pricingMatrix: {
        perDayInCity: car.pricing.perDayInCity,
        perDayOutsideCity: car.pricing.perDayOutsideCity,
        perWeekInCity: car.pricing.perWeekInCity,
        perWeekOutsideCity: car.pricing.perWeekOutsideCity,
        perMonth: car.pricing.perMonth,
        driverSurchargePerDay: car.pricing.driverSurchargePerDay ?? 0,
        depositAmount: car.pricing.depositAmount ?? 0,
        depositEnabled: car.pricing.depositEnabled,
      },
    })

    // --- Find or create user ---
    const session = await getServerSession(authOptions)
    let userId: string
    let isGuestBooking = false

    if (session?.user?.id) {
      // Logged-in user
      userId = session.user.id
    } else {
      // Guest — find by phone or create account
      isGuestBooking = true

      const existingUser = await db.user.findUnique({
        where: { phone: data.clientPhone },
      })

      if (existingUser) {
        userId = existingUser.id
      } else {
        // Auto-create account for guest.
        // Random unusable password — they sign in with phone + OTP, so this
        // only exists to keep the column non-guessable.
        const tempPasswordHash = await bcrypt.hash(randomUUID(), 12)

        const newUser = await db.user.create({
          data: {
            phone: data.clientPhone,
            email: data.clientEmail,
            name: data.clientName,
            role: 'CLIENT',
            passwordHash: tempPasswordHash,
            // A guest booking still gets SMS - in the language they booked in.
            locale: localeFromRequest(req),
          },
        })
        userId = newUser.id
      }
    }

    // --- Generate booking reference ---
    // Format: ZD-YYYYMMDD-XXXX (readable, unique enough for display)
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase()
    const bookingReference = `ZD-${dateStr}-${randomSuffix}`

    // Booking.baseRatePerDay stores the effective per-day rate so weekly and
    // monthly bookings remain comparable in reporting.
    const baseRatePerDay = Math.round(pricing.baseAmount / pricing.durationDays)

    // Pickup location ids are prefixed by the client so we know which table
    // they point at: "platform_<id>" or "owner_<id>".
    const platformLocationId = data.pickupLocationId?.startsWith('platform_')
      ? data.pickupLocationId.replace('platform_', '')
      : null
    const ownerLocationId = data.pickupLocationId?.startsWith('owner_')
      ? data.pickupLocationId.replace('owner_', '')
      : null

    // --- Atomic transaction: Booking + Location + Payment + Deposit + Commission ---
    // Phase 1: ZuriDrive takes no payments, so the renter and owner settle
    // between themselves at handover. See lib/payments/providers/direct.ts.
    const settlesDirectly = !paymentsEnabled()

    const result = await db.$transaction(async (tx) => {
      // 1. Create booking
      const booking = await tx.booking.create({
        data: {
          reference: bookingReference,
          carId: data.carId,
          clientId: userId,
          rentalType: data.rentalType,
          tripScope: data.tripScope,
          startDate,
          endDate,
          driverRequested: data.withDriver,
          totalDays: pricing.durationDays,
          // With direct settlement there is no payment for the platform to
          // wait on, so the booking goes straight to the owner. Under a
          // payment provider it waits at PENDING_PAYMENT until money clears.
          status: settlesDirectly ? 'AWAITING_OWNER_CONFIRMATION' : 'PENDING_PAYMENT',

          // Pricing snapshot — immutable once written
          baseRatePerDay,
          baseAmount: pricing.baseAmount,
          driverTotal: pricing.driverSurchargeTotal,
          deliveryFee: pricing.deliveryFee,
          subtotal: pricing.subtotalBeforeDeposit,
          // Snapshotted alongside the rate, and for the same reason: the
          // booking has to stay readable in the terms it was made under. The
          // car's market decides it — a car listed in Kampala is priced in
          // shillings whoever is booking it and wherever they are.
          currency: car.country.currency,
          renterNote: data.renterNote?.trim() || null,
          // Flagged, never blocked: renters and owners exchange numbers
          // through the platform as a matter of course, and a false positive
          // on a flight number would be infuriating. This only means somebody
          // can see a pattern later if one appears.
          renterNoteHasContact: data.renterNote
            ? hasContactDetails(data.renterNote)
            : false,
          commissionRate: pricing.commissionRate,
          commissionAmount: pricing.commissionAmount,
          ownerEarnings: pricing.ownerEarnings,
          depositAmount: pricing.depositAmount,

          // Guest snapshot — kept on the booking so it survives profile edits
          isGuestBooking,
          guestName: isGuestBooking ? data.clientName : null,
          guestEmail: isGuestBooking ? data.clientEmail : null,
          // The renter confirms at checkout that they hold a valid licence and
          // will present it at handover. We record that they said so, not the
          // document itself - see the identity-check note on the Booking model.
          licenceAttestedAt: data.licenceAttested ? new Date() : null,
        },
      })

      // 2. Create booking location record
      await tx.bookingLocation.create({
        data: {
          bookingId: booking.id,
          platformLocationId,
          ownerLocationId,
          customDescription: data.customLocationText,
          customLatitude: data.customLocationLat,
          customLongitude: data.customLocationLng,
        },
      })

      // 3. Create payment record. Rental and deposit are tracked as separate
      //    columns on the same payment so reconciliation can split them.
      //
      //    A DIRECT booking still gets a row, with amounts of ZERO. It records
      //    that a booking happened and what was agreed, without claiming the
      //    platform collected anything — writing the real amounts here would
      //    put money through the ledger that ZuriDrive never received, and
      //    reconciliation would rightly refuse to balance.
      const payment = await tx.payment.create({
        data: {
          bookingId: booking.id,
          currency: car.country.currency,
          method: settlesDirectly ? 'DIRECT' : data.paymentMethod,
          status: settlesDirectly ? 'CONFIRMED' : 'PENDING',
          confirmedAt: settlesDirectly ? new Date() : null,
          rentalAmount: settlesDirectly ? 0 : pricing.subtotalBeforeDeposit,
          depositAmount: settlesDirectly ? 0 : pricing.depositAmount,
          totalAmount: settlesDirectly ? 0 : pricing.totalChargedNow,
        },
      })

      // 4. Create deposit record (completely separate, never mixed with rental
      //    payment). Starts PENDING: no money has been collected yet, so
      //    marking it HELD here would overstate what the platform is holding.
      //    It moves to HELD when the payment is confirmed.
      //    Under direct settlement no deposit record is written at all. The
      //    owner collects and returns the deposit themselves, in person, so a
      //    row here would imply ZuriDrive is holding money it has never seen.
      let deposit = null
      if (!settlesDirectly && pricing.depositEnabled && pricing.depositAmount > 0) {
        deposit = await tx.deposit.create({
          data: {
            bookingId: booking.id,
            currency: car.country.currency,
            amount: pricing.depositAmount,
            status: 'PENDING',
          },
        })
      }

      // 5. Pre-create commission record (locked to booking totals at this moment)
      //
      //    Skipped under direct settlement: ZuriDrive earns from owner
      //    subscriptions in Phase 1, not from a cut of each trip. Writing a
      //    commission row for money nobody will ever collect would show up as
      //    revenue in reconciliation and in the finance reports.
      if (!settlesDirectly) {
        await tx.commission.create({
          data: {
            bookingId: booking.id,
            currency: car.country.currency,
            rate: pricing.commissionRate,
            baseAmount: pricing.commissionableSubtotal,
            commissionAmount: pricing.commissionAmount,
            netOwnerAmount: pricing.ownerEarnings,
          },
        })
      }

      return { booking, payment, deposit }
    })

    // --- Send confirmation SMS to owner ---
    if (car.owner.user.phone) {
      await sendSms({
        to: car.owner.user.phone,
        type: NotificationType.BOOKING_REQUEST,
        userId: car.owner.user.id,
        messageKey: 'newBookingRequest',
        params: {
          owner: car.owner.user.name ?? 'Owner',
          car: `${car.make} ${car.model}`,
          start: startDate,
          end: endDate,
          amount: formatMoney(pricing.subtotalBeforeDeposit),
          reference: bookingReference,
        },
      })
    }

    return NextResponse.json({
      success: true,
      bookingId: result.booking.id,
      bookingReference,
      paymentId: result.payment.id,
      depositId: result.deposit?.id ?? null,
      totalChargedNow: pricing.totalChargedNow,
      subtotal: pricing.subtotalBeforeDeposit,
      depositAmount: pricing.depositAmount,
      paymentMethod: data.paymentMethod,
    })
  } catch (error) {
    // Someone else booked these dates in the moment between the availability
    // check and the write. The database refuses the overlap — see the
    // bookings_no_overlap constraint — and that is a conflict to explain, not
    // a server fault to apologise for.
    if (
      error instanceof Error &&
      error.message.includes('bookings_no_overlap')
    ) {
      return NextResponse.json(
        {
          error:
            'Someone just booked these dates. Please pick different dates and try again.',
        },
        { status: 409 },
      )
    }

    console.error('[POST /api/bookings]', error)
    return NextResponse.json(
      {
        error: 'Something went wrong while creating your booking. Please try again.',
      },
      { status: 500 },
    )
  }
}
