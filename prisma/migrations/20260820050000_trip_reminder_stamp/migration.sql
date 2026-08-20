-- Stamped when the day-before trip reminder goes out. Every SMS is billed, so
-- a re-run or a retry must not be able to send the same reminder twice.
ALTER TABLE "bookings" ADD COLUMN "bookingReminderSmsSentAt" TIMESTAMP(3);
