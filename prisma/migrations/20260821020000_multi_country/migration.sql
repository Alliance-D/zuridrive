-- One deployment, several markets.
--
-- Everything that differs between countries becomes data: currency, phone
-- format, commission, payout thresholds, payment provider. A second market is
-- then a row and a price list rather than a second deployment, which keeps the
-- brand and the supply pooled in one place.
--
-- Existing rows all default to Rwanda, which is where every car and every
-- booking already is, so nothing about the live market changes.

-- CreateTable
CREATE TABLE "countries" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "phonePrefix" TEXT NOT NULL,
    "phoneNationalDigits" INTEGER NOT NULL DEFAULT 9,
    "commissionRatePercent" INTEGER,
    "largePayoutThreshold" INTEGER NOT NULL DEFAULT 1000000,
    "paymentProvider" TEXT NOT NULL DEFAULT 'DIRECT',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- Seed the markets before the foreign keys land, or every existing car — which
-- now defaults to RW — would point at a country that does not exist.
--
-- Rwanda is live. The others are seeded and inactive: switching a market on is
-- meant to be a flag and a price list, not a migration. Uganda is next, and is
-- the cheapest of them: MTN Mobile Money runs there on the same API under a
-- separate account, and Africa's Talking already delivers SMS there.
INSERT INTO "countries"
  ("code","name","currency","phonePrefix","phoneNationalDigits",
   "largePayoutThreshold","paymentProvider","isActive","displayOrder",
   "createdAt","updatedAt")
VALUES
  ('RW','Rwanda',  'RWF','+250',9,   1000000,'MOMO',  true,  1, NOW(), NOW()),
  ('UG','Uganda',  'UGX','+256',9,  10000000,'MOMO',  false, 2, NOW(), NOW()),
  ('KE','Kenya',   'KES','+254',9,    300000,'DIRECT',false, 3, NOW(), NOW()),
  ('TZ','Tanzania','TZS','+255',9,   6000000,'DIRECT',false, 4, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
-- DropIndex
DROP INDEX "neighborhoods_name_city_key";

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RWF';

-- AlterTable
ALTER TABLE "cars" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'RW';

-- AlterTable
ALTER TABLE "commissions" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RWF';

-- AlterTable
ALTER TABLE "deposits" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RWF';

-- AlterTable
ALTER TABLE "extra_charges" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RWF';

-- AlterTable
ALTER TABLE "neighborhoods" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'RW';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RWF';

-- AlterTable
ALTER TABLE "payouts" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RWF';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "countryCode" TEXT;


-- CreateIndex
CREATE UNIQUE INDEX "neighborhoods_name_city_countryCode_key" ON "neighborhoods"("name", "city", "countryCode");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cars" ADD CONSTRAINT "cars_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

