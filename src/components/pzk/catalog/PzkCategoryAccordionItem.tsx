/**
 * PzkCategoryAccordionItem Component
 *
 * Single accordion item for a category.
 *
 * Features:
 * - A11y accordion pattern (button + region)
 * - aria-expanded, aria-controls, aria-labelledby
 * - Keyboard navigation (Enter/Space toggle - automatic on button)
 * - Renders PzkMaterialRow components or PzkEmptyCategoryState
 * - Smooth expand/collapse animation
 *
 * Props:
 * - category: PzkCatalogCategoryVM
 * - isExpanded: boolean
 * - onToggle: callback to toggle expansion
 */

import type { PzkCatalogCategoryVM } from '@/types/pzk-vm'
import { PzkMaterialRow } from './PzkMaterialRow'
import { PzkEmptyCategoryState } from './PzkEmptyCategoryState'

interface PzkCategoryAccordionItemProps {
  category: PzkCatalogCategoryVM
  isExpanded: boolean
  onToggle: () => void
}

export function PzkCategoryAccordionItem({
  category,
  isExpanded,
  onToggle,
}: PzkCategoryAccordionItemProps) {
  const panelId = `category-panel-${category.id}`
  const buttonId = `category-button-${category.id}`

  return (
    <div
      className="bg-white rounded-xl border-2 border-neutral-light overflow-hidden"
      data-testid={`pzk-category-accordion-${category.id}`}
    >
      {/* Category Header (Button) */}
      <button
        id={buttonId}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-neutral-light/50 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-heading font-bold text-neutral-dark">
            {category.label}
          </h3>
          {category.description && (
            <p className="text-sm text-neutral-dark/60 mt-1">
              {category.description}
            </p>
          )}
        </div>
        <svg
          className={`h-6 w-6 text-neutral-dark/60 transition-transform flex-shrink-0 ml-4 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Category Panel (Materials) */}
      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="px-6 py-4 border-t-2 border-neutral-light"
        >
          {category.isEmpty ? (
            <PzkEmptyCategoryState categoryLabel={category.label} />
          ) : (
            <div className="space-y-3">
              {category.materials.map((material) => (
                <PzkMaterialRow key={material.id} material={material} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
