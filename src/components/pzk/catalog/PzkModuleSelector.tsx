/**
 * PzkModuleSelector Component
 *
 * Tab-based module selector (1, 2, 3) with full A11y support.
 *
 * Features:
 * - ARIA tabs pattern (role="tablist", role="tab")
 * - Keyboard navigation:
 *   - ArrowLeft/ArrowRight: move focus between tabs
 *   - Home/End: focus first/last tab
 *   - Enter/Space: activate focused tab (automatic on button)
 * - Visual indication of active module (badge)
 * - Accessible selected state
 *
 * Props:
 * - modules: Array of module data (module, label, isActive)
 * - selected: Currently selected module number
 * - onChange: Callback when module is selected
 */

import { useRef } from 'react'
import type { PzkCatalogModuleVM } from '@/types/pzk-vm'
import type { PzkModuleNumber } from '@/types/pzk-dto'

interface PzkModuleSelectorProps {
  modules: PzkCatalogModuleVM[]
  selected: PzkModuleNumber
  onChange: (module: PzkModuleNumber) => void
}

export function PzkModuleSelector({
  modules,
  selected,
  onChange,
}: PzkModuleSelectorProps) {
  const tabRefs = useRef<Map<PzkModuleNumber, HTMLButtonElement>>(new Map())

  // Handle keyboard navigation
  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    currentIndex: number
  ) => {
    let targetIndex = currentIndex

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        targetIndex = currentIndex === 0 ? modules.length - 1 : currentIndex - 1
        break

      case 'ArrowRight':
        e.preventDefault()
        targetIndex = currentIndex === modules.length - 1 ? 0 : currentIndex + 1
        break

      case 'Home':
        e.preventDefault()
        targetIndex = 0
        break

      case 'End':
        e.preventDefault()
        targetIndex = modules.length - 1
        break

      default:
        return
    }

    const targetModule = modules[targetIndex]
    if (targetModule) {
      const targetButton = tabRefs.current.get(targetModule.module)
      if (targetButton) {
        targetButton.focus()
      }
    }
  }

  // Helper to compute button styles based on module status
  const getModuleButtonStyles = (
    moduleStatus: 'active' | 'locked' | 'soon',
    isSelected: boolean
  ) => {
    const baseStyles =
      'px-6 py-3 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'

    if (moduleStatus === 'active') {
      // Active module - normal colors
      return isSelected
        ? `${baseStyles} bg-primary text-white`
        : `${baseStyles} bg-white text-neutral-dark border-2 border-neutral-light hover:border-primary/30`
    } else {
      // Locked or soon - dimmed/disabled look
      return isSelected
        ? `${baseStyles} bg-neutral-dark/30 text-white/80 border-2 border-neutral-dark/20`
        : `${baseStyles} bg-neutral-light/50 text-neutral-dark/50 border-2 border-neutral-dark/10 hover:border-neutral-dark/20`
    }
  }

  return (
    <div className="mb-8" data-testid="pzk-module-selector">
      <div role="tablist" className="flex gap-2">
        {modules.map((module, index) => {
          const isSelected = selected === module.module
          const styles = getModuleButtonStyles(module.moduleStatus, isSelected)

          return (
            <button
              key={module.module}
              ref={(el) => {
                if (el) {
                  tabRefs.current.set(module.module, el)
                } else {
                  tabRefs.current.delete(module.module)
                }
              }}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`module-panel-${module.module}`}
              id={`module-tab-${module.module}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onChange(module.module)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={styles}
              data-testid={`pzk-catalog-module-tab-${module.module}`}
            >
              {/* Module label + lock icon for locked modules */}
              <span className="flex items-center gap-2">
                {module.moduleStatus === 'locked' && (
                  <span aria-hidden="true">🔒</span>
                )}
                <span>{module.label}</span>
              </span>

              {/* Badge: Active / Soon */}
              {module.moduleStatus === 'active' && (
                <span className="ml-2 text-xs bg-white/20 px-2 py-1 rounded">
                  Aktywny
                </span>
              )}
              {module.moduleStatus === 'soon' && (
                <span className="ml-2 text-xs bg-neutral-dark/20 px-2 py-1 rounded">
                  Wkrótce
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
