/**
 * PzkReviewsLoadingState Component
 *
 * Skeleton loader for initial reviews page load.
 * Displays placeholders for:
 * - Header
 * - My Review Panel
 * - Reviews List
 *
 * Pattern: Similar to PzkCatalogLoadingState / PzkMaterialDetailsLoadingState
 */

export function PzkReviewsLoadingState() {
  return (
    <div className="min-h-screen bg-neutral-light animate-pulse">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        {/* Internal Nav Skeleton */}
        <div className="h-12 bg-neutral-dark/10 rounded-lg mb-8 max-w-md" />

        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="h-10 bg-neutral-dark/10 rounded-lg mb-4 max-w-sm" />
          <div className="h-6 bg-neutral-dark/10 rounded-lg max-w-xl" />
        </div>

        {/* Layout: 2-column desktop, 1-column mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* My Review Panel Skeleton */}
          <div className="bg-white rounded-xl border-2 border-neutral-dark/10 p-6">
            <div className="h-6 bg-neutral-dark/10 rounded-lg mb-4 max-w-xs" />
            <div className="space-y-4">
              <div className="h-10 bg-neutral-dark/10 rounded-lg" />
              <div className="h-32 bg-neutral-dark/10 rounded-lg" />
              <div className="h-10 bg-neutral-dark/10 rounded-lg max-w-xs" />
            </div>
          </div>

          {/* Reviews List Skeleton */}
          <div className="space-y-4">
            <div className="h-6 bg-neutral-dark/10 rounded-lg mb-4 max-w-xs" />
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border-2 border-neutral-dark/10 p-6"
              >
                <div className="h-5 bg-neutral-dark/10 rounded-lg mb-3 max-w-xs" />
                <div className="h-4 bg-neutral-dark/10 rounded-lg mb-2 max-w-sm" />
                <div className="h-4 bg-neutral-dark/10 rounded-lg max-w-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
