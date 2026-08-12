'use client'

/**
 * components/trip/ReturnConfirmPanel.tsx
 *
 * The primary action panel shown during an ACTIVE booking.
 * Shown to BOTH client and owner — content adapts per role.
 *
 * States:
 * 1. Neither confirmed → "Confirm Return" + "Report a Problem" buttons
 * 2. Current user confirmed, waiting for other → "Waiting" state
 * 3. Other confirmed, current user hasn't → "The other party confirmed. Your turn."
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Clock, ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'

interface ReturnConfirmPanelProps {
  bookingId: string
  bookingRef: string
  viewerRole: 'CLIENT' | 'OWNER'
  clientConfirmed: boolean
  ownerConfirmed: boolean
}

const DISPUTE_CATEGORIES = [
  { id: 'DAMAGE',        label: 'Vehicle Damage' },
  { id: 'FUEL_LEVEL',    label: 'Fuel Level Issue' },
  { id: 'MISSING_ITEMS', label: 'Missing Items' },
  { id: 'LATE_RETURN',   label: 'Late Return' },
  { id: 'OTHER',         label: 'Other Issue' },
]

export function ReturnConfirmPanel({
  bookingId,
  bookingRef,
  viewerRole,
  clientConfirmed,
  ownerConfirmed,
}: ReturnConfirmPanelProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showDisputeForm, setShowDisputeForm] = useState(false)
  const [disputeCategory, setDisputeCategory] = useState('')
  const [disputeDescription, setDisputeDescription] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Determine current viewer's confirmation status
  const viewerConfirmed = viewerRole === 'CLIENT' ? clientConfirmed : ownerConfirmed
  const otherConfirmed = viewerRole === 'CLIENT' ? ownerConfirmed : clientConfirmed
  const otherRole = viewerRole === 'CLIENT' ? 'owner' : 'client'

  async function handleConfirmReturn() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm_return' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.status === 'COMPLETED') {
        setSuccessMessage('Trip completed! Your deposit has been released.')
        setTimeout(() => router.refresh(), 2000)
      } else {
        setSuccessMessage(`Return confirmed. Waiting for the ${otherRole} to confirm.`)
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReportProblem() {
    if (!disputeCategory) {
      setError('Please select a problem category.')
      return
    }
    if (disputeDescription.trim().length < 10) {
      setError('Please describe the issue in at least 10 characters.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report_problem',
          category: disputeCategory,
          description: disputeDescription,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccessMessage('Your report has been submitted. Our team will review within 24 hours.')
      setTimeout(() => router.refresh(), 2500)
    } catch (err: any) {
      setError(err.message ?? 'Could not submit report. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="bg-brand px-5 py-4">
        <p className="text-white font-semibold">Trip Actions</p>
        <p className="text-green-200 text-xs mt-0.5">Booking {bookingRef}</p>
      </div>

      <div className="p-5 space-y-4">
        <AnimatePresence mode="wait">
          {/* Success state */}
          {successMessage && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl p-4"
            >
              <CheckCircle2 size={20} className="text-brand" />
              <p className="text-sm text-brand font-medium">{successMessage}</p>
            </motion.div>
          )}

          {/* Already confirmed by viewer */}
          {!successMessage && viewerConfirmed && !otherConfirmed && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4"
            >
              <Clock size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Waiting for {otherRole}</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  You&apos;ve confirmed the return. The {otherRole} has been notified.
                  If they don&apos;t confirm within 48 hours, the booking will auto-complete.
                </p>
              </div>
            </motion.div>
          )}

          {/* Other party confirmed, viewer's turn */}
          {!successMessage && otherConfirmed && !viewerConfirmed && (
            <motion.div
              key="other-confirmed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4"
            >
              <CheckCircle2 size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-800">
                  The {otherRole} has confirmed the return
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Please confirm to complete the trip and release the deposit.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action buttons — shown when viewer hasn't confirmed yet */}
        {!successMessage && !viewerConfirmed && !showDisputeForm && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleConfirmReturn}
              disabled={loading}
              className="flex flex-col items-center gap-2 p-4 rounded-xl bg-brand text-white hover:bg-brand-deep transition-colors disabled:opacity-60"
            >
              <CheckCircle2 size={22} />
              <span className="text-sm font-semibold leading-tight text-center">
                {viewerRole === 'CLIENT' ? 'I Returned the Car' : 'Car Has Been Returned'}
              </span>
            </button>

            <button
              onClick={() => setShowDisputeForm(true)}
              disabled={loading}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-60"
            >
              <AlertTriangle size={22} />
              <span className="text-sm font-semibold leading-tight text-center">Report a Problem</span>
            </button>
          </div>
        )}

        {/* Dispute form */}
        <AnimatePresence>
          {showDisputeForm && !successMessage && (
            <motion.div
              key="dispute-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-red-700">Report a Problem</p>
                <button
                  onClick={() => { setShowDisputeForm(false); setError(null) }}
                  className="text-xs text-stone-400 hover:text-stone-600"
                >
                  Cancel
                </button>
              </div>

              {/* Category selector */}
              <div>
                <p className="text-sm font-medium text-stone-700 mb-2">What type of issue?</p>
                <div className="grid grid-cols-1 gap-2">
                  {DISPUTE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setDisputeCategory(cat.id)}
                      className={`
                        text-left px-3 py-2.5 rounded-lg border text-sm transition-all
                        ${disputeCategory === cat.id
                          ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                          : 'border-stone-200 text-stone-700 hover:border-stone-300'
                        }
                      `}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Describe the issue
                </label>
                <textarea
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  placeholder="Please provide as much detail as possible. Include what happened, when, and any evidence you have."
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-stone-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                />
                <p className="text-xs text-stone-400 mt-1">{disputeDescription.length}/2000 characters</p>
              </div>

              {error && (
                <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                  {error}
                </p>
              )}

              <button
                onClick={handleReportProblem}
                disabled={loading}
                className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
              >
                {loading ? 'Submitting...' : 'Submit Report'}
              </button>

              <p className="text-xs text-stone-400 text-center">
                Your deposit will be held pending admin review. Both parties will be contacted.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error display outside dispute form */}
        {error && !showDisputeForm && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
