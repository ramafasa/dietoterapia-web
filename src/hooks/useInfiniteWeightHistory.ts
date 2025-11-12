import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GetWeightEntriesResponse, WeightEntryDTO, HistoryFiltersVM } from '@/types';

type UseInfiniteWeightHistoryOptions = {
  filters: HistoryFiltersVM;
  pageSize?: number;
};

type UseInfiniteWeightHistoryState = {
  entries: WeightEntryDTO[];
  previousById: Record<string, WeightEntryDTO | undefined>;
  hasMore: boolean;
  nextCursor: string | null;
  isLoading: boolean;
  error: string | null;
  loadFirstPage: () => Promise<void>;
  loadNextPage: () => Promise<void>;
  reset: () => void;
  updateEntry: (id: string, updated: WeightEntryDTO) => void;
  removeEntry: (id: string) => void;
};

export function useInfiniteWeightHistory(
  options: UseInfiniteWeightHistoryOptions
): UseInfiniteWeightHistoryState {
  const { filters, pageSize = 30 } = options;

  const [entries, setEntries] = useState<WeightEntryDTO[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(false);
  const isLoadingRef = useRef<boolean>(false);

  /**
   * Build previousById map for delta calculation
   * Each entry gets its previous entry by chronological order
   */
  const previousById = useMemo(() => {
    const map: Record<string, WeightEntryDTO | undefined> = {};

    // Sort entries by measurementDate DESC (newest first)
    const sorted = [...entries].sort((a, b) => {
      const dateA = new Date(a.measurementDate).getTime();
      const dateB = new Date(b.measurementDate).getTime();
      return dateB - dateA;
    });

    // For each entry, the "previous" is the one that comes after it chronologically
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const previous = sorted[i + 1]; // Previous in time = next in sorted array
      map[current.id] = previous;
    }

    return map;
  }, [entries]);

  /**
   * Fetch weight entries with filters and cursor
   */
  const fetchEntries = useCallback(
    async (cursor: string | null = null): Promise<GetWeightEntriesResponse | null> => {
      // Prevent concurrent requests
      if (isLoadingRef.current) {
        return null;
      }

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      isLoadingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.set('limit', pageSize.toString());

        if (filters.startDate) {
          params.set('startDate', filters.startDate);
        }

        if (filters.endDate) {
          params.set('endDate', filters.endDate);
        }

        if (cursor) {
          params.set('cursor', cursor);
        }

        const response = await fetch(`/api/weight?${params.toString()}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-store'
          },
          signal: abortController.signal
        });

        if (!response.ok) {
          let errorMessage = 'Nie udało się pobrać historii pomiarów.';

          try {
            const errorBody = await response.json();
            if (errorBody && typeof errorBody.message === 'string') {
              errorMessage = errorBody.message;
            }
          } catch {
            // ignore parsing errors
          }

          throw new Error(errorMessage);
        }

        const data: GetWeightEntriesResponse = await response.json();

        return data;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return null;
        }

        if (isMountedRef.current) {
          const message =
            err instanceof Error
              ? err.message
              : 'Wystąpił nieoczekiwany błąd podczas pobierania historii.';
          setError(message);
        }

        return null;
      } finally {
        if (isMountedRef.current) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    },
    [filters.startDate, filters.endDate, pageSize]
  );

  /**
   * Load first page (reset list)
   */
  const loadFirstPage = useCallback(async () => {
    const data = await fetchEntries(null);

    if (data && isMountedRef.current) {
      setEntries(data.entries);
      setHasMore(data.pagination.hasMore);
      setNextCursor(data.pagination.nextCursor);
    }
  }, [fetchEntries]);

  /**
   * Load next page (append to list)
   */
  const loadNextPage = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoadingRef.current) {
      return;
    }

    const data = await fetchEntries(nextCursor);

    if (data && isMountedRef.current) {
      setEntries((prev) => [...prev, ...data.entries]);
      setHasMore(data.pagination.hasMore);
      setNextCursor(data.pagination.nextCursor);
    }
  }, [hasMore, nextCursor, fetchEntries]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setEntries([]);
    setHasMore(false);
    setNextCursor(null);
    setError(null);
    setIsLoading(false);
  }, []);

  /**
   * Update an entry in the list (after PATCH or confirm)
   */
  const updateEntry = useCallback((id: string, updated: WeightEntryDTO) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === id ? updated : entry))
    );
  }, []);

  /**
   * Remove an entry from the list (after DELETE)
   */
  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  /**
   * Load first page when filters change
   */
  useEffect(() => {
    isMountedRef.current = true;

    void loadFirstPage();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loadFirstPage]);

  return {
    entries,
    previousById,
    hasMore,
    nextCursor,
    isLoading,
    error,
    loadFirstPage,
    loadNextPage,
    reset,
    updateEntry,
    removeEntry
  };
}
