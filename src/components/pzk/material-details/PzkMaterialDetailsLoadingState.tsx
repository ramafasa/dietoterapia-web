/**
 * PzkMaterialDetailsLoadingState Component
 *
 * Skeleton UI displayed while material details are loading.
 *
 * Features:
 * - Placeholder for breadcrumbs
 * - Placeholder for header (title, description, badge)
 * - Placeholder for content sections
 * - Pulse animation (animate-pulse)
 */

export function PzkMaterialDetailsLoadingState() {
  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        {/* Internal Nav Skeleton */}
        <div className="mb-8 flex gap-4">
          <div className="h-10 w-24 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
          <div className="h-10 w-24 bg-neutral-dark/10 rounded-lg animate-pulse"></div>
        </div>

        {/* Breadcrumbs Skeleton */}
        <div className="mb-6 flex gap-2 items-center">
          <div className="h-4 w-16 bg-neutral-dark/10 rounded animate-pulse"></div>
          <div className="h-4 w-4 bg-neutral-dark/10 rounded animate-pulse"></div>
          <div className="h-4 w-20 bg-neutral-dark/10 rounded animate-pulse"></div>
          <div className="h-4 w-4 bg-neutral-dark/10 rounded animate-pulse"></div>
          <div className="h-4 w-32 bg-neutral-dark/10 rounded animate-pulse"></div>
        </div>

        {/* Header Skeleton */}
        <header className="mb-8">
          <div className="flex items-start gap-4 mb-4">
            <div className="h-8 flex-1 bg-neutral-dark/10 rounded animate-pulse"></div>
            <div className="h-8 w-32 bg-neutral-dark/10 rounded-full animate-pulse"></div>
          </div>
          <div className="h-6 w-full bg-neutral-dark/10 rounded mb-2 animate-pulse"></div>
          <div className="h-6 w-3/4 bg-neutral-dark/10 rounded animate-pulse"></div>
        </header>

        {/* Content Skeleton */}
        <div className="space-y-6">
          {/* Main Content */}
          <div className="bg-white rounded-xl border-2 border-neutral-light p-6">
            <div className="space-y-3">
              <div className="h-4 w-full bg-neutral-dark/10 rounded animate-pulse"></div>
              <div className="h-4 w-full bg-neutral-dark/10 rounded animate-pulse"></div>
              <div className="h-4 w-3/4 bg-neutral-dark/10 rounded animate-pulse"></div>
            </div>
          </div>

          {/* PDF Section Skeleton */}
          <div className="bg-white rounded-xl border-2 border-neutral-light p-6">
            <div className="h-6 w-32 bg-neutral-dark/10 rounded mb-4 animate-pulse"></div>
            <div className="space-y-3">
              <div className="h-12 w-full bg-neutral-dark/10 rounded-lg animate-pulse"></div>
              <div className="h-12 w-full bg-neutral-dark/10 rounded-lg animate-pulse"></div>
            </div>
          </div>

          {/* Video Section Skeleton */}
          <div className="bg-white rounded-xl border-2 border-neutral-light p-6">
            <div className="h-6 w-24 bg-neutral-dark/10 rounded mb-4 animate-pulse"></div>
            <div className="aspect-video w-full bg-neutral-dark/10 rounded-lg animate-pulse"></div>
          </div>
        </div>

        {/* Loading indicator */}
        <div className="mt-8 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="text-neutral-dark/60 mt-2">Ładowanie materiału...</p>
        </div>
      </div>
    </div>
  )
}
