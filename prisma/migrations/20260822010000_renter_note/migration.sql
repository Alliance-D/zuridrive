-- Somewhere for the renter to tell the owner what they need to know: a flight
-- number, a late arrival, a child seat. Without a field for it people find a
-- channel anyway, usually by putting a phone number somewhere it does not
-- belong.
ALTER TABLE "bookings" ADD COLUMN "renterNote" TEXT;

-- Flagged, never blocked. Renters and owners exchange numbers through the
-- platform legitimately, and a false positive on a flight number would be
-- infuriating. This exists so a pattern is visible if one appears.
ALTER TABLE "bookings" ADD COLUMN "renterNoteHasContact" BOOLEAN NOT NULL DEFAULT false;
