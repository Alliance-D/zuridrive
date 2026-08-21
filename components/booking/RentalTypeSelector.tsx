'use client'

/**
 * components/booking/RentalTypeSelector.tsx
 * Select DAY / WEEK / MONTH with rate previews.
 */

import { formatMoney } from '@/lib/currency'
import { useTranslations } from 'next-intl'
import { CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';

interface Pricing {
  perDayInCity: number
  perDayOutsideCity: number
  perWeekInCity: number
  perWeekOutsideCity: number
  perMonth: number
}

interface RentalTypeSelectorProps {
  value: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH'
  onChange: (v: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH') => void
  pricing: Pricing | null
}

const TYPES = [
  { id: 'PER_DAY' as const, labelKey: 'perDayLabel', Icon: CalendarDays },
  { id: 'PER_WEEK' as const, labelKey: 'perWeek', Icon: CalendarRange },
  { id: 'PER_MONTH' as const, labelKey: 'perMonth', Icon: CalendarClock },
]

/**
 * Takes the translator rather than building English inline — the strings this
 * returns are shown to the renter, so they cannot be assembled from literals.
 */
function getRateLabel(
  type: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH',
  pricing: Pricing | null,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  if (!pricing) return '—'
  if (type === 'PER_DAY') return t('perDayFrom', { amount: formatMoney(pricing.perDayInCity) })
  if (type === 'PER_WEEK') return t('perWeekFrom', { amount: formatMoney(pricing.perWeekInCity) })
  return t('perMonthFlat', { amount: formatMoney(pricing.perMonth) })
}

export function RentalTypeSelector({ value, onChange, pricing }: RentalTypeSelectorProps) {
  const tc = useTranslations('carDetail')
  const tb = useTranslations('booking')
  return (
    <div className="grid grid-cols-3 gap-3">
      {TYPES.map((type) => (
        <button
          key={type.id}
          onClick={() => onChange(type.id)}
          className={`
            flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all text-center
            ${value === type.id
              ? 'border-brand bg-brand/5'
              : 'border-stone-200 hover:border-stone-300'
            }
          `}
        >
          <type.Icon className="h-5 w-5 text-brand" aria-hidden />
          <span className={`text-sm font-semibold ${value === type.id ? 'text-brand' : 'text-stone-700'}`}>
            {tc(type.labelKey)}
          </span>
          <span className="text-xs text-stone-500">{getRateLabel(type.id, pricing, tb)}</span>
        </button>
      ))}
    </div>
  )
}
