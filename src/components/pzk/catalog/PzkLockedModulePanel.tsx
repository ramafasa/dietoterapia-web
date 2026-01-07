/**
 * PzkLockedModulePanel Component
 *
 * Displays an informational panel when user selects a locked module.
 * Shows:
 * - Reason why module is locked (no access / coming soon)
 * - CTA to initiate purchase flow for the module
 *
 * Props:
 * - moduleNumber: PzkModuleNumber
 * - moduleStatus: 'locked' | 'soon'
 */

import type { PzkModuleNumber } from '@/types/pzk-dto'
import PzkPurchaseButton from '../PzkPurchaseButton'

interface PzkLockedModulePanelProps {
  moduleNumber: PzkModuleNumber
  moduleStatus: 'locked' | 'soon'
}

export function PzkLockedModulePanel({
  moduleNumber,
  moduleStatus,
}: PzkLockedModulePanelProps) {
  const isSoon = moduleStatus === 'soon'

  return (
    <div
      className="bg-white border-2 border-neutral-light rounded-xl p-8 text-center"
      role="region"
      aria-live="polite"
      data-testid={`pzk-locked-module-panel-${moduleNumber}`}
    >
      {/* Icon */}
      <div className="text-5xl mb-4" aria-hidden="true">
        {isSoon ? '⏳' : '🔒'}
      </div>

      {/* Title */}
      <h3 className="text-2xl font-heading font-bold text-neutral-dark mb-3">
        {isSoon
          ? `Moduł ${moduleNumber} dostępny wkrótce`
          : `Brak dostępu do Modułu ${moduleNumber}`}
      </h3>

      {/* Description */}
      <p className="text-neutral-dark/70 mb-6 max-w-md mx-auto">
        {isSoon
          ? 'Ten moduł jest obecnie w przygotowaniu. Wkrótce będzie dostępny do zakupu.'
          : 'Aby uzyskać dostęp do materiałów w tym module, kup dostęp do Przestrzeni Zdrowej Kobiety.'}
      </p>

      {/* CTA Button */}
      {!isSoon && (
        <PzkPurchaseButton
          module={moduleNumber}
          label={`Kup dostęp do Modułu ${moduleNumber}`}
          className="inline-block px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        />
      )}

      {/* Back link */}
      <div className="mt-6">
        <a
          href="/pacjent/pzk"
          className="text-primary hover:underline text-sm"
        >
          ← Wróć do PZK
        </a>
      </div>
    </div>
  )
}
