'use client'

/**
 * components/booking/PriceBreakdown.tsx
 *
 * Real-time itemized price breakdown.
 * Updates instantly on every selection change — no debounce needed
 * since calculateBookingPrice is a pure function.
 *
 * Financial display rules:
 * - Deposit shown as a separate line — never mixed with rental
 * - Commission never shown to clients (internal only)
 * - All values formatted as RWF 15,000
 */

import { formatRWF } from '@/lib/currency'
import { useTranslations } from 'next-intl'
import { getDepositCopy } from '@/lib/deposit-copy';
import { CalendarDays } from 'lucide-react';
import type { PricingBreakdown } from '@/lib/booking/pricing'
import { Info, Lock } from 'lucide-react'

interface PriceBreakdownProps {
  pricing: PricingBreakdown | null
  car: {
    make: string
    model: string
    year: number
    pricing: { depositEnabled: boolean; depositAmount: number } | null
  }
  form: {
    rentalType: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH'
    tripScope: 'IN_CITY' | 'OUTSIDE_CITY' | null
    startDate: Date | null
    endDate: Date | null
    withDriver: boolean
  }
}

export function PriceBreakdown({ pricing, car, form }: PriceBreakdownProps) {
  // Client component, so read the browser-side mirror.
  const depositCopy = getDepositCopy({ client: true });
  const t = useTranslations('booking')
  const td = useTranslations('deposit')
  const hasDates = form.startDate && form.endDate

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      {/* Header */}
      <div className="bg-brand px-5 py-4">
        <p className="text-white font-semibold text-sm">{t("priceSummary")}</p>
        <p className="text-green-200 text-xs mt-0.5">{car.year} {car.make} {car.model}</p>
      </div>

      <div className="px-5 py-4 space-y-1">
        {!hasDates ? (
          <div className="py-6 text-center">
            <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CalendarDays className="h-6 w-6 text-brand" aria-hidden />
            </div>
            <p className="text-stone-500 text-sm">{t("selectDatesForPricing")}</p>
          </div>
        ) : !pricing ? (
          /* Skeleton while calculating */
          <div className="space-y-3 py-2 animate-pulse">
            {[80, 60, 70].map((w, i) => (
              <div key={i} className="flex justify-between items-center">
                <div className={`h-3 bg-stone-200 rounded w-${w === 80 ? '32' : w === 60 ? '24' : '28'}`} />
                <div className="h-3 bg-stone-200 rounded w-20" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Base rate */}
            <LineItem
              label={`Base rate (${pricing.baseRateLabel})`}
              value={formatRWF(pricing.baseAmount)}
            />

            {/* Driver surcharge */}
            {pricing.driverSurchargeTotal > 0 && (
              <LineItem
                label={`Driver (${pricing.driverSurchargeLabel})`}
                value={formatRWF(pricing.driverSurchargeTotal)}
              />
            )}

            {/* Delivery fee */}
            {pricing.deliveryFee > 0 && (
              <LineItem
                label="Delivery fee"
                value={formatRWF(pricing.deliveryFee)}
              />
            )}

            {/* Subtotal divider */}
            <div className="border-t border-stone-100 my-2 pt-2">
              <LineItem
                label={t("subtotal")}
                value={formatRWF(pricing.subtotalBeforeDeposit)}
                bold
              />
            </div>

            {/* Deposit — always separate with explanation */}
            {pricing.depositEnabled && pricing.depositAmount > 0 && (
              <div className="bg-amber-50 rounded-xl px-3 py-3 mt-3 border border-amber-100">
                <div className="flex items-start gap-2">
                  <Lock size={13} className="text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <span className="text-xs font-semibold text-amber-700">{td(depositCopy.labelKey)}</span>
                      <span className="text-xs font-bold text-amber-700">{formatRWF(pricing.depositAmount)}</span>
                    </div>
                    <p className="text-xs text-amber-600 mt-0.5">
                      {td(depositCopy.explanationKey)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t border-stone-200 mt-3 pt-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-stone-900">{depositCopy.heldBy === 'owner' ? t('totalPayableToOwner') : t('totalChargedNow')}</span>
                <span className="text-lg font-bold text-brand">{formatRWF(pricing.totalChargedNow)}</span>
              </div>
              {pricing.depositEnabled && pricing.depositAmount > 0 && (
                <p className="text-xs text-stone-400 mt-1 text-right">
                  Includes {formatRWF(pricing.depositAmount)} refundable deposit
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Trust signals */}
      <div className="border-t border-stone-100 px-5 py-3">
        <div className="flex items-center gap-1.5 text-stone-400">
          <Info size={12} />
          <span className="text-xs">{depositCopy.heldBy === 'owner' ? 'Paid directly to the owner at handover' : 'Secure payment via MTN MoMo or bank transfer'}</span>
        </div>
      </div>
    </div>
  )
}

function LineItem({
  label,
  value,
  bold = false,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex justify-between items-start gap-3 py-0.5">
      <span className={`text-sm ${bold ? 'font-semibold text-stone-800' : 'text-stone-600'} leading-snug`}>
        {label}
      </span>
      <span className={`text-sm ${bold ? 'font-semibold text-stone-900' : 'text-stone-800'} whitespace-nowrap`}>
        {value}
      </span>
    </div>
  )
}
