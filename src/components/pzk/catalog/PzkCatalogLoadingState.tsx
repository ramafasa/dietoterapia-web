/**
 * PzkCatalogLoadingState Component
 *
 * Skeleton UI displayed while catalog data is loading.
 *
 * Features:
 * - Placeholder for tabs (module selector)
 * - Placeholder for 3 category cards
 * - Each card has 2-3 material row placeholders
 * - Pulse animation (animate-pulse)
 *
 * Props:
 * - rows: Number of skeleton category cards (default: 3)
 */

interface PzkCatalogLoadingStateProps {
  rows?: number
}

export function PzkCatalogLoadingState({ rows = 3 }: PzkCatalogLoadingStateProps) {
  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        {/* Internal Nav Skeleton */}
        <div className="mb-8 flex gap-4">
          <div className="h-10 w-24 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
          <div className="h-10 w-24 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
        </div>

        {/* Header Skeleton */}
        <div className="mb-8">
          <div className="h-10 w-48 bg-neutral-dark/10 rounded mb-2 animate-pulse"></div>
          <div className="h-6 w-96 bg-neutral-dark/10 rounded animate-pulse"></div>
        </div>

        {/* Module Selector Skeleton */}
        <div className="mb-8 flex gap-2">
          <div className="h-12 w-32 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
          <div className="h-12 w-32 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
          <div className="h-12 w-32 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
        </div>

        {/* Category Accordion Skeleton */}
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border-2 border-neutral-light p-6"
            >
              {/* Category Header */}
              <div className="mb-4">
                <div className="h-6 w-48 bg-neutral-dark/10 rounded mb-2 animate-pulse"></div>
                <div className="h-4 w-96 bg-neutral-dark/10 rounded animate-pulse"></div>
              </div>

              {/* Material Rows Skeleton */}
              <div className="space-y-3">
                {Array.from({ length: 2 }, (_, j) => (
                  <div
                    key={j}
                    className="bg-neutral-light/60 rounded-xl p-4"
                  >
                    <div className="h-5 w-64 bg-neutral-dark/10 rounded mb-2 animate-pulse"></div>
                    <div className="h-4 w-full bg-neutral-dark/10 rounded mb-3 animate-pulse"></div>
                    <div className="flex gap-2">
                      <div className="h-6 w-16 bg-neutral-dark/10 rounded animate-pulse"></div>
                      <div className="h-6 w-16 bg-neutral-dark/10 rounded animate-pulse"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Loading indicator */}
        <div className="mt-8 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="text-neutral-dark/60 mt-2">Ładowanie katalogu...</p>
        </div>
      </div>
    </div>
  )
}
