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
import { useTranslations } from 'next-intl'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, AlertTriangle, Clock, ChevronDown } from 'lucide-react'
import { useRouter } from "@/i18n/navigation";

interface ReturnConfirmPanelProps {
  bookingId: string
  bookingRef: string
  viewerRole: 'CLIENT' | 'OWNER'
  clientConfirmed: boolean
  ownerConfirmed: boolean
}

// Keys, not text — module scope has no translator.
const DISPUTE_CATEGORIES = [
  { id: 'DAMAGE',        labelKey: 'disputeDamage' },
  { id: 'FUEL_LEVEL',    labelKey: 'disputeFuel' },
  { id: 'MISSING_ITEMS', labelKey: 'disputeMissingItems' },
  { id: 'LATE_RETURN',   labelKey: 'disputeLateReturn' },
  { id: 'OTHER',         labelKey: 'disputeOther' },
]

export function ReturnConfirmPanel({
  bookingId,
  bookingRef,
  viewerRole,
  clientConfirmed,
  ownerConfirmed,
}: ReturnConfirmPanelProps) {
  const t = useTranslations('trip')
  const tc = useTranslations('common')
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
  const otherRole =
    viewerRole === 'CLIENT' ? t('roleOwner') : t('roleClient')

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
        setSuccessMessage(t('returnConfirmedWaiting', { role: otherRole }))
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

      setSuccessMessage(t('reportSubmitted'))
      setTimeout(() => router.refresh(), 2500)
    } catch (err: any) {
      setError(err.message ?? t('reportError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="bg-brand px-5 py-4">
        <p className="text-white font-semibold">{t('tripActions')}</p>
        <p className="text-green-200 text-xs mt-0.5">
          {t('bookingRefShort', { reference: bookingRef })}
        </p>
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
                <p className="text-sm font-semibold text-amber-800">
                  {t('waitingForRole', { role: otherRole })}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  {t('waitingForRoleBody', { role: otherRole })}
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
                  {t('roleConfirmedReturn', { role: otherRole })}
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  {t('pleaseConfirmToComplete')}
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
                {viewerRole === 'CLIENT'
                  ? t('iReturnedTheCar')
                  : t('carHasBeenReturned')}
              </span>
            </button>

            <button
              onClick={() => setShowDisputeForm(true)}
              disabled={loading}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors disabled:opacity-60"
            >
              <AlertTriangle size={22} />
              <span className="text-sm font-semibold leading-tight text-center">
                {t('reportProblem')}
              </span>
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
                <p className="text-sm font-semibold text-red-700">{t('reportProblem')}</p>
                <button
                  onClick={() => { setShowDisputeForm(false); setError(null) }}
                  className="text-xs text-stone-400 hover:text-stone-600"
                >
                  {tc('cancel')}
                </button>
              </div>

              {/* Category selector */}
              <div>
                <p className="text-sm font-medium text-stone-700 mb-2">{t('whatTypeOfIssue')}</p>
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
                      {t(cat.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  {t('describeTheIssue')}
                </label>
                <textarea
                  value={disputeDescription}
                  onChange={(e) => setDisputeDescription(e.target.value)}
                  placeholder={t('issueDetailPlaceholder')}
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-stone-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 transition-all"
                />
                <p className="text-xs text-stone-400 mt-1">
                  {t('charCount', { count: disputeDescription.length })}
                </p>
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
                {loading ? t('submitting') : t('submitReport')}
              </button>

              <p className="text-xs text-stone-400 text-center">
                {t('depositHeldPending')}
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
