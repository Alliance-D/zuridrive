'use client'

/**
 * components/booking/RentalTypeSelector.tsx
 * Select DAY / WEEK / MONTH with rate previews.
 */

import { formatRWF } from '@/lib/currency'
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
  { id: 'PER_DAY' as const, label: 'Per Day', Icon: CalendarDays },
  { id: 'PER_WEEK' as const, label: 'Per Week', Icon: CalendarRange },
  { id: 'PER_MONTH' as const, label: 'Per Month', Icon: CalendarClock },
]

function getRateLabel(type: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH', pricing: Pricing | null): string {
  if (!pricing) return '—'
  if (type === 'PER_DAY') return `from ${formatRWF(pricing.perDayInCity)}/day`
  if (type === 'PER_WEEK') return `from ${formatRWF(pricing.perWeekInCity)}/week`
  return `${formatRWF(pricing.perMonth)}/month`
}

export function RentalTypeSelector({ value, onChange, pricing }: RentalTypeSelectorProps) {
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
            {type.label}
          </span>
          <span className="text-xs text-stone-500">{getRateLabel(type.id, pricing)}</span>
        </button>
      ))}
    </div>
  )
}
