'use client'

/**
 * app/book/[carId]/payment/page.tsx
 *
 * Payment processing page — shown after booking is created.
 * Two flows:
 *   MoMo: polls /api/bookings/[id]/payment every 5s for USSD confirmation
 *   Bank:  shows upload form for proof of payment
 *
 * On success: redirects to /book/[carId]/confirmation?bookingId=XXX
 */

import { useEffect, useState, useRef } from 'react'
import { formatRWF } from '@/lib/currency'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone, Upload, Check, X, Clock, RefreshCw } from 'lucide-react'

type PaymentStatus = 'POLLING' | 'CONFIRMED' | 'FAILED' | 'UPLOADING' | 'UPLOADED'

export default function PaymentPage({ params }: { params: { carId: string } }) {
  const router = useRouter()
  const { carId } = params
  const searchParams = useSearchParams()
  const bookingId = searchParams.get('bookingId')
  const method = searchParams.get('method') as 'MTN_MOMO' | 'BANK_TRANSFER'

  const [status, setStatus] = useState<PaymentStatus>(method === 'MTN_MOMO' ? 'POLLING' : 'UPLOADING')
  const [secondsElapsed, setSecondsElapsed] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // What the renter is actually being asked to approve. Comes from the poll
  // response; until it arrives the sentence simply omits the figure rather
  // than showing a placeholder.
  const [amount, setAmount] = useState<number | null>(null)

  const pollRef = useRef<NodeJS.Timeout | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // The 3-minute timeout below fires long after the effect that scheduled it.
  // Reading `status` from that closure would give the value it had when
  // polling started, so a payment that has since been declined — or confirmed
  // — would still be reported as a timeout. This ref always holds the live one.
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])

  // ─── MoMo polling ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (method !== 'MTN_MOMO' || !bookingId) return

    // Timer
    timerRef.current = setInterval(() => setSecondsElapsed((s) => s + 1), 1000)

    // Poll payment status every 5 seconds
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/bookings/${bookingId}/payment`)
        const data = await res.json()
        if (typeof data.totalAmount === 'number') setAmount(data.totalAmount)

        if (data.paymentStatus === 'CONFIRMED' || data.bookingStatus === 'AWAITING_OWNER_CONFIRMATION') {
          clearInterval(pollRef.current!)
          clearInterval(timerRef.current!)
          setStatus('CONFIRMED')
          setTimeout(() => {
            router.push(`/book/${carId}/confirmation?bookingId=${bookingId}`)
          }, 2000)
        } else if (data.paymentStatus === 'FAILED') {
          clearInterval(pollRef.current!)
          clearInterval(timerRef.current!)
          setStatus('FAILED')
          setErrorMessage('Payment was declined or timed out. Please try again.')
        }
      } catch {
        // Network error — keep polling
      }
    }, 5000)

    // Timeout after 3 minutes
    const timeout = setTimeout(() => {
      clearInterval(pollRef.current!)
      clearInterval(timerRef.current!)
      if (statusRef.current === 'POLLING') {
        setStatus('FAILED')
        setErrorMessage('Payment confirmation timed out. If your money was deducted, please contact support.')
      }
    }, 3 * 60 * 1000)

    return () => {
      clearInterval(pollRef.current!)
      clearInterval(timerRef.current!)
      clearTimeout(timeout)
    }
  }, [method, bookingId, carId, router])

  // ─── Bank transfer proof upload ─────────────────────────────────────────────
  async function handleProofUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setProofFile(file)
  }

  async function submitBankProof() {
    if (!proofFile || !bookingId) return
    setUploading(true)

    try {
      // Upload proof to Cloudinary
      const formData = new FormData()
      formData.append('file', proofFile)
      formData.append('folder', 'bank_proofs')
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()

      if (!uploadData.url) throw new Error('Upload failed')

      // Submit proof to booking payment endpoint
      const res = await fetch(`/api/bookings/${bookingId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bank_transfer', proofUrl: uploadData.url }),
      })

      if (res.ok) {
        setStatus('UPLOADED')
        setTimeout(() => {
          router.push(`/book/${params.carId}/confirmation?bookingId=${bookingId}&method=bank`)
        }, 2500)
      } else {
        throw new Error('Submission failed')
      }
    } catch {
      setErrorMessage('Could not submit your proof. Please try again.')
    } finally {
      setUploading(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  // Without a bookingId there is no payment to show. This page rendered an
  // entirely empty <main> in that case — a blank white screen with no
  // explanation, which is what a renter saw if they refreshed, hit back, or
  // opened a stale link.
  if (!bookingId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bone p-4">
        <div className="max-w-md rounded-2xl border border-sand-light bg-white p-8 text-center shadow-sm">
          <h1 className="mb-2 text-xl font-bold text-ink">
            We couldn&apos;t find that payment
          </h1>
          <p className="mb-6 text-fluid-sm leading-relaxed text-ink-soft">
            The link may have expired, or the booking was never started. Your
            card has not been charged.
          </p>
          <a
            href={`/book/${carId}`}
            className="btn btn-primary"
          >
            Start again
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bone flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">

          {/* MoMo polling state */}
          {method === 'MTN_MOMO' && status === 'POLLING' && (
            <motion.div
              key="polling"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-8 text-center shadow-sm border border-stone-100"
            >
              <div className="relative w-20 h-20 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-yellow-200 animate-ping opacity-50" />
                <div className="w-20 h-20 rounded-full bg-yellow-50 border-4 border-accent flex items-center justify-center">
                  <Smartphone size={32} className="text-accent" />
                </div>
              </div>

              <h2 className="text-xl font-bold text-stone-900 mb-2">Waiting for Payment</h2>
              <p className="text-stone-600 text-sm leading-relaxed mb-6">
                A payment prompt has been sent to your phone. Please open it and
                approve{' '}
                {amount !== null ? (
                  <>
                    the payment of{' '}
                    <strong className="text-brand">{formatRWF(amount)}</strong>{' '}
                  </>
                ) : (
                  'the payment '
                )}
                to confirm your booking.
              </p>

              <div className="flex items-center justify-center gap-2 text-stone-400 text-sm">
                <Clock size={14} />
                <span>Waiting... {Math.floor(secondsElapsed / 60)}:{String(secondsElapsed % 60).padStart(2, '0')}</span>
              </div>

              <p className="text-xs text-stone-400 mt-4">
                Didn&apos;t get the prompt?{' '}
                <button
                  onClick={() => router.push(`/book/${params.carId}?bookingId=${bookingId}`)}
                  className="text-brand underline"
                >
                  Try a different payment method
                </button>
              </p>
            </motion.div>
          )}

          {/* Payment confirmed */}
          {status === 'CONFIRMED' && (
            <motion.div
              key="confirmed"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-8 text-center shadow-sm border border-stone-100"
            >
              <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center mx-auto mb-6">
                <Check size={36} className="text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold text-stone-900 mb-2">Payment Confirmed!</h2>
              <p className="text-stone-500 text-sm">Redirecting to your booking confirmation...</p>
            </motion.div>
          )}

          {/* Payment failed */}
          {status === 'FAILED' && (
            <motion.div
              key="failed"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-8 text-center shadow-sm border border-stone-100"
            >
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-6">
                <X size={36} className="text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-stone-900 mb-2">Payment Failed</h2>
              <p className="text-stone-500 text-sm mb-6">{errorMessage}</p>
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 mx-auto px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-brand-deep transition-colors"
              >
                <RefreshCw size={15} />
                Try Again
              </button>
            </motion.div>
          )}

          {/* Bank transfer upload */}
          {method === 'BANK_TRANSFER' && status === 'UPLOADING' && (
            <motion.div
              key="bank"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 rounded-full bg-blue-50 border-2 border-blue-200 flex items-center justify-center mx-auto mb-4">
                  <Upload size={24} className="text-blue-500" />
                </div>
                <h2 className="text-xl font-bold text-stone-900">Upload Transfer Proof</h2>
                <p className="text-stone-500 text-sm mt-1">
                  Upload your bank transfer receipt or screenshot
                </p>
              </div>

              {!proofFile ? (
                <label className="
                  flex flex-col items-center gap-3 p-8 border-2 border-dashed border-stone-200
                  rounded-xl cursor-pointer hover:border-brand/50 transition-all
                ">
                  <Upload size={24} className="text-stone-300" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-stone-700">Click to upload</p>
                    <p className="text-xs text-stone-400">JPG, PNG or PDF · max 5MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleProofUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <Check size={16} className="text-brand" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-brand truncate">{proofFile.name}</p>
                      <p className="text-xs text-stone-500">{(proofFile.size / 1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => setProofFile(null)} className="text-stone-400 hover:text-red-500">
                      <X size={14} />
                    </button>
                  </div>

                  <button
                    onClick={submitBankProof}
                    disabled={uploading}
                    className="w-full py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-deep transition-colors disabled:opacity-60"
                  >
                    {uploading ? 'Submitting...' : 'Submit Proof of Payment'}
                  </button>
                </div>
              )}

              {errorMessage && (
                <p className="text-red-500 text-sm text-center mt-4">{errorMessage}</p>
              )}
            </motion.div>
          )}

          {/* Bank proof uploaded */}
          {status === 'UPLOADED' && (
            <motion.div
              key="uploaded"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-2xl p-8 text-center shadow-sm border border-stone-100"
            >
              <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center mx-auto mb-6">
                <Check size={36} className="text-white" strokeWidth={2.5} />
              </div>
              <h2 className="text-xl font-bold text-stone-900 mb-2">Proof Received!</h2>
              <p className="text-stone-500 text-sm">
                Our finance team will confirm your payment within a few hours.
                Redirecting to your booking summary...
              </p>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
