-- The nightly reconciliation needs a notification type of its own, so a
-- discrepancy alert is not filed under a booking event.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RECONCILIATION_MISMATCH';
