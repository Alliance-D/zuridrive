'use client'

/**
 * components/booking/ClientInfoForm.tsx
 *
 * Step 2: Client identity verification form.
 * - Logged in: fields pre-filled, just review
 * - Guest: full form with license photo upload
 *
 * Progressive field reveal — grouped by section.
 */

import type { BookingFormUpdater } from './BookingWizard'
import { useState } from 'react'
import { Upload, Check, User, Phone, Mail, FileText, CreditCard } from 'lucide-react'

interface ClientInfoFormProps {
  form: {
    clientName: string
    clientPhone: string
    clientEmail: string
    licenceAttested: boolean
  }
  errors: Record<string, string>
  isLoggedIn: boolean
  onChange: BookingFormUpdater
}

export function ClientInfoForm({ form, errors, isLoggedIn, onChange }: ClientInfoFormProps) {
  const [uploading, setUploading] = useState(false)


  return (
    <div className="space-y-5">
      {/* Personal info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">Personal Information</h3>

        <FormField
          label="Full Name"
          icon={User}
          value={form.clientName}
          onChange={(v) => onChange('clientName', v)}
          placeholder="As on your national ID"
          error={errors.clientName}
          locked={isLoggedIn && !!form.clientName}
        />

        <FormField
          label="Phone Number"
          icon={Phone}
          value={form.clientPhone}
          onChange={(v) => onChange('clientPhone', v)}
          placeholder="07X XXX XXXX"
          type="tel"
          error={errors.clientPhone}
          locked={isLoggedIn && !!form.clientPhone}
        />

        <FormField
          label="Email Address (optional)"
          icon={Mail}
          value={form.clientEmail}
          onChange={(v) => onChange('clientEmail', v)}
          placeholder="For booking confirmation email"
          type="email"
          error={errors.clientEmail}
        />
      </div>

      {/* Identity check
          ZuriDrive does not collect ID or licence documents. The owner checks
          them in person at handover, which is stronger evidence and holds none
          of the liability of storing scans of people's identity papers. */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
          Before you collect the car
        </h3>

        <label
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
            form.licenceAttested
              ? "border-brand bg-brand-wash"
              : errors.licenceAttested
                ? "border-danger-soft bg-danger-tint"
                : "border-stone-200 hover:border-brand/50"
          }`}
        >
          <input
            type="checkbox"
            checked={form.licenceAttested}
            onChange={(e) => onChange("licenceAttested", e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#1B4332]"
          />
          <span className="text-sm text-stone-700">
            I hold a valid driving licence, and I will show it together with my
            national ID or passport to the owner before taking the car.
            <span className="mt-1 block text-xs text-stone-500">
              The owner will check your documents in person at handover. We
              don&apos;t ask you to upload them, and we don&apos;t store them.
            </span>
          </span>
        </label>

        {errors.licenceAttested && (
          <p className="text-xs text-danger">{errors.licenceAttested}</p>
        )}
      </div>

      {/* Guest account creation notice */}
      {!isLoggedIn && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-sm text-blue-800 font-medium">Your account will be created automatically</p>
          <p className="text-xs text-blue-600 mt-0.5">
            After booking, we&apos;ll send an SMS with your login details. No password needed — just your phone number.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Reusable form field ──────────────────────────────────────────────────────

interface FormFieldProps {
  label: string
  icon: React.ElementType
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  error?: string
  locked?: boolean
}

function FormField({ label, icon: Icon, value, onChange, placeholder, type = 'text', error, locked }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}</label>
      <div className="relative">
        <Icon
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
        />
        <input
          type={type}
          value={value}
          onChange={(e) => !locked && onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={locked}
          className={`
            w-full pl-10 pr-3 py-3 rounded-xl border text-stone-900 text-sm transition-all
            focus:outline-none focus:ring-2
            ${error
              ? 'border-red-300 focus:ring-red-200 bg-red-50'
              : 'border-stone-200 focus:ring-brand/20 focus:border-brand bg-white'
            }
            ${locked ? 'bg-stone-50 text-stone-600 cursor-default' : ''}
          `}
        />
        {locked && (
          <Check size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand" />
        )}
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  )
}
