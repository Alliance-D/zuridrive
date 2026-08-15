'use client'

/**
 * components/photos/PhotoComparisonView.tsx
 *
 * Side-by-side comparison of pre-trip vs post-trip condition photos.
 * Used by:
 *   - Admin during dispute review
 *   - Both parties viewing completed booking
 *
 * Features:
 * - Grouped by category (front, rear, sides, interior, fuel gauge)
 * - Left = pre-trip, Right = post-trip
 * - Click to zoom into either photo
 * - "Same level" indicator for fuel gauge photos
 */

import { useState } from 'react'
import { useTranslations } from "next-intl";
import Image from "next/image";
import cloudinaryLoader from "@/lib/cloudinary-loader";
import { motion, AnimatePresence } from 'framer-motion'
import { X, ZoomIn, ArrowLeftRight, Camera } from 'lucide-react'

interface Photo {
  id: string
  url: string
  category: string
  phase: 'PRE_TRIP' | 'POST_TRIP'
  uploadedBy: 'CLIENT' | 'OWNER'
  createdAt: string
  notes?: string | null
}

interface PhotoComparisonViewProps {
  photos: Photo[]
  title?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  EXTERIOR_FRONT: 'Front',
  EXTERIOR_REAR:  'Rear',
  EXTERIOR_LEFT:  '◀ Left Side',
  EXTERIOR_RIGHT: '▶ Right Side',
  INTERIOR:       'Interior',
  FUEL_GAUGE:     'Fuel Gauge',
  OTHER:          'Other',
}

// Order categories for display
const CATEGORY_ORDER = [
  'EXTERIOR_FRONT', 'EXTERIOR_REAR', 'EXTERIOR_LEFT',
  'EXTERIOR_RIGHT', 'INTERIOR', 'FUEL_GAUGE', 'OTHER',
]

export function PhotoComparisonView({ photos, title = 'Condition Photo Comparison' }: PhotoComparisonViewProps) {
  const t = useTranslations("photos");
  const [lightbox, setLightbox] = useState<{ url: string; label: string } | null>(null)

  // Group photos by category
  const byCategory = CATEGORY_ORDER.reduce<Record<string, { pre: Photo | null; post: Photo | null }>>(
    (acc, cat) => {
      const catPhotos = photos.filter((p) => p.category === cat)
      const pre = catPhotos.find((p) => p.phase === 'PRE_TRIP') ?? null
      const post = catPhotos.find((p) => p.phase === 'POST_TRIP') ?? null
      if (pre || post) {
        acc[cat] = { pre, post }
      }
      return acc
    },
    {},
  )

  const categories = Object.keys(byCategory)

  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center">
        <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Camera size={20} className="text-stone-300" />
        </div>
        <p className="text-stone-400 text-sm">{t("noComparison")}</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowLeftRight size={15} className="text-stone-400" />
          <p className="text-sm font-semibold text-stone-700">{title}</p>
        </div>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-blue-400" />
            <span className="text-stone-500">Before</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="text-stone-500">After</span>
          </div>
        </div>
      </div>

      {/* Comparison grid */}
      <div className="p-5 space-y-5">
        {categories.map((category) => {
          const { pre, post } = byCategory[category]
          return (
            <div key={category}>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
                {CATEGORY_LABELS[category] ?? category}
              </p>

              <div className="grid grid-cols-2 gap-3">
                {/* Pre-trip */}
                <PhotoSlot
                  photo={pre}
                  label="Before"
                  phaseColor="blue"
                  onZoom={(url) => setLightbox({ url, label: `${CATEGORY_LABELS[category]} — Before` })}
                />

                {/* Post-trip */}
                <PhotoSlot
                  photo={post}
                  label="After"
                  phaseColor="amber"
                  onZoom={(url) => setLightbox({ url, label: `${CATEGORY_LABELS[category]} — After` })}
                />
              </div>

              {/* Notes comparison */}
              {(pre?.notes || post?.notes) && (
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <p className="text-xs text-stone-400 italic">{pre?.notes ?? '—'}</p>
                  <p className="text-xs text-stone-400 italic">{post?.notes ?? '—'}</p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-4 gap-3"
          >
            <p className="text-white text-sm font-medium">{lightbox.label}</p>
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              src={lightbox.url}
              alt={lightbox.label}
              className="max-w-full max-h-[80vh] rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={() => setLightbox(null)}
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

// ── Single photo slot ────────────────────────────────────────────────────────

function PhotoSlot({
  photo,
  label,
  phaseColor,
  onZoom,
}: {
  photo: Photo | null
  label: string
  phaseColor: 'blue' | 'amber'
  onZoom: (url: string) => void
}) {
  const t = useTranslations("photos");
  const colorMap = {
    blue: { badge: 'bg-blue-100 text-blue-700 border-blue-200', border: 'border-blue-200' },
    amber: { badge: 'bg-amber-100 text-amber-700 border-amber-200', border: 'border-amber-200' },
  }
  const colors = colorMap[phaseColor]

  if (!photo) {
    return (
      <div className={`aspect-[4/3] rounded-xl border-2 border-dashed ${colors.border} bg-stone-50 flex flex-col items-center justify-center gap-1`}>
        <Camera size={16} className="text-stone-300" />
        <p className="text-xs text-stone-300">{t("notUploaded", { label })}</p>
      </div>
    )
  }

  return (
    <div className="relative group">
      <div className={`relative aspect-[4/3] rounded-xl overflow-hidden border-2 ${colors.border}`}>
        <Image
          loader={cloudinaryLoader}
          src={photo.url}
          alt={label}
          fill
          sizes="(max-width: 768px) 50vw, 320px"
          className="object-cover transition-transform group-hover:scale-105"
        />
      </div>

      {/* Zoom button */}
      <button
        onClick={() => onZoom(photo.url)}
        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-xl"
      >
        <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>

      {/* Phase badge */}
      <div className={`absolute top-1.5 left-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${colors.badge}`}>
        {label}
      </div>

      {/* Uploader badge */}
      <div className="absolute bottom-1.5 right-1.5 text-xs bg-black/50 text-white px-2 py-0.5 rounded-full capitalize">
        {photo.uploadedBy.toLowerCase()}
      </div>
    </div>
  )
}
