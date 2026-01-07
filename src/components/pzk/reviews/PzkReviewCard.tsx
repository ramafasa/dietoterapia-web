/**
 * PzkReviewCard Component
 *
 * Displays a single review in the list.
 *
 * Features:
 * - Author first name (fallback: "Anonim")
 * - Rating badge (1-6)
 * - Review content
 * - Timestamps (created, optionally updated)
 *
 * Pattern: Simple read-only card, no interactions
 */

import type { PzkReviewListItemVM } from '@/types/pzk-vm'

interface PzkReviewCardProps {
  review: PzkReviewListItemVM
}

export function PzkReviewCard({ review }: PzkReviewCardProps) {
  const showUpdatedDate =
    review.updatedAtLabel && review.updatedAtLabel !== review.createdAtLabel

  return (
    <article
      className="bg-white rounded-xl border-2 border-neutral-dark/10 p-6 focus-within:border-primary/30 transition-colors"
      aria-label={`Recenzja od ${review.authorFirstName}`}
    >
      {/* Header: Author + Rating */}
      <header className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* Author */}
          <p className="font-semibold text-neutral-dark">
            {review.authorFirstName}
          </p>

          {/* Rating Badge */}
          <span
            className="inline-flex items-center justify-center px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-semibold"
            aria-label={`Ocena: ${review.rating} z 6`}
          >
            {review.rating}/6
          </span>
        </div>
      </header>

      {/* Content */}
      <p className="text-neutral-dark/80 mb-4 whitespace-pre-wrap">
        {review.content}
      </p>

      {/* Timestamps */}
      <footer className="text-sm text-neutral-dark/60">
        <time dateTime={review.createdAtIso}>
          Dodano: {review.createdAtLabel}
        </time>
        {showUpdatedDate && (
          <>
            {' • '}
            <time dateTime={review.updatedAtIso}>
              Zaktualizowano: {review.updatedAtLabel}
            </time>
          </>
        )}
      </footer>
    </article>
  )
}
