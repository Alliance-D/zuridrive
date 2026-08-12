-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "lateCancellationFeePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "lateCancellationWindowHours" INTEGER NOT NULL DEFAULT 24;
