'use client'

/**
 * components/photos/PhotoUploadReminder.tsx
 *
 * A persistent reminder banner shown on the booking detail page
 * when condition photos haven't been uploaded yet.
 *
 * Shown when:
 * - Booking is CONFIRMED or ACTIVE
 * - The current user (client or owner) hasn't uploaded their pre-trip photos yet
 * - Or booking is ACTIVE and post-trip photos are needed
 *
 * Dismissible per session only — reappears next visit until photos are done.
 */

import { useState } from 'react'
import { useTranslations } from "next-intl";
import { Camera, X, ArrowRight, AlertCircle, Fuel } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface PhotoUploadReminderProps {
  bookingId: string
  viewerRole: 'CLIENT' | 'OWNER'
  bookingStatus: string
  phase: 'PRE_TRIP' | 'POST_TRIP'
  fuelGaugeRequired: boolean
  fuelPolicyType: string | null
  // How many of the required photos have been uploaded by this user
  uploadedCount: number
  requiredCount: number
  routePrefix: 'dashboard' | 'owner'
}

const FUEL_POLICY_LABELS: Record<string, string> = {
  FULL_TO_FULL: 'Full to Full',
  SAME_LEVEL: 'Same Level',
}

export function PhotoUploadReminder({
  bookingId,
  viewerRole,
  bookingStatus,
  phase,
  fuelGaugeRequired,
  fuelPolicyType,
  uploadedCount,
  requiredCount,
  routePrefix,
}: PhotoUploadReminderProps) {
  const t = useTranslations("photos");
  const [dismissed, setDismissed] = useState(false)

  // Don't show if all required photos are uploaded or dismissed
  if (dismissed || uploadedCount >= requiredCount) return null

  const remaining = requiredCount - uploadedCount
  const isPreTrip = phase === 'PRE_TRIP'
  const uploadUrl = `/${routePrefix}/bookings/${bookingId}/photos?phase=${phase}`

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className={`rounded-2xl border overflow-hidden ${
          isPreTrip
            ? 'bg-blue-50 border-blue-200'
            : 'bg-amber-50 border-amber-200'
        }`}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isPreTrip ? 'bg-blue-100' : 'bg-amber-100'
            }`}>
              <Camera size={18} className={isPreTrip ? 'text-blue-600' : 'text-amber-600'} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className={`text-sm font-semibold ${
                    isPreTrip ? 'text-blue-800' : 'text-amber-800'
                  }`}>
                    {isPreTrip ? 'Upload Pre-Trip Photos' : 'Upload Post-Trip Photos'}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    isPreTrip ? 'text-blue-600' : 'text-amber-600'
                  }`}>
                    {remaining} photo{remaining > 1 ? 's' : ''} still needed
                    {isPreTrip
                      ? ' — document the car condition before your trip starts'
                      : ' — required to confirm return and release your deposit'}
                  </p>
                </div>

                <button
                  onClick={() => setDismissed(true)}
                  className={`flex-shrink-0 p-1 rounded-lg hover:bg-black/5 transition-colors ${
                    isPreTrip ? 'text-blue-400' : 'text-amber-400'
                  }`}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Fuel gauge notice */}
              {fuelGaugeRequired && isPreTrip && fuelPolicyType && (
                <div className={`flex items-center gap-1.5 mt-2 text-xs ${
                  isPreTrip ? 'text-blue-600' : 'text-amber-600'
                }`}>
                  <Fuel size={11} />
                  <span>
                    Fuel gauge photo required ({FUEL_POLICY_LABELS[fuelPolicyType] ?? fuelPolicyType} policy)
                  </span>
                </div>
              )}

              {/* Progress bar */}
              <div className="mt-3 space-y-1">
                <div className={`h-1 rounded-full ${
                  isPreTrip ? 'bg-blue-100' : 'bg-amber-100'
                }`}>
                  <div
                    className={`h-full rounded-full transition-all ${
                      isPreTrip ? 'bg-blue-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${(uploadedCount / requiredCount) * 100}%` }}
                  />
                </div>
                <p className={`text-xs ${isPreTrip ? 'text-blue-500' : 'text-amber-500'}`}>
                  {uploadedCount}/{requiredCount} uploaded
                </p>
              </div>

              {/* CTA */}
              <Link
                href={uploadUrl}
                className={`
                  inline-flex items-center gap-1.5 mt-3 px-4 py-2 rounded-xl text-xs font-semibold
                  transition-colors
                  ${isPreTrip
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-amber-500 text-white hover:bg-amber-600'
                  }
                `}
              >
                <Camera size={12} />
                {t("uploadNow")}
                <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>

        {/* Urgency bar for post-trip */}
        {!isPreTrip && (
          <div className="bg-amber-100 border-t border-amber-200 px-4 py-2 flex items-center gap-2">
            <AlertCircle size={12} className="text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              {t("postTripNeeded")}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
