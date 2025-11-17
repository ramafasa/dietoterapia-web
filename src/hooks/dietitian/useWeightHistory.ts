import { useState, useEffect, useCallback } from 'react'
import type { GetPatientWeightEntriesResponse, WeightEntryDTO } from '../../types'
import type { HistoryView } from '../../types/patient-details'

type UseWeightHistoryParams = {
  patientId: string
  view: HistoryView
  startDate?: string
  endDate?: string
  limit?: number
}

type UseWeightHistoryResult = {
  entries: WeightEntryDTO[]
  hasMore: boolean
  nextCursor: string | null
  weeklyObligationMet: boolean
  isLoading: boolean
  error: string | null
  loadMore: () => Promise<void>
  refetch: () => Promise<void>
}

/**
 * Hook to fetch patient weight history with cursor pagination
 * GET /api/dietitian/patients/:patientId/weight
 */
export function useWeightHistory({
  patientId,
  view,
  startDate,
  endDate,
  limit = 30,
}: UseWeightHistoryParams): UseWeightHistoryResult {
  const [entries, setEntries] = useState<WeightEntryDTO[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [weeklyObligationMet, setWeeklyObligationMet] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  // Build query parameters
  const buildQueryParams = useCallback(
    (cursor?: string) => {
      const params = new URLSearchParams()
      params.set('view', view)
      params.set('limit', limit.toString())

      if (view === 'range' && startDate && endDate) {
        params.set('startDate', startDate)
        params.set('endDate', endDate)
      }

      if (cursor) {
        params.set('cursor', cursor)
      }

      return params.toString()
    },
    [view, startDate, endDate, limit]
  )

  // Fetch initial data
  useEffect(() => {
    const controller = new AbortController()

    async function fetchHistory() {
      setIsLoading(true)
      setError(null)

      try {
        const queryString = buildQueryParams()
        const response = await fetch(
          `/api/dietitian/patients/${patientId}/weight?${queryString}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Pacjent nie został znaleziony')
          } else if (response.status === 403) {
            throw new Error('Brak uprawnień')
          } else if (response.status === 401) {
            throw new Error('Musisz być zalogowany')
          } else if (response.status === 422 || response.status === 400) {
            const errorData = await response.json()
            throw new Error(errorData.message || 'Błędne parametry zapytania')
          } else {
            throw new Error('Wystąpił błąd podczas pobierania historii')
          }
        }

        const result: GetPatientWeightEntriesResponse = await response.json()
        setEntries(result.entries)
        setHasMore(result.pagination.hasMore)
        setNextCursor(result.pagination.nextCursor)
        setWeeklyObligationMet(result.weeklyObligationMet)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchHistory()

    return () => {
      controller.abort()
    }
  }, [patientId, buildQueryParams, refetchTrigger])

  // Load more entries (cursor pagination)
  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || isLoading) return

    setIsLoading(true)

    try {
      const queryString = buildQueryParams(nextCursor)
      const response = await fetch(
        `/api/dietitian/patients/${patientId}/weight?${queryString}`
      )

      if (!response.ok) {
        throw new Error('Wystąpił błąd podczas ładowania kolejnych wpisów')
      }

      const result: GetPatientWeightEntriesResponse = await response.json()

      // Append new entries
      setEntries((prev) => [...prev, ...result.entries])
      setHasMore(result.pagination.hasMore)
      setNextCursor(result.pagination.nextCursor)
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message)
      }
    } finally {
      setIsLoading(false)
    }
  }, [hasMore, nextCursor, isLoading, patientId, buildQueryParams])

  // Refetch (reset to first page)
  const refetch = useCallback(async () => {
    setRefetchTrigger((prev) => prev + 1)
  }, [])

  return {
    entries,
    hasMore,
    nextCursor,
    weeklyObligationMet,
    isLoading,
    error,
    loadMore,
    refetch,
  }
}
