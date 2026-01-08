/**
 * PzkLockedModulePanel Component
 *
 * Displays an informational panel when user selects a locked module.
 * Shows:
 * - Reason why module is locked (no access / coming soon / coming soon with access)
 * - CTA to initiate purchase flow for the module (when no access)
 *
 * Props:
 * - moduleNumber: PzkModuleNumber
 * - moduleStatus: 'locked' | 'soon' | 'soon_with_access'
 */

import type { PzkModuleNumber } from '@/types/pzk-dto'
import PzkPurchaseButton from '../PzkPurchaseButton'

interface PzkLockedModulePanelProps {
  moduleNumber: PzkModuleNumber
  moduleStatus: 'locked' | 'soon' | 'soon_with_access'
}

export function PzkLockedModulePanel({
  moduleNumber,
  moduleStatus,
}: PzkLockedModulePanelProps) {
  const hasSoonStatus = moduleStatus === 'soon' || moduleStatus === 'soon_with_access'
  const hasAccess = moduleStatus === 'soon_with_access'
  const showPurchaseButton = moduleStatus === 'locked' || moduleStatus === 'soon'

  return (
    <div
      className="bg-white border-2 border-neutral-light rounded-xl p-8 text-center"
      role="region"
      aria-live="polite"
      data-testid={`pzk-locked-module-panel-${moduleNumber}`}
    >
      {/* Icon */}
      <div className="text-5xl mb-4" aria-hidden="true">
        {hasSoonStatus ? '⏳' : '🔒'}
      </div>

      {/* Title */}
      <h3 className="text-2xl font-heading font-bold text-neutral-dark mb-3">
        {hasSoonStatus
          ? `Moduł ${moduleNumber} dostępny wkrótce`
          : `Brak dostępu do Modułu ${moduleNumber}`}
      </h3>

      {/* Description */}
      <p className="text-neutral-dark/70 mb-6 max-w-md mx-auto">
        {moduleStatus === 'soon_with_access' && (
          'Ten moduł jest obecnie w przygotowaniu. Masz już do niego dostęp. Zostaniesz poinformowany, gdy zostanie opublikowany.'
        )}
        {moduleStatus === 'soon' && (
          'Ten moduł jest obecnie w przygotowaniu. Możesz już teraz zakupić dostęp i otrzymać natychmiastowy dostęp gdy zostanie opublikowany.'
        )}
        {moduleStatus === 'locked' && (
          'Aby uzyskać dostęp do materiałów w tym module, kup dostęp do Przestrzeni Zdrowej Kobiety.'
        )}
      </p>

      {/* CTA Button */}
      {showPurchaseButton && (
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
