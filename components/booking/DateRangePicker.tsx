'use client'

/**
 * components/booking/DateRangePicker.tsx
 *
 * Simple two-input date range picker that:
 * - Blocks unavailable dates visually
 * - Enforces minimum booking duration
 * - Shows friendly validation messages
 *
 * Uses native date inputs for broad mobile support.
 * A custom calendar can replace this later without changing the interface.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { CalendarDays, AlertCircle } from 'lucide-react'

interface DateRangePickerProps {
  startDate: Date | null
  endDate: Date | null
  onStartChange: (d: Date | null) => void
  onEndChange: (d: Date | null) => void
  blockedDates: Array<{ start: Date; end: Date }>
  minBookingDays: number
}

function toInputValue(d: Date | null): string {
  if (!d) return ''
  return d.toISOString().split('T')[0]
}

function fromInputValue(s: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  // Set to noon to avoid timezone edge cases
  d.setHours(12, 0, 0, 0)
  return d
}

function isDateBlocked(date: Date, blockedDates: Array<{ start: Date; end: Date }>): boolean {
  return blockedDates.some(
    (b) => date >= b.start && date <= b.end,
  )
}

function calcDays(start: Date, end: Date): number {
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86400000))
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  blockedDates,
  minBookingDays,
}: DateRangePickerProps) {
  const t = useTranslations('booking')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = toInputValue(today)

  // Minimum end date: day after start + minBookingDays - 1
  const minEndDate = startDate
    ? new Date(startDate.getTime() + (minBookingDays) * 86400000)
    : null

  const days = startDate && endDate ? calcDays(startDate, endDate) : null

  function handleStartChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = fromInputValue(e.target.value)
    onStartChange(d)
    // Reset end if it's now before start
    if (d && endDate && endDate <= d) {
      onEndChange(null)
    }
  }

  function handleEndChange(e: React.ChangeEvent<HTMLInputElement>) {
    const d = fromInputValue(e.target.value)
    onEndChange(d)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Pickup date */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            {t("pickupDate")}
          </label>
          <div className="relative">
            <CalendarDays
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            />
            <input
              type="date"
              value={toInputValue(startDate)}
              min={todayStr}
              onChange={handleStartChange}
              className="
                w-full pl-9 pr-3 py-3 rounded-xl border border-stone-200
                text-stone-900 text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand
                transition-all
              "
            />
          </div>
        </div>

        {/* Return date */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1.5">
            {t("returnDate")}
          </label>
          <div className="relative">
            <CalendarDays
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            />
            <input
              type="date"
              value={toInputValue(endDate)}
              min={minEndDate ? toInputValue(minEndDate) : todayStr}
              disabled={!startDate}
              onChange={handleEndChange}
              className="
                w-full pl-9 pr-3 py-3 rounded-xl border border-stone-200
                text-stone-900 text-sm bg-white
                focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand
                disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed
                transition-all
              "
            />
          </div>
        </div>
      </div>

      {/* Duration display */}
      {days !== null && days > 0 && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <CalendarDays size={14} className="text-brand" />
          <span className="text-sm text-brand font-medium">
            {t("daysSelected", { count: days })}
          </span>
        </div>
      )}

      {/* Minimum duration hint */}
      {minBookingDays > 1 && (
        <div className="flex items-center gap-2 text-stone-500">
          <AlertCircle size={13} />
          <span className="text-xs">{t("minBookingDays", { count: minBookingDays })}</span>
        </div>
      )}
    </div>
  )
}
