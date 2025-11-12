import { useCallback, useEffect, useRef, useState } from 'react';
import type { GetWeightEntriesResponse, WeightEntryDTO } from '@/types';

type UseWeightHistoryOptions = {
  limit?: number;
};

type UseWeightHistoryState = {
  entries: WeightEntryDTO[];
  isLoading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useWeightHistory(options: UseWeightHistoryOptions = {}): UseWeightHistoryState {
  const { limit = 7 } = options;

  const [entries, setEntries] = useState<WeightEntryDTO[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef<boolean>(false);

  const fetchEntries = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/weight?limit=${limit}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-store'
        },
        signal: abortController.signal
      });

      if (!response.ok) {
        let errorMessage = 'Nie udało się pobrać historii pomiarów.';

        try {
          const errorBody = await response.json();
          if (errorBody && typeof errorBody.message === 'string') {kontyynuuj
            errorMessage = errorBody.message;
          }
        } catch {
          // ignore parsing errors
        }

        throw new Error(errorMessage);
      }

      const data: GetWeightEntriesResponse = await response.json();

      if (isMountedRef.current) {
        setEntries(data.entries);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }

      if (isMountedRef.current) {
        const message =
          err instanceof Error ? err.message : 'Wystąpił nieoczekiwany błąd podczas pobierania historii.';
        setError(message);
        setEntries([]);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [limit]);

  useEffect(() => {
    isMountedRef.current = true;

    void fetchEntries();

    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchEntries]);

  const reload = useCallback(async () => {
    await fetchEntries();
  }, [fetchEntries]);

  return {
    entries,
    isLoading,
    error,
    reload
  };
}

