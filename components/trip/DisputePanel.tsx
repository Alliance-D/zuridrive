'use client'

/**
 * components/trip/DisputePanel.tsx
 *
 * Shown when a booking is DISPUTED.
 * Displays: category, description, who opened it, current status.
 * Both parties see the same info — admin resolution details shown when resolved.
 */

import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'

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

const CATEGORY_LABELS: Record<string, string> = {
  DAMAGE: 'Vehicle Damage',
  FUEL_LEVEL: 'Fuel Level Issue',
  MISSING_ITEMS: 'Missing Items',
  LATE_RETURN: 'Late Return',
  OTHER: 'Other Issue',
}

const DISPUTE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  OPEN: {
    label: 'Under Review',
    color: 'text-orange-700',
    bg: 'bg-orange-50 border-orange-200',
    icon: Clock,
  },
  RESOLVED: {
    label: 'Resolved',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: CheckCircle2,
  },
  CLOSED: {
    label: 'Closed',
    color: 'text-stone-600',
    bg: 'bg-stone-50 border-stone-200',
    icon: CheckCircle2,
  },
}

export function DisputePanel({ dispute, viewerRole }: DisputePanelProps) {
  const config = DISPUTE_STATUS_CONFIG[dispute.status] ?? DISPUTE_STATUS_CONFIG.OPEN
  const StatusIcon = config.icon

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
      <div className="bg-orange-500 px-5 py-4 flex items-center gap-2">
        <AlertTriangle size={16} className="text-white" />
        <p className="text-white font-semibold">Dispute Open</p>
      </div>

      <div className="p-5 space-y-4">
        {/* Status */}
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${config.bg}`}>
          <StatusIcon size={16} className={config.color} />
          <div>
            <p className={`text-sm font-semibold ${config.color}`}>{config.label}</p>
            <p className={`text-xs mt-0.5 ${config.color} opacity-80`}>
              {dispute.status === 'OPEN'
                ? 'Our team is reviewing this. We will contact both parties within 24 hours.'
                : 'This dispute has been reviewed and resolved by our team.'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Category</p>
            <p className="text-sm font-medium text-stone-800">
              {CATEGORY_LABELS[dispute.category] ?? dispute.category}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-stone-700 leading-relaxed">{dispute.description}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-1">Opened</p>
            <p className="text-sm text-stone-600">
              {new Date(dispute.openedAt).toLocaleDateString('en-RW', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Guidance */}
        <div className="bg-stone-50 rounded-xl px-4 py-3 border border-stone-100">
          <p className="text-xs text-stone-600 leading-relaxed">
            <strong>What happens next:</strong> Our team will review the condition photos and contact
            both parties. The deposit will be held until the dispute is resolved.
            If you have additional evidence, please contact support with your booking reference.
          </p>
        </div>
      </div>
    </div>
  )
}
