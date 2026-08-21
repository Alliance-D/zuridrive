'use client'

import { formatMoney } from '@/lib/currency';
/**
 * components/FuelPolicyBadge.tsx
 *
 * Reusable fuel policy badge — used on:
 *   - Car listing page
 *   - Booking configuration step
 *   - Photo upload prompt
 *   - Booking detail page
 *
 * Shows a colored badge + plain English explanation of the policy.
 * Refuel fee shown when applicable.
 */

interface FuelPolicyBadgeProps {
  type: 'FULL_TO_FULL' | 'SAME_LEVEL' | 'FREE_TANK' | 'OWNER_HANDLES'
  refuelFee?: number
  description?: string
  compact?: boolean
}

const POLICY_CONFIG = {
  FULL_TO_FULL: {
    emoji: '',
    label: 'Full to Full',
    color: 'text-green-700',
    bg: 'bg-green-50',
    border: 'border-green-200',
    explanation: (fee?: number) =>
      fee
        ? `Car leaves with a full tank. Return it full or a refueling fee of ${formatMoney(fee)} applies.`
        : 'Car leaves with a full tank. Please return it with a full tank.',
  },
  SAME_LEVEL: {
    emoji: '',
    label: 'Same Level',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    explanation: () =>
      'Return the car with the same fuel level as when you received it.',
  },
  FREE_TANK: {
    emoji: '',
    label: 'Free Tank',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    explanation: () =>
      'Owner provides a full tank. Return at any fuel level — no charge.',
  },
  OWNER_HANDLES: {
    emoji: '',
    label: 'Owner Handles',
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    explanation: () =>
      'Fuel is managed separately between you and the owner — not tracked on platform.',
  },
}

export function FuelPolicyBadge({ type, refuelFee, description, compact = false }: FuelPolicyBadgeProps) {
  const config = POLICY_CONFIG[type]
  if (!config) return null

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.border} ${config.color}`}>
        {config.emoji} {config.label}
      </span>
    )
  }

  return (
    <div className={`rounded-xl border px-4 py-3 ${config.bg} ${config.border}`}>
      <div className="flex items-center gap-2 mb-1">
        <span>{config.emoji}</span>
        <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
      </div>
      <p className={`text-xs ${config.color} opacity-90 leading-relaxed`}>
        {description ?? config.explanation(refuelFee)}
      </p>
    </div>
  )
}
