'use client'

/**
 * components/trip/BookingDetailView.tsx
 *
 * Full booking detail view shown to both client and owner.
 * Adapts based on viewerRole — different CTAs, different context.
 *
 * Sections:
 * 1. Status banner + timeline
 * 2. Car + trip summary
 * 3. Active trip actions (return confirm / report problem)
 * 4. Deposit status card
 * 5. Condition photos
 * 6. Dispute info (if open)
 * 7. Review prompt (if completed + no review yet)
 */

import { useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import Image from "next/image";
import cloudinaryLoader from "@/lib/cloudinary-loader";
import { motion, AnimatePresence } from 'framer-motion'
import {
  Car, CalendarDays, MapPin, Fuel, CheckCircle2,
  AlertTriangle, Clock, ChevronDown, ChevronUp,
  Lock, Unlock, MessageSquare, Star, Phone
} from 'lucide-react'
import { formatMoney } from '@/lib/currency'
import { ReturnConfirmPanel } from './ReturnConfirmPanel'
import { DisputePanel } from './DisputePanel'
import { DepositStatusCard } from './DepositStatusCard'
import { BookingStatusTimeline } from './BookingStatusTimeline'
import { ConditionPhotoGrid } from './ConditionPhotoGrid'
import Link from 'next/link'

// Re-use the type from the server component
interface BookingDetailViewProps {
  booking: {
    id: string
    reference: string
    status: string
    rentalType: string
    tripScope: string | null
    startDate: string
    endDate: string
    withDriver: boolean
    baseAmount: number
    driverSurchargeTotal: number
    deliveryFee: number
    subtotal: number
    totalChargedNow: number
    clientConfirmedReturn: boolean
    ownerConfirmedReturn: boolean
    conditionPhotosDeleteAt: string | null
    car: {
      make: string
      model: string
      year: number
      coverPhotoUrl: string | null
      fuelPolicyType: string | null
      fuelRefuelFee: number | null
      ownerName: string
      ownerId: string
      ownerPhone: string
    }
    client: { id: string; name: string; phone: string }
    pickupLocation: string | null
    payment: { status: string; method: string; amount: number; confirmedAt: string | null } | null
    deposit: {
      id: string
      amount: number
      status: string
      releasedAt: string | null
      withheldAmount: number | null
      releasedAmount: number | null
      movements: Array<{ type: string; amount: number; reason: string; createdAt: string }>
    } | null
    conditionPhotos: Array<{ id: string; url: string; phase: string; uploadedBy: string; createdAt: string }>
    dispute: { id: string; category: string; description: string; status: string; openedAt: string } | null
    hasReviewed: boolean
    viewerRole: 'CLIENT' | 'OWNER'
  }
}

// Status display config
// labelKey, not label — module scope has no translator.
const STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  PENDING_PAYMENT:            { labelKey: 'statusPendingPayment',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',  icon: Clock },
  PAYMENT_CONFIRMED:          { labelKey: 'statusPaymentConfirmed', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',    icon: CheckCircle2 },
  AWAITING_OWNER_CONFIRMATION:{ labelKey: 'statusAwaitingOwner',    color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200',icon: Clock },
  CONFIRMED:                  { labelKey: 'statusConfirmed',        color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  icon: CheckCircle2 },
  ACTIVE:                     { labelKey: 'statusActive',           color: 'text-brand',      bg: 'bg-emerald-50 border-emerald-300', icon: Car },
  COMPLETED:                  { labelKey: 'statusCompleted',        color: 'text-stone-700',  bg: 'bg-stone-50 border-stone-200',  icon: CheckCircle2 },
  CANCELLED:                  { labelKey: 'statusCancelled',        color: 'text-red-700',    bg: 'bg-red-50 border-red-200',      icon: AlertTriangle },
  DISPUTED:                   { labelKey: 'statusDisputed',         color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200',icon: AlertTriangle },
}

export function BookingDetailView({ booking }: BookingDetailViewProps) {
  const t = useTranslations('trip')
  const te = useTranslations('enum')
  const locale = useLocale()
  const [showPricing, setShowPricing] = useState(false)
  const statusConfig = STATUS_CONFIG[booking.status] ?? STATUS_CONFIG.CONFIRMED
  const StatusIcon = statusConfig.icon

  const startDate = new Date(booking.startDate)
  const endDate = new Date(booking.endDate)
  const formatDate = (d: Date) =>
    d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })

  const isActive = booking.status === 'ACTIVE'
  const isCompleted = booking.status === 'COMPLETED'
  const isDisputed = booking.status === 'DISPUTED'

  return (
    <div className="min-h-screen bg-bone py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-4">

        {/* ── Status banner ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-2xl border px-5 py-4 flex items-center gap-3 ${statusConfig.bg}`}
        >
          <StatusIcon size={20} className={statusConfig.color} />
          <div className="flex-1">
            <p className={`font-semibold ${statusConfig.color}`}>
              {t(statusConfig.labelKey)}
            </p>
            <p className="text-xs text-stone-500 mt-0.5">
              {t('bookingRef', { reference: booking.reference })}
            </p>
          </div>
        </motion.div>

        {/* ── Status timeline ── */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <BookingStatusTimeline status={booking.status} />
        </div>

        {/* ── Car + trip summary ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden"
        >
          {/* Car header */}
          <div className="flex items-center gap-4 p-5 border-b border-stone-100">
            {booking.car.coverPhotoUrl ? (
              <Image
                loader={cloudinaryLoader}
                src={booking.car.coverPhotoUrl}
                alt={`${booking.car.make} ${booking.car.model}`}
                width={80}
                height={56}
                className="w-20 h-14 object-cover rounded-xl"
              />
            ) : (
              <div className="w-20 h-14 bg-stone-100 rounded-xl flex items-center justify-center">
                <Car size={24} className="text-stone-300" />
              </div>
            )}
            <div className="flex-1">
              <p className="font-bold text-stone-900 text-lg">
                {booking.car.year} {booking.car.make} {booking.car.model}
              </p>
              <p className="text-sm text-stone-500">
                {booking.viewerRole === 'CLIENT'
                  ? t('ownerLabel', { name: booking.car.ownerName })
                  : t('clientLabel', { name: booking.client.name })}
              </p>
              {/* Contact button */}
              <a
                href={`tel:${booking.viewerRole === 'CLIENT' ? booking.car.ownerPhone : booking.client.phone}`}
                className="inline-flex items-center gap-1.5 text-xs text-brand font-medium mt-1 hover:underline"
              >
                <Phone size={11} />
                {booking.viewerRole === 'CLIENT' ? t('callOwner') : t('callClient')}
              </a>
            </div>
          </div>

          {/* Trip details */}
          <div className="p-5 space-y-3">
            <TripRow icon={CalendarDays} label={t('rowPickup')} value={formatDate(startDate)} />
            <TripRow icon={CalendarDays} label={t('rowReturn')} value={formatDate(endDate)} />
            {booking.pickupLocation && (
              <TripRow icon={MapPin} label={t('rowLocation')} value={booking.pickupLocation} />
            )}
            {booking.car.fuelPolicyType && (
              <TripRow
                icon={Fuel}
                label={t('rowFuelPolicy')}
                value={te(`fuelPolicyLong.${booking.car.fuelPolicyType}` as never)}
              />
            )}
            {booking.withDriver && (
              <TripRow icon={Car} label={t('rowDriver')} value={t('driverIncluded')} />
            )}
          </div>

          {/* Collapsible pricing */}
          <div className="border-t border-stone-100">
            <button
              onClick={() => setShowPricing((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
            >
              <span>{t('paymentBreakdown')}</span>
              {showPricing ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <AnimatePresence>
              {showPricing && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-5 pb-5 space-y-1.5">
                    <PriceRow label={t('baseRental')} value={formatMoney(booking.baseAmount)} />
                    {booking.driverSurchargeTotal > 0 && (
                      <PriceRow label={t('driverSurcharge')} value={formatMoney(booking.driverSurchargeTotal)} />
                    )}
                    {booking.deliveryFee > 0 && (
                      <PriceRow label={t('delivery')} value={formatMoney(booking.deliveryFee)} />
                    )}
                    <PriceRow label={t('subtotal')} value={formatMoney(booking.subtotal)} bold />
                    {booking.deposit && (
                      <PriceRow
                        label={t('depositRefundable')}
                        value={formatMoney(booking.deposit.amount)}
                        muted
                      />
                    )}
                    <div className="border-t border-stone-100 pt-1.5">
                      <PriceRow label={t('totalCharged')} value={formatMoney(booking.totalChargedNow)} bold large />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        {/* ── Active trip action panel ── */}
        {isActive && !isDisputed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <ReturnConfirmPanel
              bookingId={booking.id}
              bookingRef={booking.reference}
              viewerRole={booking.viewerRole}
              clientConfirmed={booking.clientConfirmedReturn}
              ownerConfirmed={booking.ownerConfirmedReturn}
            />
          </motion.div>
        )}

        {/* ── Dispute info ── */}
        {(isDisputed || booking.dispute) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
          >
            <DisputePanel dispute={booking.dispute!} viewerRole={booking.viewerRole} />
          </motion.div>
        )}

        {/* ── Deposit status ── */}
        {booking.deposit && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <DepositStatusCard deposit={booking.deposit} />
          </motion.div>
        )}

        {/* ── Condition photos ── */}
        {booking.conditionPhotos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <ConditionPhotoGrid
              photos={booking.conditionPhotos}
              deleteAt={booking.conditionPhotosDeleteAt}
            />
          </motion.div>
        )}

        {/* ── Review prompt ── */}
        {isCompleted && !booking.hasReviewed && booking.viewerRole === 'CLIENT' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-brand rounded-2xl p-5 text-white"
          >
            <div className="flex items-start gap-3">
              <Star size={20} className="text-accent flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm mb-1">{t('howWasTrip')}</p>
                <p className="text-green-200 text-xs mb-3">
                  {t('reviewHelps')}
                </p>
                <Link
                  href={`/dashboard/bookings/${booking.id}/review`}
                  className="inline-flex items-center gap-1.5 bg-accent text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-accent-deep transition-colors"
                >
                  <Star size={12} />
                  {t('leaveReview')}
                </Link>
              </div>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  )
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function TripRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
        <Icon size={13} className="text-stone-500" />
      </div>
      <div>
        <p className="text-xs text-stone-400 font-medium">{label}</p>
        <p className="text-sm text-stone-800 font-medium">{value}</p>
      </div>
    </div>
  )
}

function PriceRow({
  label, value, bold = false, large = false, muted = false,
}: {
  label: string; value: string; bold?: boolean; large?: boolean; muted?: boolean
}) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className={`text-sm ${bold ? 'font-semibold text-stone-800' : muted ? 'text-amber-700' : 'text-stone-500'}`}>
        {label}
      </span>
      <span className={`${large ? 'text-base' : 'text-sm'} ${bold ? 'font-bold text-brand' : muted ? 'text-amber-700 font-medium' : 'text-stone-800'}`}>
        {value}
      </span>
    </div>
  )
}

