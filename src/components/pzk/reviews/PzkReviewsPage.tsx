/**
 * PzkReviewsPage Component
 *
 * Main container for reviews view. Orchestrates:
 * - Fetching reviews list (GET /api/pzk/reviews)
 * - Fetching my review (GET /api/pzk/reviews/me)
 * - Rendering loading/error/success states
 * - 2-column layout (desktop) / 1-column (mobile)
 *
 * Pattern: Similar to PzkCatalogPage, uses custom hooks
 */

import { PzkInternalNav } from '../catalog/PzkInternalNav'
import { PzkReviewsHeader } from './PzkReviewsHeader'
import { PzkMyReviewPanel } from './PzkMyReviewPanel'
import { PzkReviewsList } from './PzkReviewsList'
import { PzkReviewsLoadingState } from './PzkReviewsLoadingState'
import { PzkReviewsErrorState } from './PzkReviewsErrorState'
import { usePzkReviewsList } from '@/hooks/pzk/usePzkReviewsList'
import { usePzkMyReview } from '@/hooks/pzk/usePzkMyReview'
import type { ReviewSortOptionVM } from '@/types/pzk-vm'

interface PzkReviewsPageProps {
  initialSort?: ReviewSortOptionVM
  initialLimit?: number
}

export function PzkReviewsPage({
  initialSort = 'createdAtDesc',
  initialLimit = 20,
}: PzkReviewsPageProps) {
  // Fetch reviews list
  const reviewsList = usePzkReviewsList(initialSort, initialLimit)

  // Fetch my review
  const myReview = usePzkMyReview()

  // Combined loading state: show loader if either hook is loading initially
  const isLoadingInitial =
    reviewsList.isLoadingInitial || myReview.isLoading

  // Combined error state: prioritize list error, fallback to my review error
  const error = reviewsList.errorInitial || myReview.error

  // Combined retry handler
  const handleRetry = () => {
    if (reviewsList.errorInitial) {
      reviewsList.reload()
    }
    if (myReview.error) {
      myReview.reload()
    }
  }

  // Loading state
  if (isLoadingInitial) {
    return <PzkReviewsLoadingState />
  }

  // Error state
  if (error) {
    return <PzkReviewsErrorState error={error} onRetry={handleRetry} />
  }

  // Success state
  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        {/* Internal Navigation */}
        <PzkInternalNav active="reviews" />

        {/* Header */}
        <PzkReviewsHeader
          sort={reviewsList.sort}
          onSortChange={reviewsList.setSort}
        />

        {/* Layout: 2-column desktop, 1-column mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left: My Review Panel */}
          <div>
            <PzkMyReviewPanel
              initialMyReview={myReview.data}
              onUpsert={myReview.upsert}
              onDelete={myReview.deleteReview}
              isSaving={myReview.isSaving}
              isDeleting={myReview.isDeleting}
            />
          </div>

          {/* Right: Reviews List */}
          <div>
            <PzkReviewsList
              items={reviewsList.items}
              hasMore={reviewsList.hasMore}
              isLoadingMore={reviewsList.isLoadingMore}
              onLoadMore={reviewsList.loadMore}
              error={reviewsList.errorLoadMore}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
