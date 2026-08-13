'use client'

/**
 * components/trip/ConditionPhotoGrid.tsx
 *
 * Displays pre and post-trip condition photos for a booking.
 * Groups by phase (PRE_TRIP / POST_TRIP).
 * Shows deletion countdown if photos are scheduled for deletion.
 * Locked photos (dispute) show a lock indicator.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Image from "next/image";
import cloudinaryLoader from "@/lib/cloudinary-loader";
import { Clock, Camera, Lock, ZoomIn } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConditionPhoto {
  id: string
  url: string
  phase: string
  uploadedBy: string
  createdAt: string
}

interface ConditionPhotoGridProps {
  photos: ConditionPhoto[]
  deleteAt: string | null
}

export function ConditionPhotoGrid({ photos, deleteAt }: ConditionPhotoGridProps) {
  const t = useTranslations('trip')
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const prePhotos = photos.filter((p) => p.phase === 'PRE_TRIP')
  const postPhotos = photos.filter((p) => p.phase === 'POST_TRIP')

  // Calculate days until deletion
  const daysUntilDeletion = deleteAt
    ? Math.max(0, Math.ceil((new Date(deleteAt).getTime() - Date.now()) / 86400000))
    : null

  const isDeletingSoon = daysUntilDeletion !== null && daysUntilDeletion <= 1
  const isLocked = deleteAt === null && photos.length > 0 // null = locked by dispute

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Camera size={15} className="text-stone-400" />
          <p className="text-sm font-semibold text-stone-700">{t('conditionPhotos')}</p>
        </div>

        {/* Deletion status */}
        {isLocked ? (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
            <Lock size={11} />
            {t('lockedDispute')}
          </div>
        ) : daysUntilDeletion !== null ? (
          <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
            isDeletingSoon
              ? 'text-red-600 bg-red-50 border-red-200'
              : 'text-stone-500 bg-stone-50 border-stone-200'
          }`}>
            <Clock size={11} />
            {daysUntilDeletion === 0
              ? t('deletesToday')
              : t('deletesInDays', { count: daysUntilDeletion })}
          </div>
        ) : null}
      </div>

      <div className="p-5 space-y-5">
        {/* Pre-trip photos */}
        {prePhotos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
              {t('beforeTrip', { count: prePhotos.length })}
            </p>
            <PhotoGrid photos={prePhotos} onZoom={setLightboxUrl} />
          </div>
        )}

        {/* Post-trip photos */}
        {postPhotos.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">
              {t('afterTrip', { count: postPhotos.length })}
            </p>
            <PhotoGrid photos={postPhotos} onZoom={setLightboxUrl} />
          </div>
        )}

        {/* No photos state */}
        {photos.length === 0 && (
          <div className="py-6 text-center">
            <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Camera size={20} className="text-stone-300" />
            </div>
            <p className="text-sm text-stone-400">{t('noConditionPhotos')}</p>
          </div>
        )}

        {/* Deletion warning */}
        {isDeletingSoon && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <p className="text-xs text-red-700 font-medium">
              ⚠️{' '}
              {daysUntilDeletion === 0
                ? t('deletionWarningToday')
                : t('deletionWarningTomorrow')}
            </p>
          </div>
        )}
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxUrl(null)}
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            <motion.img
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              src={lightboxUrl}
              alt={t('conditionPhotoAlt')}
              className="max-w-full max-h-full rounded-xl object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PhotoGrid({
  photos,
  onZoom,
}: {
  photos: ConditionPhoto[]
  onZoom: (url: string) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((photo) => (
        <button
          key={photo.id}
          onClick={() => onZoom(photo.url)}
          className="relative aspect-square rounded-lg overflow-hidden bg-stone-100 group"
        >
          <Image
            loader={cloudinaryLoader}
            src={photo.url}
            alt="Condition photo"
            fill
            sizes="(max-width: 768px) 33vw, 200px"
            className="object-cover transition-transform group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="absolute bottom-1 left-1">
            <span className="text-xs bg-black/50 text-white px-1.5 py-0.5 rounded-full capitalize">
              {photo.uploadedBy.toLowerCase()}
            </span>
          </div>
        </button>
      ))}
    </div>
  )
}
