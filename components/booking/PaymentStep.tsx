'use client'

/**
 * components/booking/PaymentStep.tsx
 *
 * Step 3: Payment method selection and details.
 * - MTN Mobile Money: enter number, confirm details
 * - Bank Transfer: show account details, upload proof
 *
 * Payment is NOT processed here — only collected.
 * Actual charge happens when "Confirm & Pay" is clicked in BookingWizard.
 */

import type { BookingFormUpdater } from './BookingWizard'
import { getDepositCopy } from '@/lib/deposit-copy';
import { Smartphone, Landmark, Shield, Copy, Check } from 'lucide-react'
import { formatRWF } from '@/lib/currency'
import type { PricingBreakdown } from '@/lib/booking/pricing'
import { useState } from 'react'

interface PaymentStepProps {
  form: {
    paymentMethod: 'MTN_MOMO' | 'BANK_TRANSFER'
    momoPhone: string
  }
  pricing: PricingBreakdown | null
  errors: Record<string, string>
  onChange: BookingFormUpdater
  isLoggedIn: boolean
}

// Bank account details — loaded from env in production
const BANK_DETAILS = {
  bankName: 'Bank of Kigali',
  accountName: 'ZuriDrive Ltd',
  accountNumber: '0001234567890',
  swiftCode: 'BKIGRWRW',
  reference: 'Your booking reference (shown after this step)',
}

export function PaymentStep({ form, pricing, errors, onChange, isLoggedIn }: PaymentStepProps) {
  // Client component, so read the browser-side mirror.
  const depositCopy = getDepositCopy({ client: true });
  const [copied, setCopied] = useState<string | null>(null)

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    })
  }

  return (
    <div className="space-y-5">
      {/* Order summary */}
      {pricing && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h2 className="text-lg font-semibold text-stone-900 mb-4">Order Summary</h2>
          <div className="space-y-2">
            <SummaryLine label="Rental" value={formatRWF(pricing.baseAmount)} />
            {pricing.driverSurchargeTotal > 0 && (
              <SummaryLine label="Driver surcharge" value={formatRWF(pricing.driverSurchargeTotal)} />
            )}
            {pricing.deliveryFee > 0 && (
              <SummaryLine label="Delivery" value={formatRWF(pricing.deliveryFee)} />
            )}
            <div className="border-t border-stone-100 pt-2 mt-2">
              <SummaryLine label="Rental subtotal" value={formatRWF(pricing.subtotalBeforeDeposit)} bold />
            </div>
            {pricing.depositEnabled && pricing.depositAmount > 0 && (
              <div className="flex justify-between items-center text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                <span className="text-xs font-medium">Refundable deposit</span>
                <span className="text-xs font-bold">{formatRWF(pricing.depositAmount)}</span>
              </div>
            )}
            <div className="border-t border-stone-200 pt-3 mt-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-stone-900">{depositCopy.heldBy === 'owner' ? 'Total payable to owner' : 'Total to pay now'}</span>
                <span className="text-xl font-bold text-brand">{formatRWF(pricing.totalChargedNow)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
        Under direct settlement the platform collects nothing: the booking API
        writes the payment as CONFIRMED / DIRECT / 0 before this screen is even
        reached (see app/api/bookings/route.ts). Offering MoMo and Bank Transfer
        here, and asking for transfer proof afterwards, described a payment that
        never happens. What actually happens is that the renter pays the owner.
      */}
      {depositCopy.heldBy === 'owner' ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h2 className="text-lg font-semibold text-stone-900 mb-2">How you&apos;ll pay</h2>
          <p className="text-sm text-stone-600 leading-relaxed">
            You pay the owner directly when you collect the car — cash or mobile
            money, whichever you both prefer. ZuriDrive doesn&apos;t take the
            payment, so there&apos;s nothing to pay now.
          </p>
          <p className="mt-3 text-sm text-stone-600 leading-relaxed">
            Confirming below sends your request to the owner. They have 2 hours
            to accept, and you&apos;ll be notified either way.
          </p>
          {pricing && (
            <div className="mt-4 rounded-xl bg-stone-50 border border-stone-100 p-3">
              <p className="text-xs text-stone-500">Agree with the owner at handover</p>
              <p className="text-sm font-semibold text-stone-900 mt-0.5">
                {formatRWF(pricing.subtotalBeforeDeposit)} rental
                {pricing.depositAmount > 0 && (
                  <> + {formatRWF(pricing.depositAmount)} refundable deposit</>
                )}
              </p>
            </div>
          )}
        </div>
      ) : (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
        <h2 className="text-lg font-semibold text-stone-900 mb-4">Payment Method</h2>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {(
            [
              { id: 'MTN_MOMO', label: 'MTN MoMo', icon: Smartphone, desc: 'Instant USSD push' },
              { id: 'BANK_TRANSFER', label: 'Bank Transfer', icon: Landmark, desc: 'Manual confirmation' },
            ] as const
          ).map((method) => {
            const Icon = method.icon
            const isSelected = form.paymentMethod === method.id
            return (
              <button
                key={method.id}
                onClick={() => onChange('paymentMethod', method.id)}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                  ${isSelected
                    ? 'border-brand bg-brand/5'
                    : 'border-stone-200 hover:border-stone-300'
                  }
                `}
              >
                <Icon size={22} className={isSelected ? 'text-brand' : 'text-stone-400'} />
                <span className={`text-sm font-semibold ${isSelected ? 'text-brand' : 'text-stone-700'}`}>
                  {method.label}
                </span>
                <span className="text-xs text-stone-400">{method.desc}</span>
              </button>
            )
          })}
        </div>

        {/* MTN MoMo details */}
        {form.paymentMethod === 'MTN_MOMO' && (
          <div className="space-y-3">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs text-yellow-800 font-medium">How it works</p>
              <p className="text-xs text-yellow-700 mt-1">
                After you click &quot;Confirm &amp; Pay&quot;, a USSD prompt will be sent to your phone.
                Approve it to complete your booking.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">
                MTN MoMo Number
              </label>
              <div className="relative">
                <Smartphone
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <input
                  type="tel"
                  value={form.momoPhone}
                  onChange={(e) => onChange('momoPhone', e.target.value)}
                  placeholder="07X XXX XXXX"
                  className={`
                    w-full pl-10 pr-3 py-3 rounded-xl border text-stone-900 text-sm
                    focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand
                    ${errors.momoPhone ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}
                    transition-all
                  `}
                />
              </div>
              {errors.momoPhone && <p className="text-red-500 text-xs mt-1">{errors.momoPhone}</p>}
              <p className="text-xs text-stone-400 mt-1">
                This can be different from your contact number
              </p>
            </div>
          </div>
        )}

        {/* Bank transfer details */}
        {form.paymentMethod === 'BANK_TRANSFER' && (
          <div className="space-y-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs text-blue-800 font-medium">How it works</p>
              <p className="text-xs text-blue-700 mt-1">
                Transfer the exact amount to the account below. Upload your proof of payment
                on the next screen. Our finance team will confirm within a few hours.
              </p>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Bank', value: BANK_DETAILS.bankName },
                { label: 'Account Name', value: BANK_DETAILS.accountName },
                { label: 'Account Number', value: BANK_DETAILS.accountNumber, copyable: true },
                { label: 'SWIFT / BIC', value: BANK_DETAILS.swiftCode, copyable: true },
                { label: 'Reference', value: 'Use your booking reference (shown after this step)', note: true },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-stone-100 last:border-0">
                  <span className="text-xs text-stone-500">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${item.note ? 'text-accent italic text-xs' : 'text-stone-800'}`}>
                      {item.value}
                    </span>
                    {item.copyable && (
                      <button
                        onClick={() => copyToClipboard(item.value, item.label)}
                        className="text-stone-400 hover:text-brand transition-colors"
                      >
                        {copied === item.label ? (
                          <Check size={13} className="text-brand" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Security note */}
      <div className="flex items-start gap-2.5 px-4 py-3 bg-stone-50 rounded-xl border border-stone-100">
        <Shield size={15} className="text-brand mt-0.5 flex-shrink-0" />
        <p className="text-xs text-stone-500 leading-relaxed">
          {depositCopy.heldBy === 'platform'
            ? 'Your booking will only be confirmed after payment is fully verified.'
            : 'The owner confirms your booking, then you settle up with them directly.'}{' '}
          {pricing ? `Deposit: ${formatRWF(pricing.depositAmount)}. ` : ''}
          {depositCopy.explanation}
        </p>
      </div>
    </div>
  )
}

function SummaryLine({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className={`text-sm ${bold ? 'font-semibold text-stone-800' : 'text-stone-600'}`}>{label}</span>
      <span className={`text-sm ${bold ? 'font-semibold text-stone-900' : 'text-stone-800'}`}>{value}</span>
    </div>
  )
}
