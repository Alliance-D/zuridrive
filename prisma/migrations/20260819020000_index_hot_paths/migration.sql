-- Postgres does not index a foreign key just because it is one, and Prisma does
-- not add them either. Before this the only indexes on cars and bookings were
-- the primary keys, the unique constraints and the overlap exclusion — so the
-- browse page, an owner opening their fleet, "my bookings" and every cron sweep
-- were all sequential scans.
--
-- Invisible on the data volume that exists today. The point is that it stays
-- invisible: an index costs almost nothing to add now and is a bad thing to be
-- diagnosing later, under traffic, with real customers waiting.

-- CreateIndex
CREATE INDEX "bookings_carId_startDate_endDate_idx" ON "bookings"("carId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "bookings_clientId_idx" ON "bookings"("clientId");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_startDate_idx" ON "bookings"("startDate");

-- CreateIndex
CREATE INDEX "bookings_endDate_idx" ON "bookings"("endDate");

-- CreateIndex
CREATE INDEX "cars_status_isActive_idx" ON "cars"("status", "isActive");

-- CreateIndex
CREATE INDEX "cars_ownerId_idx" ON "cars"("ownerId");

