'use client'

/**
 * components/booking/StepIndicator.tsx
 * Visual progress indicator for the booking wizard.
 */

import { Check } from 'lucide-react'

interface Step {
  id: number
  label: string
  icon: React.ElementType
}

interface StepIndicatorProps {
  steps: Step[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isCompleted = step.id < currentStep
        const isActive = step.id === currentStep
        const Icon = step.icon

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${isCompleted ? 'bg-brand text-white' : ''}
                  ${isActive ? 'bg-accent text-white' : ''}
                  ${!isCompleted && !isActive ? 'bg-stone-200 text-stone-500' : ''}
                `}
              >
                {isCompleted ? <Check size={12} strokeWidth={3} /> : step.id}
              </div>
              <span
                className={`text-xs font-medium hidden sm:block ${
                  isActive ? 'text-accent' : isCompleted ? 'text-brand' : 'text-stone-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`
                  w-8 h-px mx-2 transition-colors
                  ${step.id < currentStep ? 'bg-brand' : 'bg-stone-200'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
