/**
 * PzkCatalogPage Component
 *
 * Main container for the PZK Catalog view.
 * Orchestrates:
 * - Data fetching via usePzkCatalog hook
 * - Loading, error, and success states
 * - Module selection and category accordion
 *
 * Props:
 * - initialSelectedModule: PzkModuleNumber (optional, defaults to first active module or 1)
 */

import { useState } from 'react'
import type { PzkModuleNumber } from '@/types/pzk-dto'
import { usePzkCatalog } from '@/hooks/pzk/usePzkCatalog'
import { PzkInternalNav } from './PzkInternalNav'
import { PzkCatalogHeader } from './PzkCatalogHeader'
import { PzkModuleSelector } from './PzkModuleSelector'
import { PzkCategoryAccordionList } from './PzkCategoryAccordionList'
import { PzkCatalogLoadingState } from './PzkCatalogLoadingState'
import { PzkCatalogErrorState } from './PzkCatalogErrorState'
import { PzkLockedModulePanel } from './PzkLockedModulePanel'

interface PzkCatalogPageProps {
  initialSelectedModule?: PzkModuleNumber
}

export function PzkCatalogPage({
  initialSelectedModule,
}: PzkCatalogPageProps) {
  const { catalog, isLoading, error, reload } = usePzkCatalog()

  // State: selected module
  const [selectedModule, setSelectedModule] = useState<PzkModuleNumber>(() => {
    // Initialize from prop, or first active module from catalog, or fallback to 1
    if (initialSelectedModule) {
      return initialSelectedModule
    }
    if (catalog && catalog.modules.length > 0) {
      const firstActive = catalog.modules.find((m) => m.isActive)
      return firstActive?.module ?? 1
    }
    return 1
  })

  // State: expanded category IDs (accordion)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    new Set()
  )

  // Handler: toggle category accordion
  const handleToggleCategory = (categoryId: string) => {
    setExpandedCategoryIds((prev) => {
      const next = new Set(prev)
      if (next.has(categoryId)) {
        next.delete(categoryId)
      } else {
        next.add(categoryId)
      }
      return next
    })
  }

  // Loading state
  if (isLoading) {
    return <PzkCatalogLoadingState />
  }

  // Error state
  if (error) {
    return <PzkCatalogErrorState error={error} onRetry={reload} />
  }

  // No catalog data (edge case)
  if (!catalog) {
    return (
      <div className="min-h-screen bg-neutral-light">
        <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
          <div className="flex items-center justify-center min-h-[400px]">
            <p className="text-neutral-dark/60">Brak danych katalogu.</p>
          </div>
        </div>
      </div>
    )
  }

  // Success: render catalog
  const selectedModuleData = catalog.modules.find(
    (m) => m.module === selectedModule
  )

  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        {/* Internal Navigation */}
        <PzkInternalNav active="catalog" />

        {/* Header */}
        <PzkCatalogHeader />

        {/* Module Selector (Tabs) */}
        <PzkModuleSelector
          modules={catalog.modules}
          selected={selectedModule}
          onChange={setSelectedModule}
        />

        {/* Module Panel (Categories + Materials OR Locked Info) */}
        {selectedModuleData && (
          <section
            aria-label={`Moduł ${selectedModule}`}
            id={`module-panel-${selectedModule}`}
          >
            {/* Show locked panel if module is locked/soon */}
            {(selectedModuleData.moduleStatus === 'locked' ||
              selectedModuleData.moduleStatus === 'soon') && (
              <PzkLockedModulePanel
                moduleNumber={selectedModuleData.module}
                moduleStatus={selectedModuleData.moduleStatus}
                purchaseCtaUrl={
                  catalog.purchaseCta.baseUrl +
                  '?' +
                  catalog.purchaseCta.paramName +
                  '=' +
                  selectedModuleData.module
                }
              />
            )}

            {/* Show categories accordion if module is active */}
            {selectedModuleData.moduleStatus === 'active' && (
              <PzkCategoryAccordionList
                categories={selectedModuleData.categories}
                expandedCategoryIds={expandedCategoryIds}
                onToggle={handleToggleCategory}
              />
            )}
          </section>
        )}
      </div>
    </div>
  )
}
