-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('INDIVIDUAL', 'COMPANY');

-- AlterTable
ALTER TABLE "car_owner_profiles" ADD COLUMN     "businessName" TEXT,
ADD COLUMN     "ownerType" "OwnerType" NOT NULL DEFAULT 'INDIVIDUAL',
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "tin" TEXT;
