'use client'

/**
 * components/trip/DepositStatusCard.tsx
 *
 * Shows deposit status clearly to both client and owner.
 * - HELD: "Deposit is securely held"
 * - RELEASED: "Deposit released" with date
 * - PARTIALLY_WITHHELD: breakdown of what was withheld vs returned
 * - FULLY_WITHHELD: full withhold explanation
 *
 * Movement history shown in a collapsible timeline.
 */

import { useState } from 'react'
import { Lock, Unlock, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { formatRWF } from '@/lib/currency'
import { motion, AnimatePresence } from 'framer-motion'

interface DepositStatusCardProps {
  deposit: {
    id: string
    amount: number
    status: string
    releasedAt: string | null
    withheldAmount: number | null
    releasedAmount: number | null
    movements: Array<{
      type: string
      amount: number
      reason: string
      createdAt: string
    }>
  }
}

const DEPOSIT_STATUS_CONFIG: Record<string, {
  label: string
  description: string
  color: string
  bg: string
  icon: React.ElementType
}> = {
  HELD: {
    label: 'Deposit Held',
    description: 'Securely held and will be released automatically after successful trip completion.',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: Lock,
  },
  RELEASED: {
    label: 'Deposit Released',
    description: 'Your full deposit has been returned. It should reflect within 1-3 business days.',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: Unlock,
  },
  PARTIALLY_WITHHELD: {
    label: 'Deposit Partially Withheld',
    description: 'Part of your deposit was withheld. The remainder has been returned.',
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    icon: AlertTriangle,
  },
  FULLY_WITHHELD: {
    label: 'Deposit Fully Withheld',
    description: 'Your full deposit has been withheld. Contact support if you believe this is incorrect.',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200',
    icon: AlertTriangle,
  },
}

const MOVEMENT_LABELS: Record<string, string> = {
  RELEASED: 'Full deposit released',
  PARTIALLY_WITHHELD: 'Partial withhold',
  PARTIAL_RELEASE: 'Partial release to client',
  FULLY_WITHHELD: 'Full deposit withheld',
}

export function DepositStatusCard({ deposit }: DepositStatusCardProps) {
  const [showHistory, setShowHistory] = useState(false)
  const config = DEPOSIT_STATUS_CONFIG[deposit.status] ?? DEPOSIT_STATUS_CONFIG.HELD
  const StatusIcon = config.icon

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-2">
        <Lock size={15} className="text-stone-400" />
        <p className="text-sm font-semibold text-stone-700">Damage Deposit</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Status banner */}
        <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${config.bg}`}>
          <StatusIcon size={18} className={`${config.color} flex-shrink-0 mt-0.5`} />
          <div>
            <p className={`text-sm font-semibold ${config.color}`}>{config.label}</p>
            <p className={`text-xs mt-0.5 ${config.color} opacity-80`}>{config.description}</p>
          </div>
        </div>

        {/* Amount breakdown */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-stone-500">Total deposit</span>
            <span className="text-sm font-semibold text-stone-800">{formatRWF(deposit.amount)}</span>
          </div>

          {deposit.status === 'PARTIALLY_WITHHELD' && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-red-600">Withheld</span>
                <span className="text-sm font-semibold text-red-700">
                  − {formatRWF(deposit.withheldAmount ?? 0)}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-stone-100 pt-1.5">
                <span className="text-sm font-semibold text-stone-700">Returned to you</span>
                <span className="text-sm font-bold text-brand">
                  {formatRWF(deposit.releasedAmount ?? 0)}
                </span>
              </div>
            </>
          )}

          {deposit.releasedAt && (
            <p className="text-xs text-stone-400">
              {deposit.status === 'HELD' ? 'Held since' : 'Processed on'}{' '}
              {new Date(deposit.releasedAt).toLocaleDateString('en-RW', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          )}
        </div>

        {/* Movement history toggle */}
        {deposit.movements.length > 0 && (
          <div className="border-t border-stone-100 pt-3">
            <button
              onClick={() => setShowHistory((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-700 font-medium transition-colors"
            >
              {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showHistory ? 'Hide' : 'Show'} deposit history
            </button>

            <AnimatePresence>
              {showHistory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mt-3 space-y-2"
                >
                  {deposit.movements.map((movement, i) => (
                    <div key={i} className="flex items-start gap-3 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-stone-300 mt-1.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <span className="font-medium text-stone-700">
                            {MOVEMENT_LABELS[movement.type] ?? movement.type}
                          </span>
                          <span className="text-stone-500">{formatRWF(movement.amount)}</span>
                        </div>
                        <p className="text-stone-400 mt-0.5">{movement.reason}</p>
                        <p className="text-stone-300 mt-0.5">
                          {new Date(movement.createdAt).toLocaleString('en-RW')}
                        </p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
