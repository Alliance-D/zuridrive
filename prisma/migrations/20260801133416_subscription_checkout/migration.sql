-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "owner_subscriptions" ADD COLUMN     "momoNumber" TEXT,
ADD COLUMN     "momoReference" TEXT,
ADD COLUMN     "paymentConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "pricePaid" INTEGER,
ADD COLUMN     "rejectionReason" TEXT;
