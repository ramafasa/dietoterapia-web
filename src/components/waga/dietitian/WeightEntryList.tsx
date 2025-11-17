import type { WeightEntryDTO } from '../../../types'
import WeightEntryCard from './WeightEntryCard'

type WeightEntryListProps = {
  entries: WeightEntryDTO[]
  hasMore: boolean
  onLoadMore: () => void
  isLoading: boolean
  error?: string | null
}

/**
 * Weight Entry List
 * Displays list of weight entries with pagination
 */
export default function WeightEntryList({
  entries,
  hasMore,
  onLoadMore,
  isLoading,
  error,
}: WeightEntryListProps) {
  // Error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-800 font-semibold mb-2">Wystąpił błąd</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    )
  }

  // Empty state
  if (!isLoading && entries.length === 0) {
    return (
      <div className="bg-neutral-light border border-neutral-dark/10 rounded-lg p-12 text-center">
        <p className="text-neutral-dark/60 text-lg">
          Brak danych dla wybranego okresu
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Entry List */}
      <div className="space-y-4 mb-6">
        {entries.map((entry) => (
          <WeightEntryCard key={entry.id} entry={entry} />
        ))}
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Load More Button */}
      {hasMore && !isLoading && (
        <button
          onClick={onLoadMore}
          className="w-full px-4 py-3 rounded-lg border border-neutral-dark/20 text-neutral-dark font-semibold hover:bg-neutral-dark/5 transition-colors"
        >
          Pokaż więcej
        </button>
      )}
    </div>
  )
}
