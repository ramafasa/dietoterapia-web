/**
 * PzkCategoryAccordionList Component
 *
 * List container for category accordion items.
 *
 * Features:
 * - Renders multiple PzkCategoryAccordionItem components
 * - Delegates toggle events to parent
 * - Vertical spacing between items
 *
 * Props:
 * - categories: Array of PzkCatalogCategoryVM
 * - expandedCategoryIds: Set of expanded category IDs
 * - onToggle: Callback for toggling category
 */

import type { PzkCatalogCategoryVM } from '@/types/pzk-vm'
import { PzkCategoryAccordionItem } from './PzkCategoryAccordionItem'

interface PzkCategoryAccordionListProps {
  categories: PzkCatalogCategoryVM[]
  expandedCategoryIds: Set<string>
  onToggle: (categoryId: string) => void
}

export function PzkCategoryAccordionList({
  categories,
  expandedCategoryIds,
  onToggle,
}: PzkCategoryAccordionListProps) {
  if (categories.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <p className="text-neutral-dark/60">Brak kategorii w tym module.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {categories.map((category) => (
        <PzkCategoryAccordionItem
          key={category.id}
          category={category}
          isExpanded={expandedCategoryIds.has(category.id)}
          onToggle={() => onToggle(category.id)}
        />
      ))}
    </div>
  )
}
