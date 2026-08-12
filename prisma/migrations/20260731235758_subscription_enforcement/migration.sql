-- AlterTable
ALTER TABLE "car_owner_profiles" ADD COLUMN     "hasVerifiedBadge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "searchPriority" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "freeTierMaxListings" INTEGER NOT NULL DEFAULT 1;
