'use client'

/**
 * components/booking/BookingWizard.tsx
 *
 * Multi-step booking wizard — client component.
 * Steps:
 *   1. Configure rental (type, scope, dates, driver, location)
 *   2. Live price breakdown
 *   3. Client information
 *   4. Payment method selection
 *   5. Payment processing (MoMo or Bank Transfer)
 *   (Confirmation is its own page at /book/[carId]/confirmation)
 *
 * Design: Premium, refined — forest green + gold, clean card layout,
 * smooth step transitions, real-time price updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { paymentsEnabledClient } from '@/lib/deposit-copy'
import Image from "next/image";
import cloudinaryLoader from "@/lib/cloudinary-loader";
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, MapPin, User, CreditCard, ChevronRight, ChevronLeft, Info, Check, Car, Fuel, Clock } from 'lucide-react'
import { formatRWF } from '@/lib/currency'
import { calculateBookingPrice } from '@/lib/booking/pricing'
import { StepIndicator } from './StepIndicator'
import { RentalTypeSelector } from './RentalTypeSelector'
import { DateRangePicker } from './DateRangePicker'
import { LocationPicker } from './LocationPicker'
import { DriverToggle } from './DriverToggle'
import { PriceBreakdown } from './PriceBreakdown'
import { ClientInfoForm } from './ClientInfoForm'
import { PaymentStep } from './PaymentStep'
import { FuelPolicyBadge } from '@/components/FuelPolicyBadge'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CarData {
  id: string
  make: string
  model: string
  year: number
  coverPhotoUrl: string | null
  minBookingDays: number | null
  pricing: {
    perDayInCity: number
    perDayOutsideCity: number
    perWeekInCity: number
    perWeekOutsideCity: number
    perMonth: number
    driverEnabled: boolean
    driverSurchargePerDay: number
    depositEnabled: boolean
    depositAmount: number
  } | null
  fuelPolicy: {
    type: string
    refuelFee: number | null
    description: string | null
  } | null
  ownerName: string
  ownerSince: string
  deliverAnywhere: boolean
  deliveryFee: number
}

interface LocationsData {
  platformLocations: Array<{ id: string; name: string; description: string | null; icon: string | null }>
  ownerLocations: Array<{ id: string; name: string; description: string | null; neighborhood: string | null; deliveryFee: number }>
}

interface ClientProfile {
  name: string | null
  phone: string | null
  email: string | null
}

interface BookingWizardProps {
  car: CarData
  locations: LocationsData
  clientProfile: ClientProfile | null
  isLoggedIn: boolean
  prefill?: {
    startDate?: string
    endDate?: string
    rentalType?: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH'
    tripScope?: 'IN_CITY' | 'OUTSIDE_CITY'
  }
}

// Exported so the step components share this exact contract rather than
// declaring their own looser copy.
export interface BookingFormState {
  // Step 1 — Configure
  rentalType: 'PER_DAY' | 'PER_WEEK' | 'PER_MONTH'
  tripScope: 'IN_CITY' | 'OUTSIDE_CITY' | null
  startDate: Date | null
  endDate: Date | null
  withDriver: boolean
  locationId: string | null         // platform_ or owner_ prefixed ID
  customLocationText: string
  customLocationLat: number | null
  customLocationLng: number | null
  deliveryFee: number

  // Step 2 — Client info
  clientName: string
  clientPhone: string
  clientEmail: string
  /** Renter confirms they hold a licence and will show it at handover. */
  licenceAttested: boolean

  // Step 3 — Payment
  paymentMethod: 'MTN_MOMO' | 'BANK_TRANSFER'
  momoPhone: string
}

/** Type-safe field updater passed down to each step. */
export type BookingFormUpdater = <K extends keyof BookingFormState>(
  key: K,
  value: BookingFormState[K],
) => void

// Whether the platform actually collects money. Drives wording only.
const PAYMENTS_LIVE = paymentsEnabledClient()

const STEPS = [
  { id: 1, labelKey: 'configure', icon: CalendarDays },
  { id: 2, labelKey: 'yourDetails', icon: User },
  // Wording depends on whether money is actually collected; both keys exist.
  { id: 3, labelKey: PAYMENTS_LIVE ? 'payment' : 'confirm', icon: CreditCard },
]

// ─── Main Component ───────────────────────────────────────────────────────────

export function BookingWizard({
  car,
  locations,
  clientProfile,
  isLoggedIn,
  prefill,
}: BookingWizardProps) {
  const t = useTranslations('booking')
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bookingId, setBookingId] = useState<string | null>(null)
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [blockedDates, setBlockedDates] = useState<Array<{ start: Date; end: Date }>>([])

  // Form state
  const [form, setForm] = useState<BookingFormState>({
    rentalType: prefill?.rentalType ?? 'PER_DAY',
    tripScope: prefill?.tripScope ?? 'IN_CITY',
    startDate: prefill?.startDate ? new Date(prefill.startDate) : null,
    endDate: prefill?.endDate ? new Date(prefill.endDate) : null,
    withDriver: false,
    locationId: null,
    customLocationText: '',
    customLocationLat: null,
    customLocationLng: null,
    deliveryFee: 0,
    // Pre-fill client info if logged in
    clientName: clientProfile?.name ?? '',
    clientPhone: clientProfile?.phone ?? '',
    clientEmail: clientProfile?.email ?? '',
    licenceAttested: false,
    paymentMethod: 'MTN_MOMO',
    momoPhone: clientProfile?.phone ?? '',
  })

  // Monthly rentals have no in-city/outside-city split, so clear the scope;
  // switching back to daily/weekly restores a default.
  //
  // The current scope is read inside the updater rather than from the closure,
  // so this never acts on a stale value and doesn't need tripScope as a
  // dependency — which would re-run it on every scope change the user makes.
  useEffect(() => {
    setForm((f) => {
      if (f.rentalType === 'PER_MONTH') {
        return f.tripScope === null ? f : { ...f, tripScope: null }
      }
      return f.tripScope ? f : { ...f, tripScope: 'IN_CITY' }
    })
  }, [form.rentalType])

  // Load blocked dates for calendar
  useEffect(() => {
    fetch(`/api/cars/${car.id}/availability`)
      .then((r) => r.json())
      .then((data) => {
        setBlockedDates(
          data.blocked?.map((b: { start: string; end: string }) => ({
            start: new Date(b.start),
            end: new Date(b.end),
          })) ?? [],
        )
      })
      .catch(console.error)
  }, [car.id])

  // ─── Live price calculation ─────────────────────────────────────────────────
  const pricing = (() => {
    if (!form.startDate || !form.endDate || !car.pricing) return null
    try {
      return calculateBookingPrice({
        rentalType: form.rentalType,
        tripScope: form.tripScope,
        startDate: form.startDate,
        endDate: form.endDate,
        withDriver: form.withDriver,
        deliveryFee: form.deliveryFee,
        pricingMatrix: car.pricing,
      })
    } catch {
      return null
    }
  })()

  // ─── Field updater ──────────────────────────────────────────────────────────
  const update = useCallback(<K extends keyof BookingFormState>(
    key: K,
    value: BookingFormState[K],
  ) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => { const next = { ...e }; delete next[key]; return next })
  }, [])

  // ─── Validation ─────────────────────────────────────────────────────────────
  function validateStep(step: number): boolean {
    const errs: Record<string, string> = {}

    if (step === 1) {
      if (!form.startDate) errs.startDate = 'Please select a pickup date.'
      if (!form.endDate) errs.endDate = 'Please select a return date.'
      if (form.startDate && form.endDate && form.endDate <= form.startDate) {
        errs.endDate = 'Return date must be after pickup date.'
      }
      if (car.minBookingDays && form.startDate && form.endDate) {
        const days = Math.ceil((form.endDate.getTime() - form.startDate.getTime()) / 86400000)
        if (days < car.minBookingDays) {
          errs.endDate = `Minimum booking is ${car.minBookingDays} day${car.minBookingDays > 1 ? 's' : ''}.`
        }
      }
      if (!form.locationId && !form.customLocationText) {
        errs.location = 'Please select or describe a pickup location.'
      }
    }

    if (step === 2) {
      if (!form.clientName.trim()) errs.clientName = 'Your name is required.'
      if (!form.clientPhone.trim()) errs.clientPhone = 'Your phone number is required.'
      if (!/^(\+?250|0)[7][0-9]{8}$/.test(form.clientPhone.replace(/\s/g, ''))) {
        errs.clientPhone = 'Please enter a valid Rwandan phone number.'
      }
      if (!form.licenceAttested)
        errs.licenceAttested =
          'Please confirm you hold a valid licence and will show it at handover.'
    }

    if (step === 3) {
      if (form.paymentMethod === 'MTN_MOMO' && !form.momoPhone.trim()) {
        errs.momoPhone = 'Please enter your MTN MoMo phone number.'
      }
    }

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ─── Navigation ─────────────────────────────────────────────────────────────
  function nextStep() {
    if (!validateStep(currentStep)) return
    setCurrentStep((s) => Math.min(s + 1, STEPS.length))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function prevStep() {
    setCurrentStep((s) => Math.max(s - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ─── Step 3: Create booking then handle payment ──────────────────────────────
  async function createBookingAndPay() {
    if (!validateStep(3)) return
    if (!form.startDate || !form.endDate || !pricing) return

    setIsSubmitting(true)
    setErrors({})

    try {
      // 1. Create booking
      const bookingRes = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carId: car.id,
          rentalType: form.rentalType,
          tripScope: form.tripScope,
          startDate: form.startDate.toISOString(),
          endDate: form.endDate.toISOString(),
          withDriver: form.withDriver,
          pickupLocationId: form.locationId ?? undefined,
          customLocationText: form.customLocationText || undefined,
          customLocationLat: form.customLocationLat ?? undefined,
          customLocationLng: form.customLocationLng ?? undefined,
          deliveryFee: form.deliveryFee,
          clientName: form.clientName,
          clientPhone: form.clientPhone,
          clientEmail: form.clientEmail || undefined,
          licenceAttested: form.licenceAttested,
          paymentMethod: form.paymentMethod,
        }),
      })

      const bookingData = await bookingRes.json()

      if (!bookingRes.ok) {
        setErrors({ submit: bookingData.error ?? 'Booking creation failed. Please try again.' })
        return
      }

      setBookingId(bookingData.bookingId)
      setPaymentId(bookingData.paymentId)

      // 2. Initiate MoMo payment if that method selected
      if (form.paymentMethod === 'MTN_MOMO') {
        const momoRes = await fetch(`/api/bookings/${bookingData.bookingId}/payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'initiate_momo',
            phoneNumber: form.momoPhone,
          }),
        })
        const momoData = await momoRes.json()
        if (!momoRes.ok) {
          setErrors({ submit: momoData.error ?? 'Could not send payment prompt. Please try again.' })
          return
        }
      }

      // Navigate to payment confirmation page
      router.push(`/book/${car.id}/payment?bookingId=${bookingData.bookingId}&method=${form.paymentMethod}`)
    } catch {
      setErrors({ submit: 'Something went wrong. Please try again or contact support.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bone">
      {/* ── Top car summary bar ── */}
      <div className="bg-white border-b border-stone-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-4">
          {car.coverPhotoUrl && (
            <Image
              loader={cloudinaryLoader}
              src={car.coverPhotoUrl}
              alt={`${car.make} ${car.model}`}
              width={56}
              height={40}
              className="w-14 h-10 object-cover rounded-lg"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-stone-900 truncate">
              {car.year} {car.make} {car.model}
            </p>
            <p className="text-xs text-stone-500">{car.ownerName}</p>
          </div>
          {pricing && (
            <div className="text-right">
              <p className="font-bold text-brand">{formatRWF(pricing.totalChargedNow)}</p>
              <p className="text-xs text-stone-500">{t("total")}</p>
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div className="max-w-4xl mx-auto px-4 pb-3">
          <StepIndicator steps={STEPS.map((st) => ({ ...st, label: t(st.labelKey) }))} currentStep={currentStep} />
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">

          {/* Left: step content */}
          <div>
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  {/* Rental type */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                    <h2 className="text-lg font-semibold text-stone-900 mb-4">{t("rentalType")}</h2>
                    <RentalTypeSelector
                      value={form.rentalType}
                      onChange={(v) => update('rentalType', v)}
                      pricing={car.pricing}
                    />

                    {/* Trip scope — hidden for monthly */}
                    {form.rentalType !== 'PER_MONTH' && (
                      <div className="mt-5">
                        <p className="text-sm font-medium text-stone-700 mb-3">{t("tripScope")}</p>
                        <div className="grid grid-cols-2 gap-3">
                          {(['IN_CITY', 'OUTSIDE_CITY'] as const).map((scope) => (
                            <button
                              key={scope}
                              onClick={() => update('tripScope', scope)}
                              className={`
                                px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all
                                ${form.tripScope === scope
                                  ? 'border-brand bg-brand text-white'
                                  : 'border-stone-200 text-stone-700 hover:border-brand/40'
                                }
                              `}
                            >
                              {scope === 'IN_CITY' ? t('inCity') : t('outsideCity')}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {form.rentalType === 'PER_MONTH' && (
                      <p className="mt-4 text-sm text-brand bg-green-50 rounded-lg px-4 py-2 border border-green-200">
                        Monthly rate — drive anywhere in Rwanda at no extra charge.
                      </p>
                    )}
                  </div>

                  {/* Date range */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                    <h2 className="text-lg font-semibold text-stone-900 mb-4">{t("selectDates")}</h2>
                    <DateRangePicker
                      startDate={form.startDate}
                      endDate={form.endDate}
                      onStartChange={(d) => update('startDate', d)}
                      onEndChange={(d) => update('endDate', d)}
                      blockedDates={blockedDates}
                      minBookingDays={car.minBookingDays ?? 1}
                    />
                    {errors.startDate && <p className="text-red-500 text-sm mt-2">{errors.startDate}</p>}
                    {errors.endDate && <p className="text-red-500 text-sm mt-2">{errors.endDate}</p>}
                  </div>

                  {/* Driver option */}
                  {car.pricing?.driverEnabled && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                      <DriverToggle
                        enabled={form.withDriver}
                        onChange={(v) => update('withDriver', v)}
                        surchargePerDay={car.pricing.driverSurchargePerDay}
                        durationDays={
                          form.startDate && form.endDate
                            ? Math.max(1, Math.ceil((form.endDate.getTime() - form.startDate.getTime()) / 86400000))
                            : null
                        }
                      />
                    </div>
                  )}

                  {/* Pickup location */}
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                    <h2 className="text-lg font-semibold text-stone-900 mb-2">{t("pickupLocation")}</h2>
                    <p className="text-sm text-stone-500 mb-4">{t("whereCollect")}</p>
                    <LocationPicker
                      platformLocations={locations.platformLocations}
                      ownerLocations={locations.ownerLocations}
                      selectedId={form.locationId}
                      customText={form.customLocationText}
                      onSelectId={(id, deliveryFee) => {
                        update('locationId', id)
                        update('customLocationText', '')
                        update('deliveryFee', deliveryFee ?? 0)
                      }}
                      onCustomText={(text) => {
                        update('customLocationText', text)
                        update('locationId', null)
                        update('deliveryFee', 0)
                      }}
                    />
                    {errors.location && <p className="text-red-500 text-sm mt-2">{errors.location}</p>}
                  </div>

                  {/* Fuel policy reminder */}
                  {car.fuelPolicy && (
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
                      <div className="flex items-center gap-2 mb-2">
                        <Fuel size={16} className="text-accent" />
                        <p className="text-sm font-medium text-stone-700">{t("fuelPolicy")}</p>
                      </div>
                      <FuelPolicyBadge
                        type={car.fuelPolicy.type as 'FULL_TO_FULL' | 'SAME_LEVEL' | 'FREE_TANK' | 'OWNER_HANDLES'}
                        refuelFee={car.fuelPolicy.refuelFee ?? undefined}
                        description={car.fuelPolicy.description ?? undefined}
                      />
                    </div>
                  )}
                </motion.div>
              )}

              {currentStep === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-stone-100">
                    <h2 className="text-lg font-semibold text-stone-900 mb-1">{t("yourDetails")}</h2>
                    <p className="text-sm text-stone-500 mb-6">
                      {isLoggedIn
                        ? t('detailsPrefilled')
                        : t('detailsRequired')}
                    </p>
                    <ClientInfoForm
                      form={form}
                      errors={errors}
                      isLoggedIn={isLoggedIn}
                      onChange={update}
                    />
                  </div>
                </motion.div>
              )}

              {currentStep === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <PaymentStep
                    form={form}
                    pricing={pricing}
                    errors={errors}
                    onChange={update}
                    isLoggedIn={isLoggedIn}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between mt-6">
              {currentStep > 1 ? (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border border-stone-300 text-stone-700 font-medium hover:border-stone-400 transition-colors"
                >
                  <ChevronLeft size={18} />
                  {t("back")}
                </button>
              ) : (
                /* Step 1 had an empty div here, so the only way out of the
                   wizard was the browser's back button — a dead end for anyone
                   who opened it to check a price and changed their mind. */
                <Link
                  href={`/cars/${car.id}`}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl border border-stone-300 text-stone-700 font-medium hover:border-stone-400 transition-colors"
                >
                  <ChevronLeft size={18} />
                  {t("backToCar")}
                </Link>
              )}

              {currentStep < STEPS.length ? (
                <button
                  onClick={nextStep}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-deep transition-colors shadow-sm"
                >
                  {t("continue")}
                  <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  onClick={createBookingAndPay}
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-accent text-white font-semibold hover:bg-accent-deep transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? t('processing') : PAYMENTS_LIVE ? t('confirmAndPay') : t('sendRequest')}
                  {!isSubmitting && <ChevronRight size={18} />}
                </button>
              )}
            </div>

            {errors.submit && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <p className="text-sm text-red-700">{errors.submit}</p>
              </div>
            )}
          </div>

          {/* Right: sticky price summary */}
          <div className="hidden lg:block">
            <div className="sticky top-36">
              <PriceBreakdown
                pricing={pricing}
                car={car}
                form={{
                  rentalType: form.rentalType,
                  tripScope: form.tripScope,
                  startDate: form.startDate,
                  endDate: form.endDate,
                  withDriver: form.withDriver,
                }}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
