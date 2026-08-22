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
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Upload, Check, User, Phone, Mail, FileText, CreditCard } from 'lucide-react'
import { hasContactDetails } from '@/lib/contact-detection'

interface ClientInfoFormProps {
  form: {
    clientName: string
    clientPhone: string
    clientEmail: string
    licenceAttested: boolean
    renterNote: string
  }
  errors: Record<string, string>
  isLoggedIn: boolean
  onChange: BookingFormUpdater
}

export function ClientInfoForm({ form, errors, isLoggedIn, onChange }: ClientInfoFormProps) {
  const t = useTranslations('booking')
  const [uploading, setUploading] = useState(false)

  // Checked as they type so the hint appears while it is still useful, rather
  // than after the booking is made.
  const showsContact = hasContactDetails(form.renterNote)


  return (
    <div className="space-y-5">
      {/* Personal info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">{t("personalInfo")}</h3>

        <FormField
          label={t("fullName")}
          icon={User}
          value={form.clientName}
          onChange={(v) => onChange('clientName', v)}
          placeholder={t('phNationalId')}
          error={errors.clientName}
          locked={isLoggedIn && !!form.clientName}
        />

        <FormField
          label={t("phoneNumber")}
          icon={Phone}
          value={form.clientPhone}
          onChange={(v) => onChange('clientPhone', v)}
          placeholder={t('phPhone')}
          type="tel"
          error={errors.clientPhone}
          locked={isLoggedIn && !!form.clientPhone}
        />

        <FormField
          label={t("emailOptional")}
          icon={Mail}
          value={form.clientEmail}
          onChange={(v) => onChange('clientEmail', v)}
          placeholder={t('phEmail')}
          type="email"
          error={errors.clientEmail}
        />
      </div>

      {/* Identity check — ZuriDrive stores no ID documents. The owner checks
          them in person at handover, which is stronger evidence and holds none
          of the liability of storing scans of people's identity papers. */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
          {t("beforeYouCollect")}
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
            {t("licenceAttest")}
            <span className="mt-1 block text-xs text-stone-500">
              {t("licenceNote")}
            </span>
          </span>
        </label>

        {errors.licenceAttested && (
          <p className="text-xs text-danger">{errors.licenceAttested}</p>
        )}
      </div>

      {/* Anything the owner should know before handover ────────────────────
          A flight number, a late arrival, a child seat. Without somewhere to
          put this, people improvise — usually by writing a phone number into
          a field that was not meant for one. */}
      <div className="space-y-3 pt-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-stone-500">
          {t("noteHeading")}
        </h3>

        <label htmlFor="renterNote" className="block text-sm text-stone-700">
          {t("noteLabel")}
        </label>
        <textarea
          id="renterNote"
          value={form.renterNote}
          onChange={(e) => onChange("renterNote", e.target.value.slice(0, 500))}
          rows={3}
          placeholder={t("notePlaceholder")}
          className="w-full rounded-xl border border-stone-200 p-3 text-sm focus:border-brand focus:outline-none"
        />

        <div className="flex items-start justify-between gap-3">
          <p className="text-xs text-stone-500">{t("noteHelp")}</p>
          <span className="shrink-0 text-xs text-stone-400">
            {form.renterNote.length}/500
          </span>
        </div>

        {/* Said once, quietly, and only when it applies. The owner is given
            the renter's number automatically, so this is genuinely useful
            information rather than a warning — and nothing is blocked. */}
        {showsContact && (
          <p className="rounded-lg bg-stone-50 p-3 text-xs text-stone-600">
            {t("noteContactHint")}
          </p>
        )}
      </div>

      {/* Guest account creation notice */}
      {!isLoggedIn && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <p className="text-sm text-blue-800 font-medium">{t('accountAutoTitle')}</p>
          <p className="text-xs text-blue-600 mt-0.5">
            {t('accountAutoBody')}
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
