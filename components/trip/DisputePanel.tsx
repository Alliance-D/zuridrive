'use client'

/**
 * components/trip/DisputePanel.tsx
 *
 * Shown when a booking is DISPUTED.
 * Displays: category, description, who opened it, current status.
 * Both parties see the same info — admin resolution details shown when resolved.
 */

import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'

interface DisputePanelProps {
  dispute: {
    id: string
    category: string
    description: string
    status: string
    openedAt: string
  }
  viewerRole: 'CLIENT' | 'OWNER'
}

// Keys, not text — module scope has no translator.
const CATEGORY_LABEL_KEYS: Record<string, string> = {
  DAMAGE: 'disputeDamage',
  FUEL_LEVEL: 'disputeFuel',
  MISSING_ITEMS: 'disputeMissingItems',
  LATE_RETURN: 'disputeLateReturn',
  OTHER: 'disputeOther',
}

const DISPUTE_STATUS_CONFIG: Record<string, { labelKey: string; color: string; bg: string; icon: React.ElementType }> = {
  OPEN: {
    labelKey: 'disputeUnderReview',
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    icon: Clock,
  },
  RESOLVED: {
    labelKey: 'disputeResolved',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: CheckCircle2,
  },
  CLOSED: {
    labelKey: 'disputeClosed',
    color: 'text-stone-600',
    bg: 'bg-stone-50 border-stone-200',
    icon: CheckCircle2,
  },
}

export function DisputePanel({ dispute, viewerRole }: DisputePanelProps) {
  const t = useTranslations('trip')
  const locale = useLocale()
  const config = DISPUTE_STATUS_CONFIG[dispute.status] ?? DISPUTE_STATUS_CONFIG.OPEN
  const StatusIcon = config.icon

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
      <div className="bg-orange-500 px-5 py-4 flex items-center gap-2">
        <AlertTriangle size={16} className="text-white" />
        <p className="text-white font-semibold">{t('disputeOpen')}</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Status */}
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${config.bg}`}>
          <StatusIcon size={16} className={config.color} />
          <div>
            <p className={`text-sm font-semibold ${config.color}`}>{t(config.labelKey)}</p>
            <p className={`text-xs mt-0.5 ${config.color} opacity-80`}>
              {dispute.status === 'OPEN'
                ? t('disputeOpenReview')
                : t('disputeReviewed')}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">{t('category')}</p>
            <p className="text-sm font-medium text-stone-800">
              {t(CATEGORY_LABEL_KEYS[dispute.category] ?? 'disputeOther')}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">{t('description')}</p>
            <p className="text-sm text-stone-700 leading-relaxed">{dispute.description}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">{t('opened')}</p>
            <p className="text-sm text-stone-600">
              {new Date(dispute.openedAt).toLocaleDateString(locale, {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Guidance */}
        <div className="bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
          <p className="text-xs text-stone-600 leading-relaxed">
            <strong>{t('whatHappensNext')}</strong> {t('disputeGuidance')}
          </p>
        </div>
      </div>
    </div>
  )
}
