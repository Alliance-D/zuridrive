-- Unfinished car listings, so a five-step form with photo uploads does not
-- lose everything to a dead battery or a mistapped back button.
--
-- Deliberately not a Car row with status DRAFT: a listing abandoned on step
-- one has no pricing, no photos and no plate, and making those columns
-- nullable to allow a half-built Car would weaken the constraints that keep
-- real listings sound.

-- CreateTable
CREATE TABLE "car_listing_drafts" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "form" JSONB NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "car_listing_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "car_listing_drafts_ownerId_key" ON "car_listing_drafts"("ownerId");

-- AddForeignKey
ALTER TABLE "car_listing_drafts" ADD CONSTRAINT "car_listing_drafts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "car_owner_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

