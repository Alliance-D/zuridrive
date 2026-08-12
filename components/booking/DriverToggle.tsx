'use client'

/**
 * components/booking/DriverToggle.tsx
 * Toggle driver option with live surcharge preview.
 */

import { formatRWF } from '@/lib/currency'
import { useTranslations } from 'next-intl'
import { User } from 'lucide-react'

interface DriverToggleProps {
  enabled: boolean
  onChange: (v: boolean) => void
  surchargePerDay: number
  durationDays: number | null
}

export function DriverToggle({ enabled, onChange, surchargePerDay, durationDays }: DriverToggleProps) {
  const t = useTranslations('booking')
  const totalSurcharge = durationDays ? surchargePerDay * durationDays : null

  return (
    <div>
      <h2 className="text-lg font-semibold text-stone-900 mb-1">{t("driverOption")}</h2>
      <p className="text-sm text-stone-500 mb-4">
        {t("driverHelp")}
      </p>

      <div
        className={`
          flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all
          ${enabled ? 'border-brand bg-brand/5' : 'border-stone-200 hover:border-stone-300'}
        `}
        onClick={() => onChange(!enabled)}
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${enabled ? 'bg-brand text-white' : 'bg-stone-100 text-stone-500'}`}>
            <User size={18} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${enabled ? 'text-brand' : 'text-stone-700'}`}>
              {t("includeDriver")}
            </p>
            <p className="text-xs text-stone-500">
              {formatRWF(surchargePerDay)}/day surcharge
              {totalSurcharge ? ` · ${formatRWF(totalSurcharge)} total` : ''}
            </p>
          </div>
        </div>

        {/* Toggle switch */}
        <div
          className={`
            w-11 h-6 rounded-full transition-colors relative
            ${enabled ? 'bg-brand' : 'bg-stone-300'}
          `}
        >
          <div
            className={`
              absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform
              ${enabled ? 'translate-x-5' : 'translate-x-0.5'}
            `}
          />
        </div>
      </div>
    </div>
  )
}
