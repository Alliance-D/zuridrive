/**
 * prisma/seed.ts
 *
 * Development seed data. Idempotent — safe to re-run.
 *
 * Creates:
 *   • 1 super admin, 1 sub-admin (finance + deposits)
 *   • 2 car owners with complete profiles
 *   • 2 clients
 *   • 4 live cars with pricing, fuel policies and photos
 *   • Platform pickup locations + neighbourhoods
 *   • Subscription plans
 *   • A handful of bookings across the lifecycle, with payments,
 *     deposits and commissions written the same way the API writes them
 *
 * Run with: npm run prisma:seed
 */

import { PrismaClient, type Car } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PASSWORD = 'zuridrive123'

async function main() {
  console.log('Seeding…')

  const passwordHash = await bcrypt.hash(PASSWORD, 12)

  // ── Users ────────────────────────────────────────────────────────────────
  const superAdmin = await prisma.user.upsert({
    where: { phone: '+250780000001' },
    update: {},
    create: {
      phone: '+250780000001',
      email: 'admin@zuridrive.rw',
      name: 'Aline Uwase',
      role: 'SUPER_ADMIN',
      passwordHash,
      isVerified: true,
    },
  })

  const subAdmin = await prisma.user.upsert({
    where: { phone: '+250780000002' },
    update: {},
    create: {
      phone: '+250780000002',
      email: 'finance@zuridrive.rw',
      name: 'Eric Habimana',
      role: 'SUB_ADMIN',
      passwordHash,
      isVerified: true,
    },
  })

  await prisma.subAdminProfile.upsert({
    where: { userId: subAdmin.id },
    update: { roleModules: ['FINANCE_MANAGER', 'DEPOSIT_MANAGER'] },
    create: {
      userId: subAdmin.id,
      roleModules: ['FINANCE_MANAGER', 'DEPOSIT_MANAGER'],
      createdById: superAdmin.id,
    },
  })

  const ownerUsers = await Promise.all(
    [
      { phone: '+250781111101', name: 'Jean-Paul Nkurunziza', email: 'jp@example.rw' },
      { phone: '+250781111102', name: 'Claudine Mukamana', email: 'claudine@example.rw' },
    ].map((o) =>
      prisma.user.upsert({
        where: { phone: o.phone },
        update: {},
        create: { ...o, role: 'OWNER', passwordHash, isVerified: true },
      }),
    ),
  )

  const owners = await Promise.all(
    ownerUsers.map((u, i) =>
      prisma.carOwnerProfile.upsert({
        where: { userId: u.id },
        update: {},
        create: {
          userId: u.id,
          momoNumber: u.phone,
          bankName: 'Bank of Kigali',
          bankAccountName: u.name!,
          bankAccountNumber: `000123456789${i}`,
          onboardingStep: 4,
          isOnboardingComplete: true,
          avgResponseTimeMinutes: 25 + i * 20,
        },
      }),
    ),
  )

  const clients = await Promise.all(
    [
      {
        phone: '+250782222201',
        name: 'Divine Ingabire',
        email: 'divine@example.rw',
      },
      {
        phone: '+250782222202',
        name: 'Samuel Rukundo',
        email: 'samuel@example.rw',
      },
    ].map((c) =>
      prisma.user.upsert({
        where: { phone: c.phone },
        update: {},
        create: { ...c, role: 'CLIENT', passwordHash, isVerified: true },
      }),
    ),
  )

  // ── Platform settings ────────────────────────────────────────────────────
  // Single row, id "singleton". Editable at /admin/settings.
  await prisma.platformSetting.upsert({
    where: { id: 'singleton' },
    update: {},
    create: { id: 'singleton' },
  })

  // ── Locations ────────────────────────────────────────────────────────────
  const platformLocations = await Promise.all(
    [
      { name: 'Kigali International Airport', address: 'KN 5 Rd, Kigali', order: 0 },
      { name: 'Kigali Convention Centre', address: 'KG 2 Roundabout, Kimihurura', order: 1 },
      { name: 'Nyabugogo Bus Park', address: 'Nyabugogo, Nyarugenge', order: 2 },
      { name: 'ZuriDrive Office — Kacyiru', address: 'KG 7 Ave, Kacyiru', order: 3 },
    ].map((l) =>
      prisma.platformLocation.upsert({
        where: { name: l.name },
        update: {},
        create: l,
      }),
    ),
  )

  const neighbourhoods = await Promise.all(
    ['Kimironko', 'Remera', 'Nyamirambo', 'Gikondo', 'Kibagabaga'].map((name) =>
      prisma.neighborhood.upsert({
        where: { name },
        update: {},
        create: { name, city: 'Kigali' },
      }),
    ),
  )

  // ── Subscription plans ───────────────────────────────────────────────────
  // Prices and caps are editable at /admin/plans — these are only the values a
  // fresh database starts with. Listing caps rise across the tiers and Premium
  // carries a ceiling, so the largest operators are a conversation rather than
  // paying what a mid-sized fleet pays. Commission falls as the tier rises, so
  // a bigger subscription buys a smaller cut.
  const plans = [
    {
      tier: 'BASIC' as const, name: 'Basic', priceMonthly: 15000, maxListings: 3,
      commissionRatePercent: 17,
      analyticsLevel: 'BASIC',
    },
    {
      tier: 'PRO' as const, name: 'Pro', priceMonthly: 35000, maxListings: 8,
      commissionRatePercent: 14,
      isFeatured: true, featuredPriority: 2, hasVerifiedBadge: true,
      analyticsLevel: 'ADVANCED',
    },
    {
      tier: 'PREMIUM' as const, name: 'Premium', priceMonthly: 75000, maxListings: 20,
      commissionRatePercent: 11,
      isFeatured: true, featuredPriority: 1, hasVerifiedBadge: true,
      analyticsLevel: 'FULL', hasHomepageBanner: true, hasPrioritySupport: true,
    },
  ]

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { tier: plan.tier },
      update: {},
      create: plan,
    })
  }

  // ── Cars ─────────────────────────────────────────────────────────────────
  const carSpecs = [
    {
      plate: 'RAB 123 A', make: 'Toyota', model: 'RAV4', year: 2021, color: 'Silver',
      category: 'SUV' as const, fuel: 'PETROL' as const, transmission: 'AUTOMATIC' as const,
      seats: 5, ownerIdx: 0,
      pricing: { day: 45000, dayOut: 55000, week: 270000, weekOut: 330000, month: 950000, deposit: 100000 },
      fuelPolicy: 'FULL_TO_FULL' as const,
    },
    {
      plate: 'RAB 456 B', make: 'Toyota', model: 'Corolla', year: 2019, color: 'White',
      category: 'ECONOMY' as const, fuel: 'PETROL' as const, transmission: 'MANUAL' as const,
      seats: 5, ownerIdx: 0,
      pricing: { day: 28000, dayOut: 35000, week: 168000, weekOut: 210000, month: 620000, deposit: 60000 },
      fuelPolicy: 'SAME_LEVEL' as const,
    },
    {
      plate: 'RAC 789 C', make: 'Land Rover', model: 'Discovery', year: 2022, color: 'Black',
      category: 'LUXURY' as const, fuel: 'DIESEL' as const, transmission: 'AUTOMATIC' as const,
      seats: 7, ownerIdx: 1,
      pricing: { day: 95000, dayOut: 120000, week: 570000, weekOut: 720000, month: 2100000, deposit: 250000 },
      fuelPolicy: 'FULL_TO_FULL' as const,
    },
    {
      plate: 'RAD 012 D', make: 'Toyota', model: 'Hiace', year: 2020, color: 'White',
      category: 'MINIBUS' as const, fuel: 'DIESEL' as const, transmission: 'MANUAL' as const,
      seats: 14, ownerIdx: 1,
      pricing: { day: 65000, dayOut: 80000, week: 390000, weekOut: 480000, month: 1400000, deposit: 120000 },
      fuelPolicy: 'FREE_TANK' as const,
    },
  ]

  const cars: Car[] = []
  for (const spec of carSpecs) {
    const existing = await prisma.car.findUnique({ where: { licensePlate: spec.plate } })
    if (existing) {
      // Re-sync the photos rather than skipping the car outright. Seeding
      // should CONVERGE on the desired state, not just avoid duplicates —
      // skipping meant every re-seed left the original placeholder images in
      // place, so a fix to them never actually reached the database.
      await prisma.carPhoto.deleteMany({ where: { carId: existing.id } })
      await prisma.carPhoto.createMany({
        data: [0, 1, 2].map((order) => ({
          carId: existing.id,
          url: `/images/cars/${spec.category.toLowerCase()}.svg`,
          publicId: `seed/${spec.plate.replace(/\s/g, '')}-${order}`,
          order,
        })),
      })
      cars.push(existing)
      continue
    }

    const car = await prisma.car.create({
      data: {
        ownerId: owners[spec.ownerIdx].id,
        make: spec.make,
        model: spec.model,
        year: spec.year,
        color: spec.color,
        licensePlate: spec.plate,
        category: spec.category,
        fuelType: spec.fuel,
        transmission: spec.transmission,
        seatingCapacity: spec.seats,
        status: 'LIVE',
        isActive: true,
        publishedAt: new Date(),
        minBookingDays: 1,
        deliverAnywhere: spec.ownerIdx === 1,
        deliveryFee: spec.ownerIdx === 1 ? 5000 : null,
        pricing: {
          create: {
            perDayInCity: spec.pricing.day,
            perDayOutsideCity: spec.pricing.dayOut,
            perWeekInCity: spec.pricing.week,
            perWeekOutsideCity: spec.pricing.weekOut,
            perMonth: spec.pricing.month,
            driverEnabled: true,
            driverSurchargePerDay: 15000,
            depositEnabled: true,
            depositAmount: spec.pricing.deposit,
          },
        },
        fuelPolicy: {
          create: {
            type: spec.fuelPolicy,
            refuelingFee: spec.fuelPolicy === 'FULL_TO_FULL' ? 20000 : null,
          },
        },
        photos: {
          // Local, category-matched placeholders. Every seeded car used to point
          // at Cloudinary's demo `sample.jpg` — a photograph of flowers — so the
          // whole catalogue showed the same picture of a garden. A placeholder
          // should be obviously a placeholder: these are plain silhouettes that
          // at least match the body style, and they are served from /public so
          // seeding needs no Cloudinary account at all.
          create: [0, 1, 2].map((order) => ({
            url: `/images/cars/${spec.category.toLowerCase()}.svg`,
            publicId: `seed/${spec.plate.replace(/\s/g, '')}-${order}`,
            order,
          })),
        },
        locations: {
          create: {
            name: `${spec.make} pickup — ${neighbourhoods[spec.ownerIdx].name}`,
            neighborhoodId: neighbourhoods[spec.ownerIdx].id,
            isApproved: true,
            approvedById: superAdmin.id,
            approvedAt: new Date(),
            deliveryFee: 3000,
          },
        },
      },
    })
    cars.push(car)
  }

  // ── Bookings ─────────────────────────────────────────────────────────────
  // Written exactly the way POST /api/bookings writes them, so the seed
  // doubles as a check that the schema supports the real create path.
  const COMMISSION_PERCENT = 20

  async function makeBooking(opts: {
    ref: string
    carIdx: number
    clientIdx: number
    status: 'COMPLETED' | 'ACTIVE' | 'AWAITING_OWNER_CONFIRMATION' | 'PENDING_PAYMENT'
    startOffsetDays: number
    days: number
  }) {
    const existing = await prisma.booking.findUnique({ where: { reference: opts.ref } })
    if (existing) return existing

    const car = cars[opts.carIdx]
    const pricing = await prisma.pricingMatrix.findUniqueOrThrow({
      where: { carId: car.id },
    })

    const start = new Date()
    start.setDate(start.getDate() + opts.startOffsetDays)
    const end = new Date(start)
    end.setDate(end.getDate() + opts.days)

    const baseRatePerDay = pricing.perDayInCity
    const baseAmount = baseRatePerDay * opts.days
    const driverTotal = 0
    const deliveryFee = 0
    const subtotal = baseAmount + driverTotal + deliveryFee
    const commissionable = baseAmount + driverTotal
    const commissionAmount = Math.round((commissionable * COMMISSION_PERCENT) / 100)
    const ownerEarnings = commissionable - commissionAmount
    const depositAmount = pricing.depositAmount ?? 0

    const paid = opts.status !== 'PENDING_PAYMENT'

    return prisma.booking.create({
      data: {
        reference: opts.ref,
        carId: car.id,
        clientId: clients[opts.clientIdx].id,
        rentalType: 'PER_DAY',
        tripScope: 'IN_CITY',
        startDate: start,
        endDate: end,
        driverRequested: false,
        totalDays: opts.days,
        status: opts.status,
        baseRatePerDay,
        baseAmount,
        driverTotal,
        deliveryFee,
        subtotal,
        commissionRate: COMMISSION_PERCENT,
        commissionAmount,
        ownerEarnings,
        depositAmount,
        paymentConfirmedAt: paid ? new Date() : null,
        ownerConfirmedAt: ['CONFIRMED', 'ACTIVE', 'COMPLETED'].includes(opts.status)
          ? new Date()
          : null,
        tripStartedAt: ['ACTIVE', 'COMPLETED'].includes(opts.status) ? start : null,
        tripEndedAt: opts.status === 'COMPLETED' ? end : null,
        clientConfirmedReturn: opts.status === 'COMPLETED',
        ownerConfirmedReturn: opts.status === 'COMPLETED',
        location: {
          create: { platformLocationId: platformLocations[0].id },
        },
        payments: {
          create: {
            method: 'MTN_MOMO',
            status: paid ? 'CONFIRMED' : 'PENDING',
            rentalAmount: subtotal,
            depositAmount,
            totalAmount: subtotal + depositAmount,
            momoNumber: clients[opts.clientIdx].phone,
            confirmedAt: paid ? new Date() : null,
          },
        },
        deposit: depositAmount
          ? {
              create: {
                amount: depositAmount,
                // PENDING until payment confirms — an unpaid booking must not
                // claim the platform is holding money it never received.
                status:
                  opts.status === 'COMPLETED'
                    ? 'RELEASED'
                    : paid
                      ? 'HELD'
                      : 'PENDING',
                releasedAt: opts.status === 'COMPLETED' ? new Date() : null,
                releaseTriggeredBy: opts.status === 'COMPLETED' ? 'BOTH_CONFIRMED' : null,
                clientRefundAmount: opts.status === 'COMPLETED' ? depositAmount : null,
              },
            }
          : undefined,
        commission: {
          create: {
            rate: COMMISSION_PERCENT,
            baseAmount: commissionable,
            commissionAmount,
            netOwnerAmount: ownerEarnings,
          },
        },
      },
    })
  }

  const completed = await makeBooking({
    ref: 'ZD-SEED-0001', carIdx: 0, clientIdx: 0,
    status: 'COMPLETED', startOffsetDays: -20, days: 3,
  })
  await makeBooking({
    ref: 'ZD-SEED-0002', carIdx: 2, clientIdx: 1,
    status: 'ACTIVE', startOffsetDays: -1, days: 5,
  })
  await makeBooking({
    ref: 'ZD-SEED-0003', carIdx: 1, clientIdx: 0,
    status: 'AWAITING_OWNER_CONFIRMATION', startOffsetDays: 4, days: 2,
  })
  await makeBooking({
    ref: 'ZD-SEED-0004', carIdx: 3, clientIdx: 1,
    status: 'PENDING_PAYMENT', startOffsetDays: 9, days: 7,
  })

  // A review on the completed trip
  const hasReview = await prisma.review.findUnique({
    where: { bookingId: completed.id },
  })
  if (!hasReview) {
    await prisma.review.create({
      data: {
        bookingId: completed.id,
        carId: completed.carId,
        clientId: completed.clientId,
        cleanlinessRating: 5,
        comfortRating: 5,
        valueRating: 4,
        communicationRating: 5,
        overallRating: 4.75,
        comment: 'Spotless car and the owner met me right on time at the airport.',
        reply: {
          create: {
            authorId: ownerUsers[0].id,
            content: 'Thank you Divine — you are welcome back any time!',
          },
        },
      },
    })
  }

  console.log(`
Seed complete.

  Super admin   +250780000001   admin@zuridrive.rw
  Sub admin     +250780000002   finance@zuridrive.rw   (finance + deposits)
  Owner 1       +250781111101   jp@example.rw
  Owner 2       +250781111102   claudine@example.rw
  Client 1      +250782222201   divine@example.rw
  Client 2      +250782222202   samuel@example.rw

  Password for all: ${PASSWORD}
  ${cars.length} live cars, 4 bookings, 1 review.
`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
