/**
 * PzkLockedModulePanel Component
 *
 * Displays an informational panel when user selects a locked module.
 * Shows:
 * - Reason why module is locked (no access / coming soon)
 * - CTA to purchase page (/pzk/kup) with module parameter
 *
 * Props:
 * - moduleNumber: PzkModuleNumber
 * - moduleStatus: 'locked' | 'soon'
 * - purchaseCtaUrl: string (e.g., "https://example.com/pzk?module=2")
 */

import type { PzkModuleNumber } from '@/types/pzk-dto'

interface PzkLockedModulePanelProps {
  moduleNumber: PzkModuleNumber
  moduleStatus: 'locked' | 'soon'
  purchaseCtaUrl: string
}

export function PzkLockedModulePanel({
  moduleNumber,
  moduleStatus,
  purchaseCtaUrl,
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
        <a
          href={purchaseCtaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          Kup dostęp do Modułu {moduleNumber}
          <span className="sr-only"> (otworzy nową kartę)</span>
        </a>
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
