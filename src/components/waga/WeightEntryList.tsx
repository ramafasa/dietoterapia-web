import { useEffect } from 'react';
import type { WeightEntryDTO } from '@/types';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import WeightEntryHistoryCard from './WeightEntryHistoryCard';

type WeightEntryListProps = {
  entries: WeightEntryDTO[];
  previousById: Record<string, WeightEntryDTO | undefined>;
  hasMore: boolean;
  isLoading: boolean;
  error?: string | null;
  onLoadMore: () => void;
  onEdit: (entry: WeightEntryDTO) => void;
  onDelete: (entry: WeightEntryDTO) => void;
  onConfirmOutlier: (entry: WeightEntryDTO) => void;
};

export default function WeightEntryList({
  entries,
  previousById,
  hasMore,
  isLoading,
  error,
  onLoadMore,
  onEdit,
  onDelete,
  onConfirmOutlier
}: WeightEntryListProps) {
  // Intersection observer for infinite scroll
  const { elementRef, isVisible } = useIntersectionObserver({
    threshold: 0.1,
    rootMargin: '100px',
    triggerOnce: false
  });

  // Trigger onLoadMore when sentinel is visible
  useEffect(() => {
    if (isVisible && hasMore && !isLoading) {
      onLoadMore();
    }
  }, [isVisible, hasMore, isLoading, onLoadMore]);

  // Error state
  if (error && entries.length === 0) {
    return (
      <div className="bg-white border border-rose-200 rounded-xl p-6 text-center">
        <p className="text-rose-600 font-medium mb-4">{error}</p>
        <button
          type="button"
          onClick={onLoadMore}
          className="px-4 py-2 bg-primary text-white rounded-lg font-semibold
                   hover:bg-primary/90 transition-colors"
        >
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  // Empty state
  if (!isLoading && entries.length === 0 && !error) {
    return (
      <div className="bg-white border border-neutral-light rounded-xl p-8 text-center">
        <p className="text-neutral-dark/60 text-lg font-medium">
          Brak pomiarów do wyświetlenia
        </p>
        <p className="text-neutral-dark/50 text-sm mt-2">
          Spróbuj zmienić filtry lub dodaj nowy pomiar
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-24">
      {/* Entry Cards */}
      {entries.map((entry) => (
        <WeightEntryHistoryCard
          key={entry.id}
          entry={entry}
          previous={previousById[entry.id]}
          onEdit={onEdit}
          onDelete={onDelete}
          onConfirmOutlier={onConfirmOutlier}
        />
      ))}

      {/* Loading Spinner */}
      {isLoading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Sentinel for Intersection Observer */}
      {hasMore && !isLoading && (
        <div
          ref={elementRef as React.RefObject<HTMLDivElement>}
          className="h-4"
          aria-hidden="true"
        />
      )}

      {/* End of List Message */}
      {!hasMore && entries.length > 0 && (
        <p className="text-center text-sm text-neutral-dark/50 py-4">
          Wyświetlono wszystkie pomiary
        </p>
      )}
    </div>
  );
}
