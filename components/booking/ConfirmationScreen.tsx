'use client'

/**
 * components/booking/ConfirmationScreen.tsx
 *
 * Animated booking confirmation screen.
 * Features:
 * - Checkmark draw animation on mount
 * - Full itemized booking summary
 * - Guest account creation message
 * - Next steps based on payment method
 * - "Add to calendar" and "View booking" CTAs
 */

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from "next/image";
import cloudinaryLoader from "@/lib/cloudinary-loader";
import { motion } from 'framer-motion'
import { CalendarDays, MapPin, Car, Phone, Copy, Check, ArrowRight, MessageSquare } from 'lucide-react'
import { Link } from "@/i18n/navigation";
import { formatMoney } from '@/lib/currency'

interface ConfirmationScreenProps {
  booking: {
    id: string
    reference: string
    status: string
    startDate: string
    endDate: string
    rentalType: string
    withDriver: boolean
    baseAmount: number
    driverSurchargeTotal: number
    deliveryFee: number
    subtotal: number
    depositAmount: number
    totalChargedNow: number
    paymentMethod: string
    car: {
      make: string
      model: string
      year: number
      coverPhotoUrl: string | null
      ownerName: string
      ownerPhone: string
    }
    client: {
      name: string
      phone: string
      isGuest: boolean
    }
    pickupLocation: string
  }
}

export function ConfirmationScreen({ booking }: ConfirmationScreenProps) {
  const t = useTranslations('confirmation')
  const [copied, setCopied] = useState(false)
  const isBankTransfer = booking.paymentMethod === 'BANK_TRANSFER'
  const isPending = booking.status === 'PENDING_PAYMENT'

  const startDate = new Date(booking.startDate)
  const endDate = new Date(booking.endDate)

  function copyRef() {
    navigator.clipboard.writeText(booking.reference)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-RW', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="min-h-screen bg-bone py-8 px-4">
      <div className="max-w-lg mx-auto space-y-5">

        {/* ── Animated success card ── */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-2xl p-8 text-center shadow-sm border border-stone-100"
        >
          {/* Animated checkmark */}
          <div className="relative w-24 h-24 mx-auto mb-6">
            <svg viewBox="0 0 100 100" className="w-24 h-24">
              {/* Background circle */}
              <motion.circle
                cx="50" cy="50" r="45"
                fill="#1B4332"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.4, ease: 'backOut' }}
                style={{ transformOrigin: '50% 50%' }}
              />
              {/* Checkmark path */}
              <motion.path
                d="M28 52 L43 67 L72 36"
                fill="none"
                stroke="white"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
              />
            </svg>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
          >
            <h1 className="text-2xl font-bold text-stone-900 mb-1">
              {isBankTransfer ? t("proofReceived") : t("bookingConfirmed")}
            </h1>
            <p className="text-stone-500 text-sm mb-5">
              {isBankTransfer ? t("bankIntro") : t("directIntro")}
            </p>

            {/* Booking reference */}
            <div className="inline-flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5">
              <span className="text-xs text-stone-500 font-medium">{t("bookingRef")}</span>
              <span className="text-base font-bold text-brand font-mono tracking-wider">
                {booking.reference}
              </span>
              <button onClick={copyRef} className="text-stone-400 hover:text-brand transition-colors ml-1">
                {copied ? <Check size={14} className="text-brand" /> : <Copy size={14} />}
              </button>
            </div>

            <p className="text-xs text-stone-400 mt-2">
              {t("saveReference")}
            </p>

            {/* Where the confirmation went ───────────────────────────────────
                A renter types their own number and nobody checks it. If it is
                wrong they get no confirmation, no reminder the day before, and
                no way to know why — they simply turn up, or do not.
                
                Showing the number back at the one moment they are paying
                attention costs nothing and catches a typo while it is still
                theirs to fix. Cheaper than verifying by SMS, and it catches
                the case that actually happens: a slip, not a fraud. */}
            <p className="mt-4 text-xs text-stone-500">
              {t("sentToNumber", { phone: booking.client.phone })}
              {" "}
              <Link
                href={`/dashboard/bookings/${booking.id}`}
                className="text-brand underline"
              >
                {t("wrongNumber")}
              </Link>
            </p>
          </motion.div>
        </motion.div>

        {/* ── Booking details ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden"
        >
          {/* Car summary */}
          <div className="flex items-center gap-4 p-5 border-b border-stone-100">
            {booking.car.coverPhotoUrl && (
              <Image
                loader={cloudinaryLoader}
                src={booking.car.coverPhotoUrl}
                alt={`${booking.car.make} ${booking.car.model}`}
                width={64}
                height={48}
                className="w-16 h-12 object-cover rounded-lg"
              />
            )}
            <div>
              <p className="font-semibold text-stone-900">
                {booking.car.year} {booking.car.make} {booking.car.model}
              </p>
              <p className="text-sm text-stone-500">
                {t("withOwner", { name: booking.car.ownerName })}
              </p>
            </div>
          </div>

          {/* Trip details */}
          <div className="p-5 space-y-3">
            <DetailRow
              icon={CalendarDays}
              label={t("pickup")}
              value={formatDate(startDate)}
            />
            <DetailRow
              icon={CalendarDays}
              label={t("return")}
              value={formatDate(endDate)}
            />
            <DetailRow
              icon={MapPin}
              label={t("location")}
              value={booking.pickupLocation}
            />
            {booking.withDriver && (
              <DetailRow
                icon={Car}
                label={t("driver")}
                value={t("driverIncluded")}
              />
            )}
          </div>

          {/* Price breakdown */}
          <div className="px-5 pb-5 space-y-1.5 border-t border-stone-100 pt-4">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">{t("paymentSummary")}</p>

            <PriceLine label={t("baseRental")} value={formatMoney(booking.baseAmount)} />
            {booking.driverSurchargeTotal > 0 && (
              <PriceLine label={t("driverSurcharge")} value={formatMoney(booking.driverSurchargeTotal)} />
            )}
            {booking.deliveryFee > 0 && (
              <PriceLine label={t("deliveryFee")} value={formatMoney(booking.deliveryFee)} />
            )}
            <PriceLine label={t("rentalSubtotal")} value={formatMoney(booking.subtotal)} bold />

            {booking.depositAmount > 0 && (
              <div className="flex justify-between items-center py-1.5 bg-amber-50 rounded-lg px-3 mt-2 border border-amber-100">
                <span className="text-xs text-amber-700 font-medium">{t("depositRefundable")}</span>
                <span className="text-xs font-bold text-amber-700">{formatMoney(booking.depositAmount)}</span>
              </div>
            )}

            <div className="border-t border-stone-100 pt-2 mt-2">
              <PriceLine label={t("totalCharged")} value={formatMoney(booking.totalChargedNow)} bold large />
            </div>
          </div>
        </motion.div>

        {/* ── Next steps ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85 }}
          className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100"
        >
          <h3 className="text-sm font-semibold text-stone-700 mb-4">{t("whatHappensNext")}</h3>
          <div className="space-y-3">
            {(isBankTransfer
              ? ['bankStep1', 'bankStep2', 'bankStep3', 'bankStep4']
              : ['directStep1', 'directStep2', 'directStep3', 'directStep4']
            ).map((stepKey, index) => (
              <div key={stepKey} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-brand/10 text-brand text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  {index + 1}
                </div>
                <p className="text-sm text-stone-600 leading-snug">{t(stepKey)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ── Guest account notice ── */}
        {booking.client.isGuest && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="bg-brand rounded-2xl p-5 text-white"
          >
            <div className="flex items-start gap-3">
              <MessageSquare size={20} className="text-green-300 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm mb-1">{t("accountCreated")}</p>
                <p className="text-green-200 text-xs leading-relaxed">
                  {t("accountCreatedBody", { phone: booking.client.phone })}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CTAs ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="flex flex-col sm:flex-row gap-3"
        >
          <Link
            href="/dashboard/bookings"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-brand text-white font-semibold hover:bg-brand-deep transition-colors text-sm"
          >
            {t("viewMyBookings")}
            <ArrowRight size={15} />
          </Link>
          <Link
            href="/cars"
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl border border-stone-300 text-stone-700 font-medium hover:border-stone-400 transition-colors text-sm"
          >
            {t("browseMoreCars")}
          </Link>
        </motion.div>

      </div>
    </div>
  )
}

// ─── Small helper components ──────────────────────────────────────────────────

function DetailRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-stone-500" />
      </div>
      <div>
        <p className="text-xs text-stone-400 font-medium">{label}</p>
        <p className="text-sm text-stone-800 font-medium leading-snug">{value}</p>
      </div>
    </div>
  )
}

function PriceLine({
  label,
  value,
  bold = false,
  large = false,
}: {
  label: string
  value: string
  bold?: boolean
  large?: boolean
}) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className={`${bold ? 'font-semibold text-stone-800' : 'text-stone-500'} text-sm`}>{label}</span>
      <span className={`${large ? 'text-base' : 'text-sm'} ${bold ? 'font-bold text-brand' : 'text-stone-800'}`}>
        {value}
      </span>
    </div>
  )
}
