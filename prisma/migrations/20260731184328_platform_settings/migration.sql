-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "commissionRatePercent" INTEGER NOT NULL DEFAULT 20,
    "largePayoutThreshold" INTEGER NOT NULL DEFAULT 1000000,
    "autoPublishListings" BOOLEAN NOT NULL DEFAULT false,
    "photoRetentionDays" INTEGER NOT NULL DEFAULT 3,
    "ownerConfirmWindowHours" INTEGER NOT NULL DEFAULT 2,
    "autoCompleteHours" INTEGER NOT NULL DEFAULT 48,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
