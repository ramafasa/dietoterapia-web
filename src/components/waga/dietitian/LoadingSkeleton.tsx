/**
 * Loading Skeleton
 * Displays animated placeholders while data is loading
 */
export default function LoadingSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Ładowanie danych">
      {/* KPI Widget Skeleton */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="h-6 w-32 bg-neutral-dark/10 rounded animate-pulse mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <div className="h-4 w-24 bg-neutral-dark/10 rounded animate-pulse" />
            <div className="h-10 w-16 bg-neutral-dark/10 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-32 bg-neutral-dark/10 rounded animate-pulse" />
            <div className="h-10 w-16 bg-neutral-dark/10 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 w-28 bg-neutral-dark/10 rounded animate-pulse" />
            <div className="h-10 w-20 bg-neutral-dark/10 rounded animate-pulse" />
          </div>
        </div>
      </div>

      {/* Filters Skeleton */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="h-10 w-48 bg-neutral-dark/10 rounded animate-pulse" />
      </div>

      {/* Table/Cards Skeleton */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 bg-neutral-dark/10 rounded animate-pulse" />
          ))}
        </div>
      </div>

      {/* Pagination Skeleton */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex justify-between items-center">
          <div className="h-5 w-40 bg-neutral-dark/10 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-24 bg-neutral-dark/10 rounded animate-pulse" />
            <div className="h-10 w-24 bg-neutral-dark/10 rounded animate-pulse" />
          </div>
        </div>
      </div>

      <span className="sr-only">Ładowanie danych pacjentów...</span>
    </div>
  )
}
