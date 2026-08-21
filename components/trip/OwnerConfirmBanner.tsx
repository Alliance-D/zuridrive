'use client'

/**
 * components/trip/OwnerConfirmBanner.tsx
 *
 * Sticky banner shown to owner when booking is AWAITING_OWNER_CONFIRMATION.
 * Shows: client name, dates, amount, 2-hour countdown timer.
 * Actions: Accept or Reject (with optional reason).
 */

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, XCircle, Clock, ChevronDown } from 'lucide-react'
import { formatMoney } from '@/lib/currency'

interface OwnerConfirmBannerProps {
  bookingId: string
  bookingRef: string
  clientName: string
  startDate: string
  endDate: string
  totalAmount: number
}

export function OwnerConfirmBanner({
  bookingId,
  bookingRef,
  clientName,
  startDate,
  endDate,
  totalAmount,
}: OwnerConfirmBannerProps) {
  const t = useTranslations('trip')
  const tc = useTranslations('common')
  const locale = useLocale()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 2-hour countdown from page load (approximate — real cutoff is tracked server-side)
  const [secondsLeft, setSecondsLeft] = useState(2 * 60 * 60)
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const hours = Math.floor(secondsLeft / 3600)
  const minutes = Math.floor((secondsLeft % 3600) / 60)
  const seconds = secondsLeft % 60
  const countdownStr = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  const isUrgent = secondsLeft < 30 * 60 // under 30 minutes = red

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-RW', {
      weekday: 'short', day: 'numeric', month: 'short',
    })

  async function handleAccept() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'accept' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/bookings/${bookingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', rejectReason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      router.refresh()
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 bg-white border-b-2 border-accent shadow-md"
    >
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-bold text-stone-900">
              {t('newBookingRequest', { reference: bookingRef })}
            </p>
            <p className="text-sm text-stone-600">
              {clientName} · {formatDate(startDate)} → {formatDate(endDate)} · {formatMoney(totalAmount)}
            </p>
          </div>

          {/* Countdown */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border font-mono text-sm font-bold
            ${isUrgent
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
            }`}
          >
            <Clock size={13} />
            {countdownStr}
          </div>
        </div>

        <p className="text-xs text-stone-500">
          {t('autoConfirmNote')}
        </p>

        {/* Action buttons */}
        {!showRejectForm && (
          <div className="flex gap-3">
            <button
              onClick={handleAccept}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-deep transition-colors disabled:opacity-60 text-sm"
            >
              <CheckCircle2 size={16} />
              {t('acceptBooking')}
            </button>
            <button
              onClick={() => setShowRejectForm(true)}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 font-semibold hover:bg-red-50 transition-colors disabled:opacity-60 text-sm"
            >
              <XCircle size={16} />
              {t('decline')}
            </button>
          </div>
        )}

        {/* Reject form */}
        <AnimatePresence>
          {showRejectForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3"
            >
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  {t('reasonForDeclining')}
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder={t('declinePlaceholder')}
                  rows={2}
                  className="w-full px-3 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-900 resize-none focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 transition-colors disabled:opacity-60 text-sm"
                >
                  {loading ? t('declining') : t('confirmDecline')}
                </button>
                <button
                  onClick={() => { setShowRejectForm(false); setError(null) }}
                  className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-600 text-sm hover:border-stone-400 transition-colors"
                >
                  {tc('cancel')}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>
    </motion.div>
  )
}
