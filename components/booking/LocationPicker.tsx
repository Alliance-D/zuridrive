'use client'

/**
 * components/booking/LocationPicker.tsx
 *
 * Three-tier location selection:
 *   Tier 1 — Platform fixed locations (admin-managed, trusted)
 *   Tier 2 — Owner custom pickup points
 *   Tier 3 — Client free-text + optional map pin
 *
 * Maps are ALWAYS optional — never forced.
 */

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { MapPin, Building2, Home, PenLine, ChevronDown } from 'lucide-react'

interface PlatformLocation {
  id: string
  name: string
  description: string | null
  icon: string | null
}

interface OwnerLocation {
  id: string
  name: string
  description: string | null
  neighborhood: string | null
  deliveryFee: number
}

interface LocationPickerProps {
  platformLocations: PlatformLocation[]
  ownerLocations: OwnerLocation[]
  selectedId: string | null
  customText: string
  onSelectId: (id: string, deliveryFee?: number) => void
  onCustomText: (text: string) => void
}

type Tab = 'platform' | 'owner' | 'custom'

export function LocationPicker({
  platformLocations,
  ownerLocations,
  selectedId,
  customText,
  onSelectId,
  onCustomText,
}: LocationPickerProps) {
  const t = useTranslations('booking')
  // Default to first available tab
  const defaultTab: Tab =
    platformLocations.length > 0 ? 'platform'
    : ownerLocations.length > 0 ? 'owner'
    : 'custom'

  const [activeTab, setActiveTab] = useState<Tab>(
    selectedId?.startsWith('owner_') ? 'owner'
    : customText ? 'custom'
    : defaultTab,
  )

  const tabs = [
    ...(platformLocations.length > 0 ? [{ id: 'platform' as Tab, label: t('namedLocations'), icon: Building2, color: 'blue' }] : []),
    ...(ownerLocations.length > 0 ? [{ id: 'owner' as Tab, label: t('ownerPickupPoints'), icon: Home, color: 'green' }] : []),
    { id: 'custom' as Tab, label: t('somewhereElse'), icon: PenLine, color: 'amber' },
  ]

  return (
    <div className="space-y-3">
      {/* Tab selector */}
      {tabs.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-all
                  ${isActive
                    ? 'border-brand bg-brand text-white'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300 bg-white'
                  }
                `}
              >
                <Icon size={13} />
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Tier 1: Platform locations */}
      {activeTab === 'platform' && (
        <div className="space-y-2">
          {platformLocations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => onSelectId(loc.id, 0)}
              className={`
                w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                ${selectedId === loc.id
                  ? 'border-brand bg-brand/5'
                  : 'border-stone-200 hover:border-stone-300 bg-white'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden />
                <div>
                  <p className={`text-sm font-medium ${selectedId === loc.id ? 'text-brand' : 'text-stone-800'}`}>
                    {loc.name}
                  </p>
                  {loc.description && (
                    <p className="text-xs text-stone-500">{loc.description}</p>
                  )}
                </div>
                {selectedId === loc.id && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tier 2: Owner locations */}
      {activeTab === 'owner' && (
        <div className="space-y-2">
          {ownerLocations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => onSelectId(loc.id, loc.deliveryFee)}
              className={`
                w-full text-left px-4 py-3 rounded-xl border-2 transition-all
                ${selectedId === loc.id
                  ? 'border-brand bg-brand/5'
                  : 'border-stone-200 hover:border-stone-300 bg-white'
                }
              `}
            >
              <div className="flex items-center gap-3">
                <MapPin size={16} className="text-brand flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${selectedId === loc.id ? 'text-brand' : 'text-stone-800'}`}>
                      {loc.name}
                    </p>
                    {loc.neighborhood && (
                      <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full">
                        {loc.neighborhood}
                      </span>
                    )}
                  </div>
                  {loc.description && (
                    <p className="text-xs text-stone-500 mt-0.5">{loc.description}</p>
                  )}
                  {loc.deliveryFee > 0 && (
                    <p className="text-xs text-accent font-medium mt-0.5">
                      + RWF {loc.deliveryFee.toLocaleString()} delivery fee
                    </p>
                  )}
                </div>
                {selectedId === loc.id && (
                  <div className="ml-auto w-5 h-5 rounded-full bg-brand flex items-center justify-center">
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Tier 3: Custom location */}
      {activeTab === 'custom' && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              {t('describePickup')}
            </label>
            <textarea
              value={customText}
              onChange={(e) => onCustomText(e.target.value)}
              placeholder={t("phCustomLocation")}
              rows={3}
              className="
                w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-sm
                focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand
                resize-none transition-all bg-white
              "
            />
          </div>

          {/* Map pin is always optional */}
          <p className="text-xs text-stone-400 flex items-center gap-1.5">
            <MapPin size={11} />
            Need to add a map pin? You can do this after booking from your dashboard.
          </p>
        </div>
      )}
    </div>
  )
}
