// =============================================================================
// ZuriDrive — Platform settings
//
// Backed by the PlatformSetting table (a single row, id "singleton"), editable
// by Super Admins at /admin/settings.
//
// Read through getPlatformSettings() rather than querying the table directly —
// it handles the missing-row case and caches within a request.
//
// IMPORTANT: changing the commission rate never rewrites history. Every
// Booking and Commission row snapshots the rate that applied when it was
// created, so past bookings keep their original figures.
// =============================================================================

import { prisma } from "@/lib/db";

/** The one row's primary key. */
export const SETTINGS_ID = "singleton";

// Defaults, used when the row doesn't exist yet and as form fallbacks.
export const DEFAULT_COMMISSION_RATE_PERCENT = 20;
export const DEFAULT_LARGE_PAYOUT_THRESHOLD = 1_000_000;
export const DEFAULT_PHOTO_RETENTION_DAYS = 3;
export const DEFAULT_OWNER_CONFIRM_WINDOW_HOURS = 2;
export const DEFAULT_AUTO_COMPLETE_HOURS = 48;
/** Cars an owner may list without an active subscription. */
export const DEFAULT_FREE_TIER_MAX_LISTINGS = 1;
/** Cancel inside this window and a fee applies. */
export const DEFAULT_LATE_CANCELLATION_WINDOW_HOURS = 24;
/** Share of the deposit kept when a late cancellation happens. */
export const DEFAULT_LATE_CANCELLATION_FEE_PERCENT = 50;

export interface PlatformSettings {
  commissionRatePercent: number;
  largePayoutThreshold: number;
  autoPublishListings: boolean;
  freeTierMaxListings: number;
  lateCancellationWindowHours: number;
  lateCancellationFeePercent: number;
  photoRetentionDays: number;
  ownerConfirmWindowHours: number;
  autoCompleteHours: number;
}

const DEFAULTS: PlatformSettings = {
  commissionRatePercent: DEFAULT_COMMISSION_RATE_PERCENT,
  largePayoutThreshold: DEFAULT_LARGE_PAYOUT_THRESHOLD,
  autoPublishListings: false,
  freeTierMaxListings: DEFAULT_FREE_TIER_MAX_LISTINGS,
  lateCancellationWindowHours: DEFAULT_LATE_CANCELLATION_WINDOW_HOURS,
  lateCancellationFeePercent: DEFAULT_LATE_CANCELLATION_FEE_PERCENT,
  photoRetentionDays: DEFAULT_PHOTO_RETENTION_DAYS,
  ownerConfirmWindowHours: DEFAULT_OWNER_CONFIRM_WINDOW_HOURS,
  autoCompleteHours: DEFAULT_AUTO_COMPLETE_HOURS,
};

/**
 * Current platform settings.
 *
 * Falls back to the defaults if the row is missing rather than throwing — a
 * booking must never fail because settings haven't been initialised.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!row) return DEFAULTS;

    return {
      commissionRatePercent: row.commissionRatePercent,
      largePayoutThreshold: row.largePayoutThreshold,
      autoPublishListings: row.autoPublishListings,
      freeTierMaxListings: row.freeTierMaxListings,
      lateCancellationWindowHours: row.lateCancellationWindowHours,
      lateCancellationFeePercent: row.lateCancellationFeePercent,
      photoRetentionDays: row.photoRetentionDays,
      ownerConfirmWindowHours: row.ownerConfirmWindowHours,
      autoCompleteHours: row.autoCompleteHours,
    };
  } catch (error) {
    // Never let a settings read break the operation that needed it.
    console.error("[PlatformSettings] Read failed, using defaults:", error);
    return DEFAULTS;
  }
}

/**
 * Reads settings, creating the row from defaults if it doesn't exist yet.
 * Used by the settings screen so the form always has a row to edit.
 */
export async function ensurePlatformSettings() {
  return prisma.platformSetting.upsert({
    where: { id: SETTINGS_ID },
    update: {},
    create: { id: SETTINGS_ID, ...DEFAULTS },
  });
}

/**
 * Bounds for each setting. Enforced by the API; the UI shows them as hints.
 * A commission rate of 90% or a 0-hour confirmation window would be a
 * catastrophic typo, so the range is deliberately conservative.
 */
export const SETTING_LIMITS = {
  commissionRatePercent: { min: 0, max: 50 },
  freeTierMaxListings: { min: 0, max: 20 },
  lateCancellationWindowHours: { min: 0, max: 168 },
  lateCancellationFeePercent: { min: 0, max: 100 },
  largePayoutThreshold: { min: 0, max: 100_000_000 },
  photoRetentionDays: { min: 1, max: 90 },
  ownerConfirmWindowHours: { min: 1, max: 72 },
  autoCompleteHours: { min: 1, max: 336 },
} as const;
