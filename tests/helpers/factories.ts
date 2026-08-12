/**
 * Fixture builders.
 *
 * These mirror what the application actually writes, not the minimum Prisma
 * will accept. A booking factory that skips the commission row would let a
 * reconciliation test pass against data the real code could never produce —
 * so `paidBooking()` writes the payment, deposit and commission together, in
 * the same shape the booking flow does.
 */

import { prisma } from "./db";
import type {
  BookingStatus,
  PaymentMethod,
  SubscriptionTier,
  User,
  Car,
  CarOwnerProfile,
} from "@prisma/client";

let counter = 0;
const next = () => ++counter;

/** Unique Rwandan-format phone number. */
export function phone(): string {
  return `+2507${String(10_000_000 + next()).slice(0, 8)}`;
}

export async function makeClient(overrides: Partial<User> = {}): Promise<User> {
  return prisma.user.create({
    data: {
      phone: phone(),
      name: `Client ${next()}`,
      role: "CLIENT",
      ...overrides,
    },
  });
}

export async function makeAdmin(
  role: "SUPER_ADMIN" | "SUB_ADMIN" = "SUPER_ADMIN",
): Promise<User> {
  return prisma.user.create({
    data: { phone: phone(), name: `Admin ${next()}`, role },
  });
}

export interface OwnerFixture {
  user: User;
  profile: CarOwnerProfile;
}

export async function makeOwner(): Promise<OwnerFixture> {
  const user = await prisma.user.create({
    data: { phone: phone(), name: `Owner ${next()}`, role: "OWNER" },
  });

  const profile = await prisma.carOwnerProfile.create({
    data: {
      userId: user.id,
      momoNumber: user.phone,
      isOnboardingComplete: true,
      onboardingStep: 4,
    },
  });

  return { user, profile };
}

export async function makeCar(
  ownerId: string,
  overrides: Partial<Car> = {},
  pricing: { perDayInCity?: number; depositAmount?: number } = {},
): Promise<Car> {
  const n = next();
  const car = await prisma.car.create({
    data: {
      ownerId,
      make: "Toyota",
      model: `Model${n}`,
      year: 2020,
      color: "White",
      licensePlate: `RAB${100 + n}X`,
      category: "ECONOMY",
      fuelType: "PETROL",
      transmission: "AUTOMATIC",
      seatingCapacity: 5,
      status: "LIVE",
      isActive: true,
      publishedAt: new Date(),
      ...overrides,
    },
  });

  await prisma.pricingMatrix.create({
    data: {
      carId: car.id,
      perDayInCity: pricing.perDayInCity ?? 45_000,
      perDayOutsideCity: (pricing.perDayInCity ?? 45_000) + 10_000,
      perWeekInCity: 270_000,
      perWeekOutsideCity: 330_000,
      perMonth: 900_000,
      depositEnabled: (pricing.depositAmount ?? 0) > 0,
      depositAmount: pricing.depositAmount ?? null,
    },
  });

  return car;
}

export interface BookingOptions {
  status?: BookingStatus;
  rental?: number;
  deposit?: number;
  commissionRate?: number;
  method?: PaymentMethod;
  startDate?: Date;
  endDate?: Date;
  /**
   * Model the pre-confirmation state: the payment is still PENDING and the
   * deposit has not become HELD. Both move together — a CONFIRMED payment
   * beside a PENDING deposit is a state the application cannot produce, and
   * reconciliation correctly rejects it.
   */
  leaveDepositPending?: boolean;
  momoReference?: string;
}

/**
 * A booking that has been paid for, in the exact shape the payment flow leaves
 * behind: a CONFIRMED payment, a HELD deposit, and — once completed — a
 * commission row.
 */
export async function paidBooking(
  carId: string,
  clientId: string,
  options: BookingOptions = {},
) {
  const {
    status = "CONFIRMED",
    rental = 90_000,
    deposit = 60_000,
    commissionRate = 20,
    method = "MTN_MOMO",
    startDate = new Date(Date.now() + 7 * 864e5),
    endDate = new Date(Date.now() + 9 * 864e5),
    leaveDepositPending = false,
    momoReference,
  } = options;

  const commissionAmount = Math.round((rental * commissionRate) / 100);

  const booking = await prisma.booking.create({
    data: {
      reference: `ZD-T-${next()}`,
      carId,
      clientId,
      rentalType: "PER_DAY",
      startDate,
      endDate,
      totalDays: 2,
      baseRatePerDay: Math.round(rental / 2),
      baseAmount: rental,
      subtotal: rental,
      commissionRate,
      commissionAmount,
      ownerEarnings: rental - commissionAmount,
      depositAmount: deposit,
      status,
      paymentConfirmedAt: leaveDepositPending ? null : new Date(),
      ownerConfirmedAt: status === "PENDING_PAYMENT" ? null : new Date(),
      tripEndedAt: status === "COMPLETED" ? new Date() : null,
      payments: {
        create: {
          method,
          status: leaveDepositPending ? "PENDING" : "CONFIRMED",
          rentalAmount: rental,
          depositAmount: deposit,
          totalAmount: rental + deposit,
          confirmedAt: leaveDepositPending ? null : new Date(),
          momoReference,
        },
      },
    },
    include: { payments: true },
  });

  if (deposit > 0) {
    await prisma.deposit.create({
      data: {
        bookingId: booking.id,
        amount: deposit,
        status: leaveDepositPending ? "PENDING" : "HELD",
      },
    });
  }

  // Commission is only realised when the trip completes — that is what the
  // reconciliation identity is measured against.
  if (status === "COMPLETED") {
    await prisma.commission.create({
      data: {
        bookingId: booking.id,
        rate: commissionRate,
        baseAmount: rental,
        commissionAmount,
        netOwnerAmount: rental - commissionAmount,
      },
    });
  }

  return prisma.booking.findUniqueOrThrow({
    where: { id: booking.id },
    include: { payments: true, deposit: true, commission: true },
  });
}

/** The three plans, matching the real seed. */
export async function makePlans() {
  const specs: {
    tier: SubscriptionTier;
    name: string;
    priceMonthly: number;
    maxListings: number | null;
    featuredPriority: number | null;
    hasVerifiedBadge: boolean;
    analyticsLevel: string;
    hasHomepageBanner: boolean;
    hasPrioritySupport: boolean;
  }[] = [
    {
      tier: "BASIC",
      name: "Basic",
      priceMonthly: 15_000,
      maxListings: 2,
      featuredPriority: null,
      hasVerifiedBadge: false,
      analyticsLevel: "BASIC",
      hasHomepageBanner: false,
      hasPrioritySupport: false,
    },
    {
      tier: "PRO",
      name: "Pro",
      priceMonthly: 35_000,
      maxListings: 6,
      featuredPriority: 2,
      hasVerifiedBadge: true,
      analyticsLevel: "ADVANCED",
      hasHomepageBanner: false,
      hasPrioritySupport: false,
    },
    {
      tier: "PREMIUM",
      name: "Premium",
      priceMonthly: 75_000,
      maxListings: null,
      featuredPriority: 1,
      hasVerifiedBadge: true,
      analyticsLevel: "FULL",
      hasHomepageBanner: true,
      hasPrioritySupport: true,
    },
  ];

  const plans = [];
  for (const spec of specs) {
    plans.push(
      await prisma.subscriptionPlan.create({
        data: { ...spec, isFeatured: spec.featuredPriority !== null, isActive: true },
      }),
    );
  }

  const [basic, pro, premium] = plans;
  return { basic, pro, premium, all: plans };
}

/** Platform settings row with the production defaults. */
export async function makeSettings(
  overrides: Record<string, number | boolean> = {},
) {
  return prisma.platformSetting.upsert({
    where: { id: "singleton" },
    update: overrides,
    create: {
      id: "singleton",
      commissionRatePercent: 20,
      largePayoutThreshold: 1_000_000,
      autoPublishListings: false,
      freeTierMaxListings: 1,
      lateCancellationWindowHours: 24,
      lateCancellationFeePercent: 50,
      photoRetentionDays: 3,
      ownerConfirmWindowHours: 2,
      autoCompleteHours: 48,
      ...overrides,
    },
  });
}
