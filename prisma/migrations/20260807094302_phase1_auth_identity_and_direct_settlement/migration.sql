-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'DIRECT';

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "guestLicenseNum",
DROP COLUMN "guestLicensePhoto",
DROP COLUMN "guestNationalId",
ADD COLUMN     "idCheckFailedReason" TEXT,
ADD COLUMN     "idCheckedByOwnerAt" TIMESTAMP(3),
ADD COLUMN     "licenceAttestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" DROP COLUMN "licenseNumber",
DROP COLUMN "licensePhoto",
DROP COLUMN "nationalId",
ADD COLUMN     "otpSendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpWindowStartedAt" TIMESTAMP(3),
ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

