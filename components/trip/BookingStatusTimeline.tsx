'use client'

/**
 * components/trip/BookingStatusTimeline.tsx
 *
 * Visual horizontal timeline showing booking status progression.
 * Completed steps are filled green, current step is gold, future steps are grey.
 */

import { Check } from 'lucide-react'

const TIMELINE_STEPS = [
  { id: 'PENDING_PAYMENT',            label: 'Payment' },
  { id: 'AWAITING_OWNER_CONFIRMATION', label: 'Confirmation' },
  { id: 'CONFIRMED',                  label: 'Confirmed' },
  { id: 'ACTIVE',                     label: 'Active' },
  { id: 'COMPLETED',                  label: 'Complete' },
]

// Order for determining which steps are "completed"
const STATUS_ORDER: Record<string, number> = {
  PENDING_PAYMENT: 0,
  PAYMENT_CONFIRMED: 1,
  AWAITING_OWNER_CONFIRMATION: 1,
  CONFIRMED: 2,
  ACTIVE: 3,
  COMPLETED: 4,
  CANCELLED: -1,
  DISPUTED: 3, // shown at ACTIVE position
}

interface BookingStatusTimelineProps {
  status: string
}

export function BookingStatusTimeline({ status }: BookingStatusTimelineProps) {
  const currentOrder = STATUS_ORDER[status] ?? 0
  const isCancelled = status === 'CANCELLED'
  const isDisputed = status === 'DISPUTED'

  if (isCancelled) {
    return (
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
          <span className="text-red-500 text-sm">✕</span>
        </div>
        <p className="text-sm font-medium text-red-600">Booking Cancelled</p>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-0">
      {TIMELINE_STEPS.map((step, index) => {
        const stepOrder = index
        const isCompleted = stepOrder < currentOrder
        const isActive = stepOrder === currentOrder
        const isFuture = stepOrder > currentOrder

        // Special: show dispute indicator at ACTIVE step
        const showDisputeIndicator = isDisputed && step.id === 'ACTIVE'

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* Step node */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center transition-all flex-shrink-0
                  ${isCompleted ? 'bg-brand' : ''}
                  ${isActive && !showDisputeIndicator ? 'bg-accent' : ''}
                  ${showDisputeIndicator ? 'bg-orange-500' : ''}
                  ${isFuture ? 'bg-stone-200' : ''}
                `}
              >
                {isCompleted && <Check size={12} className="text-white" strokeWidth={3} />}
                {isActive && !showDisputeIndicator && (
                  <div className="w-2.5 h-2.5 rounded-full bg-white" />
                )}
                {showDisputeIndicator && <span className="text-white text-xs">!</span>}
                {isFuture && <div className="w-2 h-2 rounded-full bg-stone-300" />}
              </div>
              <span
                className={`
                  text-xs font-medium whitespace-nowrap
                  ${isCompleted ? 'text-brand' : ''}
                  ${isActive && !showDisputeIndicator ? 'text-accent' : ''}
                  ${showDisputeIndicator ? 'text-orange-600' : ''}
                  ${isFuture ? 'text-stone-400' : ''}
                `}
              >
                {showDisputeIndicator ? 'Disputed' : step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < TIMELINE_STEPS.length - 1 && (
              <div
                className={`
                  flex-1 h-0.5 mx-1 -mt-5 transition-colors
                  ${stepOrder < currentOrder ? 'bg-brand' : 'bg-stone-200'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
