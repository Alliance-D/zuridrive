-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'SUB_ADMIN', 'OWNER', 'CLIENT');

-- CreateEnum
CREATE TYPE "AdminRoleModule" AS ENUM ('USER_MANAGER', 'FLEET_MANAGER', 'BOOKING_MANAGER', 'FINANCE_MANAGER', 'DEPOSIT_MANAGER', 'CONTENT_MODERATOR', 'COMMUNICATIONS', 'ANALYTICS_VIEWER');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING_PAYMENT', 'PAYMENT_CONFIRMED', 'AWAITING_OWNER_CONFIRMATION', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "CarStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'LIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING_REQUEST', 'APPROVED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('HELD', 'RELEASED', 'PARTIALLY_WITHHELD', 'FULLY_WITHHELD');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MTN_MOMO', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RentalType" AS ENUM ('PER_DAY', 'PER_WEEK', 'PER_MONTH');

-- CreateEnum
CREATE TYPE "TripScope" AS ENUM ('IN_CITY', 'OUTSIDE_CITY');

-- CreateEnum
CREATE TYPE "FuelPolicyType" AS ENUM ('FULL_TO_FULL', 'SAME_LEVEL', 'FREE_TANK', 'OWNER_HANDLES');

-- CreateEnum
CREATE TYPE "CarCategory" AS ENUM ('ECONOMY', 'SUV', 'LUXURY', 'VAN', 'MINIBUS');

-- CreateEnum
CREATE TYPE "FuelType" AS ENUM ('PETROL', 'DIESEL', 'ELECTRIC', 'HYBRID');

-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('AUTOMATIC', 'MANUAL');

-- CreateEnum
CREATE TYPE "DisputeType" AS ENUM ('DAMAGE', 'FUEL', 'LATE_RETURN', 'NO_SHOW', 'OTHER');

-- CreateEnum
CREATE TYPE "DisputeOutcome" AS ENUM ('RESOLVED_FOR_CLIENT', 'RESOLVED_FOR_OWNER', 'SPLIT', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SubscriptionTier" AS ENUM ('BASIC', 'PRO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'LAPSED', 'CANCELLED', 'TRIAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('SMS', 'IN_APP', 'BOTH');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('OTP', 'ACCOUNT_CREATED', 'BOOKING_REQUEST', 'BOOKING_CONFIRMED', 'BOOKING_REJECTED', 'BOOKING_CANCELLED', 'PAYMENT_CONFIRMED', 'TRIP_STARTING_TOMORROW', 'PRE_TRIP_PHOTO_REMINDER', 'RETURN_CONFIRMED', 'TRIP_COMPLETED', 'REVIEW_REMINDER', 'POST_TRIP_PHOTO_REMINDER', 'CONDITION_PHOTOS_DELETING', 'DEPOSIT_RELEASED', 'DEPOSIT_WITHHELD', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'PAYOUT_REQUESTED', 'PAYOUT_PROCESSED', 'SUBSCRIPTION_RENEWING', 'SUBSCRIPTION_EXPIRED', 'BANK_TRANSFER_PENDING', 'ADMIN_BROADCAST');

-- CreateEnum
CREATE TYPE "AdminActionType" AS ENUM ('USER_SUSPENDED', 'USER_UNSUSPENDED', 'USER_DELETED', 'USER_ROLE_CHANGED', 'CAR_APPROVED', 'CAR_FEATURED', 'CAR_UNFEATURED', 'CAR_SUSPENDED', 'CAR_DELETED', 'BOOKING_INTERVENED', 'BOOKING_CANCELLED_BY_ADMIN', 'PAYMENT_CONFIRMED_MANUAL', 'PAYMENT_REFUNDED', 'PAYOUT_APPROVED', 'PAYOUT_MARKED_PAID', 'PAYOUT_FAILED', 'PAYOUT_THRESHOLD_OVERRIDDEN', 'DEPOSIT_RELEASED', 'DEPOSIT_PARTIALLY_WITHHELD', 'DEPOSIT_FULLY_WITHHELD', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'DISPUTE_DISMISSED', 'REVIEW_REMOVED', 'OWNER_LOCATION_APPROVED', 'OWNER_LOCATION_REJECTED', 'SUBADMIN_CREATED', 'SUBADMIN_SUSPENDED', 'SUBADMIN_DELETED', 'SUBADMIN_ROLES_UPDATED', 'SUBSCRIPTION_OVERRIDDEN', 'CONDITION_PHOTOS_LOCKED', 'CONDITION_PHOTOS_UNLOCKED', 'PLATFORM_SETTINGS_UPDATED', 'COMMISSION_RATE_UPDATED', 'SUBSCRIPTION_PLAN_UPDATED', 'RECONCILIATION_ALERT_ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "ExtraChargeType" AS ENUM ('REFUELING_FEE', 'DAMAGE_FEE', 'LATE_RETURN_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtraChargeStatus" AS ENUM ('PENDING', 'COLLECTED', 'WAIVED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "nationalId" TEXT,
    "licenseNumber" TEXT,
    "licensePhoto" TEXT,
    "profilePhoto" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedAt" TIMESTAMP(3),
    "suspendedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "otpCode" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpLockedUntil" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_owner_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "momoNumber" TEXT,
    "bankName" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "onboardingStep" INTEGER NOT NULL DEFAULT 1,
    "isOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "avgResponseTimeMinutes" INTEGER,
    "totalCarsListed" INTEGER NOT NULL DEFAULT 0,
    "memberSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_owner_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_admin_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleModules" "AdminRoleModule"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "sub_admin_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cars" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "color" TEXT NOT NULL,
    "licensePlate" TEXT NOT NULL,
    "category" "CarCategory" NOT NULL,
    "fuelType" "FuelType" NOT NULL,
    "transmission" "TransmissionType" NOT NULL,
    "seatingCapacity" INTEGER NOT NULL,
    "status" "CarStatus" NOT NULL DEFAULT 'DRAFT',
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "adminNotes" TEXT,
    "rejectionReason" TEXT,
    "minBookingDays" INTEGER,
    "deliverAnywhere" BOOLEAN NOT NULL DEFAULT false,
    "deliveryFee" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "cars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "car_photos" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "car_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_matrices" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "perDayInCity" INTEGER NOT NULL,
    "perDayOutsideCity" INTEGER NOT NULL,
    "perWeekInCity" INTEGER NOT NULL,
    "perWeekOutsideCity" INTEGER NOT NULL,
    "perMonth" INTEGER NOT NULL,
    "driverEnabled" BOOLEAN NOT NULL DEFAULT false,
    "driverSurchargePerDay" INTEGER,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT false,
    "depositAmount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_policies" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "type" "FuelPolicyType" NOT NULL,
    "refuelingFee" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_blocks" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_locations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "neighborhoods" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT 'Kigali',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "neighborhoods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_locations" (
    "id" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "neighborhoodId" TEXT,
    "deliveryFee" INTEGER,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rentalType" "RentalType" NOT NULL,
    "tripScope" "TripScope",
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "driverRequested" BOOLEAN NOT NULL DEFAULT false,
    "totalDays" INTEGER NOT NULL,
    "baseRatePerDay" INTEGER NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "driverTotal" INTEGER NOT NULL DEFAULT 0,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL,
    "commissionRate" INTEGER NOT NULL DEFAULT 20,
    "commissionAmount" INTEGER NOT NULL,
    "ownerEarnings" INTEGER NOT NULL,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "isGuestBooking" BOOLEAN NOT NULL DEFAULT false,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "guestNationalId" TEXT,
    "guestLicenseNum" TEXT,
    "guestLicensePhoto" TEXT,
    "paymentConfirmedAt" TIMESTAMP(3),
    "ownerConfirmedAt" TIMESTAMP(3),
    "ownerRejectedAt" TIMESTAMP(3),
    "ownerRejectionReason" TEXT,
    "tripStartedAt" TIMESTAMP(3),
    "tripEndedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancellationReason" TEXT,
    "clientConfirmedReturn" BOOLEAN NOT NULL DEFAULT false,
    "clientReturnConfirmedAt" TIMESTAMP(3),
    "ownerConfirmedReturn" BOOLEAN NOT NULL DEFAULT false,
    "ownerReturnConfirmedAt" TIMESTAMP(3),
    "autoCompletedAt" TIMESTAMP(3),
    "autoConfirmedAt" TIMESTAMP(3),
    "reminderSmsSentAt" TIMESTAMP(3),
    "photoWarningSmsSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_locations" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "platformLocationId" TEXT,
    "ownerLocationId" TEXT,
    "customDescription" TEXT,
    "customLatitude" DOUBLE PRECISION,
    "customLongitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_condition_photos" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "isPreTrip" BOOLEAN NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "caption" TEXT,
    "isFuelGauge" BOOLEAN NOT NULL DEFAULT false,
    "retainUntil" TIMESTAMP(3),
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_condition_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "raisedById" TEXT NOT NULL,
    "type" "DisputeType" NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_resolutions" (
    "id" TEXT NOT NULL,
    "disputeId" TEXT NOT NULL,
    "resolvedById" TEXT NOT NULL,
    "outcome" "DisputeOutcome" NOT NULL,
    "notes" TEXT NOT NULL,
    "depositAction" "DepositStatus" NOT NULL,
    "clientRefundAmount" INTEGER NOT NULL DEFAULT 0,
    "ownerAwardAmount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_resolutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "rentalAmount" INTEGER NOT NULL,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "momoNumber" TEXT,
    "momoTransactionId" TEXT,
    "momoReference" TEXT,
    "failureReason" TEXT,
    "proofUrl" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "isRefund" BOOLEAN NOT NULL DEFAULT false,
    "originalPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "DepositStatus" NOT NULL DEFAULT 'HELD',
    "heldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "releaseTriggeredBy" TEXT,
    "releasedById" TEXT,
    "clientRefundAmount" INTEGER,
    "ownerAwardAmount" INTEGER,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_movements" (
    "id" TEXT NOT NULL,
    "depositId" TEXT NOT NULL,
    "fromStatus" "DepositStatus" NOT NULL,
    "toStatus" "DepositStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "baseAmount" INTEGER NOT NULL,
    "commissionAmount" INTEGER NOT NULL,
    "netOwnerAmount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING_REQUEST',
    "grossAmount" INTEGER NOT NULL,
    "commissionDeducted" INTEGER NOT NULL,
    "netAmount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "momoNumber" TEXT,
    "bankName" TEXT,
    "bankAccountNumber" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "proofUrl" TEXT,
    "referenceNumber" TEXT,
    "failureReason" TEXT,
    "requiresSuperAdminApproval" BOOLEAN NOT NULL DEFAULT false,
    "superAdminApprovedAt" TIMESTAMP(3),
    "superAdminApprovedById" TEXT,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_items" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extra_charges" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "ExtraChargeType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ExtraChargeStatus" NOT NULL DEFAULT 'PENDING',
    "raisedById" TEXT NOT NULL,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "waivedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extra_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "tier" "SubscriptionTier" NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "maxListings" INTEGER,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredPriority" INTEGER,
    "hasVerifiedBadge" BOOLEAN NOT NULL DEFAULT false,
    "analyticsLevel" TEXT NOT NULL DEFAULT 'BASIC',
    "hasHomepageBanner" BOOLEAN NOT NULL DEFAULT false,
    "hasPrioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "owner_subscriptions" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "renewedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "paymentMethod" "PaymentMethod",
    "paymentProofUrl" TEXT,
    "paymentConfirmedById" TEXT,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideById" TEXT,
    "overrideNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "carId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "cleanlinessRating" INTEGER NOT NULL,
    "comfortRating" INTEGER NOT NULL,
    "valueRating" INTEGER NOT NULL,
    "communicationRating" INTEGER NOT NULL,
    "overallRating" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "removedById" TEXT,
    "removedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_replies" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "messageId" TEXT,
    "status" TEXT,
    "cost" TEXT,
    "networkCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actionType" "AdminActionType" NOT NULL,
    "targetId" TEXT,
    "targetModel" TEXT,
    "targetUserId" TEXT,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_logs" (
    "id" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalCollected" INTEGER NOT NULL,
    "totalPaidOut" INTEGER NOT NULL,
    "totalCommission" INTEGER NOT NULL,
    "totalDepositsHeld" INTEGER NOT NULL,
    "totalDepositsReleased" INTEGER NOT NULL,
    "totalDepositsWithheld" INTEGER NOT NULL,
    "discrepancyAmount" INTEGER NOT NULL,
    "hasMismatch" BOOLEAN NOT NULL DEFAULT false,
    "mismatchAlertSentAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "car_owner_profiles_userId_key" ON "car_owner_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sub_admin_profiles_userId_key" ON "sub_admin_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "cars_licensePlate_key" ON "cars"("licensePlate");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_matrices_carId_key" ON "pricing_matrices"("carId");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_policies_carId_key" ON "fuel_policies"("carId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_locations_name_key" ON "platform_locations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "neighborhoods_name_key" ON "neighborhoods"("name");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_reference_key" ON "bookings"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "booking_locations_bookingId_key" ON "booking_locations"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "disputes_bookingId_key" ON "disputes"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "dispute_resolutions_disputeId_key" ON "dispute_resolutions"("disputeId");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_bookingId_key" ON "deposits"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_bookingId_key" ON "commissions"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_tier_key" ON "subscription_plans"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "review_replies_reviewId_key" ON "review_replies"("reviewId");

-- AddForeignKey
ALTER TABLE "car_owner_profiles" ADD CONSTRAINT "car_owner_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sub_admin_profiles" ADD CONSTRAINT "sub_admin_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "car_owner_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "car_photos" ADD CONSTRAINT "car_photos_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_matrices" ADD CONSTRAINT "pricing_matrices_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_policies" ADD CONSTRAINT "fuel_policies_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_blocks" ADD CONSTRAINT "availability_blocks_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_locations" ADD CONSTRAINT "owner_locations_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_locations" ADD CONSTRAINT "owner_locations_neighborhoodId_fkey" FOREIGN KEY ("neighborhoodId") REFERENCES "neighborhoods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_locations" ADD CONSTRAINT "booking_locations_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_locations" ADD CONSTRAINT "booking_locations_platformLocationId_fkey" FOREIGN KEY ("platformLocationId") REFERENCES "platform_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_locations" ADD CONSTRAINT "booking_locations_ownerLocationId_fkey" FOREIGN KEY ("ownerLocationId") REFERENCES "owner_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_condition_photos" ADD CONSTRAINT "booking_condition_photos_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_resolutions" ADD CONSTRAINT "dispute_resolutions_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_movements" ADD CONSTRAINT "deposit_movements_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "car_owner_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_items" ADD CONSTRAINT "payout_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extra_charges" ADD CONSTRAINT "extra_charges_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_subscriptions" ADD CONSTRAINT "owner_subscriptions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "car_owner_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "owner_subscriptions" ADD CONSTRAINT "owner_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_carId_fkey" FOREIGN KEY ("carId") REFERENCES "cars"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_replies" ADD CONSTRAINT "review_replies_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
