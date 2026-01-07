/**
 * PzkReviewsList Component
 *
 * Displays list of reviews with "Load More" pagination.
 *
 * Features:
 * - Renders PzkReviewCard[] items
 * - Empty state when no reviews
 * - "Load More" button (disabled when loading or no more items)
 * - Optional inline error for pagination failures
 *
 * Pattern: Cursor-based pagination (opaque cursor from API)
 */

import { PzkReviewCard } from './PzkReviewCard'
import type { PzkReviewListItemVM, PzkInlineErrorVM } from '@/types/pzk-vm'

interface PzkReviewsListProps {
  items: PzkReviewListItemVM[]
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
  error?: PzkInlineErrorVM | null
}

export function PzkReviewsList({
  items,
  hasMore,
  isLoadingMore,
  onLoadMore,
  error,
}: PzkReviewsListProps) {
  // Empty state
  if (items.length === 0) {
    return (
      <section aria-label="Recenzje" className="space-y-4">
        <h2 className="text-xl font-heading font-semibold text-neutral-dark">
          Recenzje
        </h2>
        <div className="bg-white rounded-xl border-2 border-neutral-dark/10 p-8 text-center">
          <p className="text-neutral-dark/60">
            Brak recenzji. Bądź pierwsza!
          </p>
        </div>
      </section>
    )
  }

  return (
    <section aria-label="Recenzje" className="space-y-4">
      <h2 className="text-xl font-heading font-semibold text-neutral-dark">
        Recenzje ({items.length}{hasMore ? '+' : ''})
      </h2>

      {/* Reviews list */}
      <ul className="space-y-4">
        {items.map((review) => (
          <li key={review.id}>
            <PzkReviewCard review={review} />
          </li>
        ))}
      </ul>

      {/* Load More / Error */}
      {hasMore && (
        <div className="flex flex-col items-center gap-2 mt-6">
          {error && (
            <p
              className="text-sm text-red-600 mb-2"
              role="alert"
              aria-live="polite"
            >
              {error.message}
            </p>
          )}

          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={isLoadingMore ? 'Ładowanie więcej recenzji...' : 'Załaduj więcej recenzji'}
          >
            {isLoadingMore ? 'Ładowanie...' : 'Załaduj więcej'}
          </button>
        </div>
      )}
    </section>
  )
}
