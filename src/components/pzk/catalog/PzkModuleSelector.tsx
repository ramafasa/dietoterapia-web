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

import { useRef, useEffect } from 'react'
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

  return (
    <div className="mb-8" data-testid="pzk-module-selector">
      <div role="tablist" className="flex gap-2">
        {modules.map((module, index) => {
          const isSelected = selected === module.module

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
              className={`px-6 py-3 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-white text-neutral-dark border-2 border-neutral-light hover:border-primary/30'
              }`}
              data-testid={`pzk-catalog-module-tab-${module.module}`}
            >
              <span>{module.label}</span>
              {module.isActive && (
                <span className="ml-2 text-xs bg-white/20 px-2 py-1 rounded">
                  Aktywny
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
