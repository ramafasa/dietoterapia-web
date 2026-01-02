/**
 * PzkReviewsHeader Component
 *
 * Page header with title, description, and optional sort selector.
 *
 * Features:
 * - Title and description
 * - Sort dropdown (createdAtDesc | updatedAtDesc)
 *
 * Pattern: Similar to PzkCatalogHeader
 */

import type { ReviewSortOptionVM } from '@/types/pzk-vm'

interface PzkReviewsHeaderProps {
  sort: ReviewSortOptionVM
  onSortChange: (sort: ReviewSortOptionVM) => void
}

export function PzkReviewsHeader({ sort, onSortChange }: PzkReviewsHeaderProps) {
  return (
    <header className="mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-neutral-dark">
          Recenzje PZK
        </h1>

        {/* Sort Selector */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="sort-select"
            className="text-sm font-semibold text-neutral-dark"
          >
            Sortuj:
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ReviewSortOptionVM)}
            className="px-3 py-2 border-2 border-neutral-dark/20 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors"
            aria-label="Wybierz sposób sortowania recenzji"
          >
            <option value="createdAtDesc">Najnowsze</option>
            <option value="updatedAtDesc">Ostatnio zaktualizowane</option>
          </select>
        </div>
      </div>

      <p className="text-lg text-neutral-dark/80 max-w-2xl">
        Zobacz opinie innych uczestniczek Przestrzeni Zdrowej Kobiety i podziel się swoją recenzją.
      </p>
    </header>
  )
}
