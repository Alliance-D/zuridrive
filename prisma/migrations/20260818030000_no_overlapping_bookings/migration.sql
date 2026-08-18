-- Two people could book the same car for the same dates.
--
-- The booking route checked availability, then created the booking in a
-- separate transaction. Between those two steps another request could pass the
-- same check, and both would succeed: one car, two renters, both told yes.
-- Reproduced with two simultaneous requests before this was added.
--
-- Re-checking inside the transaction narrows the window but does not close it.
-- Under READ COMMITTED, two concurrent transactions each see a table without
-- the other's uncommitted row, so both still pass. Only the database can
-- settle this, so the rule lives here and the application cannot forget it.
--
-- tsrange rather than tstzrange: these columns are "timestamp without time
-- zone", and converting them to a zoned range is only STABLE, which an index
-- expression may not be.
--
-- btree_gist is what lets a plain equality column ("carId") sit in the same
-- exclusion constraint as a range.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_no_overlap"
  EXCLUDE USING gist (
    "carId" WITH =,
    tsrange("startDate", "endDate", '[]') WITH &&
  )
  -- Only states that actually occupy the car. This mirrors
  -- OCCUPYING_BOOKING_STATUSES in lib/booking/availability.ts; a cancelled or
  -- completed booking must never block a new one.
  WHERE (
    status IN (
      'PAYMENT_CONFIRMED',
      'AWAITING_OWNER_CONFIRMATION',
      'CONFIRMED',
      'ACTIVE'
    )
  );
