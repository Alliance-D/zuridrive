'use client'

/**
 * components/photos/ConditionPhotoUploader.tsx
 *
 * Guided condition photo upload flow.
 * Prompts for each category in sequence — exterior, interior, fuel gauge.
 * Fuel gauge photo is flagged as required for FULL_TO_FULL / SAME_LEVEL policies.
 *
 * Design: Clean, camera-app inspired — dark background, large upload zones,
 * category icons, clear required/optional badges, progress indicator.
 */

import { useState, useCallback, useRef } from 'react'
import Image from "next/image";
import cloudinaryLoader from "@/lib/cloudinary-loader";
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CarFront, RotateCcw, Armchair,
  Camera, Upload, Check, ChevronRight, ChevronLeft,
  AlertCircle, Fuel, X, ZoomIn, Info
} from 'lucide-react'

// Photo categories in upload order
const PHOTO_STEPS = [
  { id: 'EXTERIOR_FRONT', label: 'Front of car',      Icon: CarFront, hint: 'Full front view, include license plate',     required: true },
  { id: 'EXTERIOR_REAR',  label: 'Rear of car',       Icon: RotateCcw, hint: 'Full rear view, include license plate',      required: true },
  { id: 'EXTERIOR_LEFT',  label: 'Left side',         Icon: ChevronLeft,  hint: 'Full left side from front to back',          required: true },
  { id: 'EXTERIOR_RIGHT', label: 'Right side',        Icon: ChevronRight,  hint: 'Full right side from front to back',         required: true },
  { id: 'INTERIOR',       label: 'Interior',          Icon: Armchair, hint: 'Dashboard, seats, and general interior condition', required: true },
  { id: 'FUEL_GAUGE',     label: 'Fuel gauge',        Icon: Fuel, hint: 'Clear photo of the dashboard fuel gauge',    required: false }, // dynamically required
  { id: 'OTHER',          label: 'Additional (optional)', Icon: Camera, hint: 'Any other relevant condition',           required: false },
]

interface ExistingPhoto {
  id: string
  url: string
  category: string
  notes: string | null
}

interface ConditionPhotoUploaderProps {
  bookingId: string
  bookingRef: string
  phase: 'PRE_TRIP' | 'POST_TRIP'
  viewerRole: 'CLIENT' | 'OWNER'
  carName: string
  fuelPolicyType: string | null
  fuelGaugeRequired: boolean
  fuelRefuelFee: number | null
  existingPhotos: ExistingPhoto[]
}

interface UploadedPhoto {
  category: string
  url: string
  notes: string
  uploading: boolean
  error: string | null
}

const FUEL_POLICY_LABELS: Record<string, string> = {
  FULL_TO_FULL: 'Full to Full',
  SAME_LEVEL: 'Same Level',
  FREE_TANK: 'Free Tank',
  OWNER_HANDLES: 'Owner Handles',
}

export function ConditionPhotoUploader({
  bookingId,
  bookingRef,
  phase,
  viewerRole,
  carName,
  fuelPolicyType,
  fuelGaugeRequired,
  fuelRefuelFee,
  existingPhotos,
}: ConditionPhotoUploaderProps) {
  const router = useRouter()

  // Build effective steps — make FUEL_GAUGE required if policy demands it
  const effectiveSteps = PHOTO_STEPS.map((step) =>
    step.id === 'FUEL_GAUGE' ? { ...step, required: fuelGaugeRequired } : step,
  )

  // Track uploads per category
  const [uploads, setUploads] = useState<Record<string, UploadedPhoto>>(() => {
    const initial: Record<string, UploadedPhoto> = {}
    for (const step of effectiveSteps) {
      const existing = existingPhotos.find((p) => p.category === step.id)
      if (existing) {
        initial[step.id] = { category: step.id, url: existing.url, notes: existing.notes ?? '', uploading: false, error: null }
      }
    }
    return initial
  })

  const [currentStepIndex, setCurrentStepIndex] = useState(() => {
    // Start at first step that hasn't been uploaded yet
    const firstMissing = effectiveSteps.findIndex(
      (s) => s.required && !existingPhotos.find((p) => p.category === s.id),
    )
    return firstMissing === -1 ? 0 : firstMissing
  })

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const currentStep = effectiveSteps[currentStepIndex]
  const currentUpload = uploads[currentStep.id]

  // Count required + uploaded
  const requiredSteps = effectiveSteps.filter((s) => s.required)
  const uploadedRequired = requiredSteps.filter((s) => uploads[s.id]?.url).length
  const allRequiredDone = uploadedRequired === requiredSteps.length

  // ── Upload handler ──────────────────────────────────────────────────────
  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file) return

      // Validate
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setUploads((prev) => ({
          ...prev,
          [currentStep.id]: {
            category: currentStep.id,
            url: '',
            notes: prev[currentStep.id]?.notes ?? '',
            uploading: false,
            error: 'Please upload a JPG, PNG, or WebP image.',
          },
        }))
        return
      }

      if (file.size > 10 * 1024 * 1024) {
        setUploads((prev) => ({
          ...prev,
          [currentStep.id]: {
            ...prev[currentStep.id],
            uploading: false,
            error: 'Image must be under 10MB.',
            category: currentStep.id,
            url: prev[currentStep.id]?.url ?? '',
            notes: prev[currentStep.id]?.notes ?? '',
          },
        }))
        return
      }

      // Mark as uploading — show preview from object URL immediately
      const previewUrl = URL.createObjectURL(file)
      setUploads((prev) => ({
        ...prev,
        [currentStep.id]: {
          category: currentStep.id,
          url: previewUrl,
          notes: prev[currentStep.id]?.notes ?? '',
          uploading: true,
          error: null,
        },
      }))

      try {
        // Upload to Cloudinary via our API
        const formData = new FormData()
        formData.append('file', file)
        formData.append('folder', 'condition_photos')

        const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData })
        const uploadData = await uploadRes.json()

        if (!uploadData.url) throw new Error('Upload failed')

        // Save photo record to database
        const saveRes = await fetch(`/api/bookings/${bookingId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phase,
            category: currentStep.id,
            imageUrl: uploadData.url,
            notes: uploads[currentStep.id]?.notes ?? '',
          }),
        })

        if (!saveRes.ok) {
          const err = await saveRes.json()
          throw new Error(err.error ?? 'Save failed')
        }

        URL.revokeObjectURL(previewUrl)

        setUploads((prev) => ({
          ...prev,
          [currentStep.id]: {
            ...prev[currentStep.id],
            url: uploadData.url,
            uploading: false,
            error: null,
          },
        }))
      } catch (err: any) {
        URL.revokeObjectURL(previewUrl)
        setUploads((prev) => ({
          ...prev,
          [currentStep.id]: {
            ...prev[currentStep.id],
            url: '',
            uploading: false,
            error: err.message ?? 'Upload failed. Please try again.',
          },
        }))
      }
    },
    [bookingId, currentStep.id, phase, uploads],
  )

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFileSelect(file)
  }

  function goNext() {
    if (currentStepIndex < effectiveSteps.length - 1) {
      setCurrentStepIndex((i) => i + 1)
    }
  }

  function goPrev() {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((i) => i - 1)
    }
  }

  function handleFinish() {
    setDone(true)
    setTimeout(() => router.push(`/dashboard/bookings/${bookingId}`), 2000)
  }

  // ── Done state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 rounded-full bg-brand flex items-center justify-center mx-auto mb-4">
            <Check size={36} className="text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Photos Submitted</h2>
          <p className="text-stone-400">Returning to your booking...</p>
        </motion.div>
      </div>
    )
  }

  // ── Main UI ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-stone-950 text-white">

      {/* ── Header ── */}
      <div className="bg-stone-900 border-b border-stone-800 px-4 py-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center">
              <Camera size={16} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-sm">{phase === 'PRE_TRIP' ? 'Pre-Trip' : 'Post-Trip'} Photos</p>
              <p className="text-stone-400 text-xs">{carName} · {bookingRef}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-stone-400">
              <span>{uploadedRequired} of {requiredSteps.length} required photos</span>
              <span>Step {currentStepIndex + 1} of {effectiveSteps.length}</span>
            </div>
            <div className="h-1.5 bg-stone-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-accent rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(uploadedRequired / requiredSteps.length) * 100}%` }}
                transition={{ duration: 0.4 }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Fuel gauge reminder banner (for applicable policies) ── */}
      {fuelGaugeRequired && phase === 'PRE_TRIP' && (
        <div className="bg-amber-900/40 border-b border-amber-800/50 px-4 py-2.5">
          <div className="max-w-lg mx-auto flex items-center gap-2">
            <Fuel size={14} className="text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300">
              <strong>Fuel policy: {FUEL_POLICY_LABELS[fuelPolicyType ?? ''] ?? fuelPolicyType}</strong>
              {fuelRefuelFee
                ? ` — A refueling fee of RWF ${fuelRefuelFee.toLocaleString()} applies if returned below this level.`
                : ' — Please include a clear photo of the fuel gauge.'}
            </p>
          </div>
        </div>
      )}

      {/* ── Step thumbnails strip ── */}
      <div className="bg-stone-900 border-b border-stone-800 px-4 py-3">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {effectiveSteps.map((step, i) => {
              const isUploaded = !!uploads[step.id]?.url
              const isCurrent = i === currentStepIndex
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStepIndex(i)}
                  className={`
                    relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border-2 transition-all
                    ${isCurrent ? 'border-accent' : isUploaded ? 'border-brand' : 'border-stone-700'}
                  `}
                >
                  {isUploaded ? (
                    <Image
                      loader={cloudinaryLoader}
                      src={uploads[step.id].url}
                      alt={step.label}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-stone-800 flex items-center justify-center text-lg">
                      <step.Icon className="h-4 w-4" aria-hidden />
                    </div>
                  )}
                  {isUploaded && (
                    <div className="absolute inset-0 bg-black/20 flex items-end justify-end p-1">
                      <div className="w-4 h-4 rounded-full bg-brand flex items-center justify-center">
                        <Check size={8} className="text-white" strokeWidth={3} />
                      </div>
                    </div>
                  )}
                  {step.required && !isUploaded && (
                    <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Main upload area ── */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {/* Step header */}
            <div className="flex items-center gap-3">
              <currentStep.Icon className="h-8 w-8 text-brand" aria-hidden />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">{currentStep.label}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    currentStep.required
                      ? 'bg-red-900/50 text-red-300 border border-red-800'
                      : 'bg-stone-800 text-stone-400 border border-stone-700'
                  }`}>
                    {currentStep.required ? 'Required' : 'Optional'}
                  </span>
                </div>
                <p className="text-stone-400 text-sm mt-0.5">{currentStep.hint}</p>
              </div>
            </div>

            {/* Fuel gauge special guidance */}
            {currentStep.id === 'FUEL_GAUGE' && (
              <div className="flex items-start gap-2 bg-amber-900/30 border border-amber-800/50 rounded-xl px-4 py-3">
                <Info size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300 leading-relaxed">
                  Take a clear, well-lit photo of the fuel gauge on the dashboard.
                  This is used as evidence if there is a fuel dispute at return.
                  {fuelRefuelFee ? ` A refueling fee of RWF ${fuelRefuelFee.toLocaleString()} applies if the level changes.` : ''}
                </p>
              </div>
            )}

            {/* Upload zone */}
            {currentUpload?.url && !currentUpload.uploading ? (
              /* Photo preview */
              <div className="relative rounded-2xl overflow-hidden bg-stone-900 aspect-[4/3]">
                <Image
                  loader={cloudinaryLoader}
                  src={currentUpload.url}
                  alt={currentStep.label}
                  fill
                  sizes="(max-width: 768px) 100vw, 640px"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

                {/* Actions overlay */}
                <div className="absolute bottom-3 right-3 flex gap-2">
                  <button
                    onClick={() => setLightboxUrl(currentUpload.url)}
                    className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-black/70 transition-colors"
                  >
                    <ZoomIn size={15} className="text-white" />
                  </button>
                  <button
                    onClick={() => {
                      setUploads((prev) => {
                        const next = { ...prev }
                        delete next[currentStep.id]
                        return next
                      })
                    }}
                    className="w-9 h-9 rounded-full bg-black/50 backdrop-blur flex items-center justify-center hover:bg-red-500/70 transition-colors"
                  >
                    <X size={15} className="text-white" />
                  </button>
                </div>

                <div className="absolute top-3 left-3">
                  <div className="flex items-center gap-1.5 bg-brand px-3 py-1 rounded-full">
                    <Check size={11} className="text-white" strokeWidth={3} />
                    <span className="text-white text-xs font-medium">Uploaded</span>
                  </div>
                </div>
              </div>
            ) : (
              /* Drop zone */
              <label
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="
                  flex flex-col items-center justify-center gap-4
                  aspect-[4/3] rounded-2xl border-2 border-dashed cursor-pointer
                  transition-all bg-stone-900
                  border-stone-700 hover:border-accent/60 hover:bg-stone-800/50
                "
              >
                {currentUpload?.uploading ? (
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-stone-300 text-sm font-medium">Uploading...</p>
                  </div>
                ) : (
                  <div className="text-center px-4">
                    <div className="w-16 h-16 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mx-auto mb-4">
                      <Upload size={24} className="text-stone-400" />
                    </div>
                    <p className="text-white font-semibold mb-1">Tap to upload photo</p>
                    <p className="text-stone-500 text-sm">or drag & drop · JPG, PNG, WebP · max 10MB</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileSelect(file)
                    // Reset input so same file can be re-selected
                    e.target.value = ''
                  }}
                  className="hidden"
                  capture="environment"  // Use camera on mobile
                />
              </label>
            )}

            {/* Error */}
            {currentUpload?.error && (
              <div className="flex items-center gap-2 bg-red-900/30 border border-red-800/50 rounded-xl px-4 py-3">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-sm">{currentUpload.error}</p>
              </div>
            )}

            {/* Optional notes */}
            <div>
              <label className="block text-xs font-medium text-stone-400 mb-1.5">
                Notes (optional)
              </label>
              <input
                type="text"
                value={currentUpload?.notes ?? ''}
                onChange={(e) =>
                  setUploads((prev) => ({
                    ...prev,
                    [currentStep.id]: {
                      ...(prev[currentStep.id] ?? { category: currentStep.id, url: '', uploading: false, error: null }),
                      notes: e.target.value,
                    },
                  }))
                }
                placeholder={currentStep.id === 'FUEL_GAUGE' ? 'e.g. Half tank, gauge pointing to ½' : 'e.g. Scratch on left door from before'}
                className="w-full px-4 py-2.5 rounded-xl bg-stone-800 border border-stone-700 text-white text-sm placeholder:text-stone-500 focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/60"
              />
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ── Navigation ── */}
        <div className="flex items-center justify-between pt-2">
          <button
            onClick={goPrev}
            disabled={currentStepIndex === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-700 text-stone-300 text-sm font-medium hover:border-stone-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          {currentStepIndex < effectiveSteps.length - 1 ? (
            <button
              onClick={goNext}
              disabled={currentStep.required && !uploads[currentStep.id]?.url}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-700 text-white text-sm font-semibold hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={!allRequiredDone || submitting}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-deep disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Check size={16} />
              {allRequiredDone ? 'Submit Photos' : `${requiredSteps.length - uploadedRequired} required remaining`}
            </button>
          )}
        </div>

        {/* ── Overview: all steps ── */}
        <div className="border-t border-stone-800 pt-4 space-y-2">
          <p className="text-xs font-medium text-stone-500 uppercase tracking-wider mb-3">All Photos</p>
          {effectiveSteps.map((step, i) => {
            const uploaded = !!uploads[step.id]?.url
            return (
              <button
                key={step.id}
                onClick={() => setCurrentStepIndex(i)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left
                  ${i === currentStepIndex ? 'bg-stone-800 border border-stone-600' : 'hover:bg-stone-900'}`}
              >
                <span className="text-base w-6 text-center"><step.Icon className="h-4 w-4" aria-hidden /></span>
                <span className={`text-sm flex-1 ${uploaded ? 'text-white' : 'text-stone-400'}`}>
                  {step.label}
                </span>
                {step.required && <span className="text-xs text-red-400">Required</span>}
                {uploaded && <Check size={14} className="text-brand" strokeWidth={2.5} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={lightboxUrl}
              alt="Preview"
              className="max-w-full max-h-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X size={18} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
