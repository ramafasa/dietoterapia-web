/**
 * usePzkReviewsList Hook
 *
 * Custom React hook for fetching and paginating PZK reviews list.
 *
 * Features:
 * - Cursor-based pagination (opaque cursor from API)
 * - Sort options: createdAtDesc | updatedAtDesc
 * - Load more (appends items to existing list)
 * - AbortController for request cancellation
 * - isMountedRef to prevent state updates after unmount
 * - DTO → VM mapping via mapPzkReviewsListToVm
 *
 * Usage:
 * ```tsx
 * const reviews = usePzkReviewsList('createdAtDesc', 20)
 *
 * if (reviews.isLoadingInitial) return <LoadingState />
 * if (reviews.errorInitial) return <ErrorState error={reviews.errorInitial} onRetry={reviews.reload} />
 *
 * return (
 *   <ReviewsList
 *     items={reviews.items}
 *     hasMore={reviews.hasMore}
 *     isLoadingMore={reviews.isLoadingMore}
 *     onLoadMore={reviews.loadMore}
 *   />
 * )
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApiResponse,
  PzkReviewsList,
  PzkReviewsQueryParams,
} from '@/types/pzk-dto'
import type {
  PzkReviewListItemVM,
  ReviewSortOptionVM,
  PzkReviewsErrorVM,
  PzkInlineErrorVM,
} from '@/types/pzk-vm'
import { mapPzkReviewsListToVm, mapPzkError } from '@/lib/pzk/mappers'

type UsePzkReviewsListReturn = {
  items: PzkReviewListItemVM[]
  hasMore: boolean
  isLoadingInitial: boolean
  isLoadingMore: boolean
  errorInitial: PzkReviewsErrorVM | null
  errorLoadMore: PzkInlineErrorVM | null
  sort: ReviewSortOptionVM
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  setSort: (sort: ReviewSortOptionVM) => void
}

/**
 * Fetch PZK reviews list with cursor pagination
 *
 * @param initialSort - Initial sort option (default: 'createdAtDesc')
 * @param limit - Page size (default: 20, max: 50)
 * @returns Reviews list state and actions
 */
export function usePzkReviewsList(
  initialSort: ReviewSortOptionVM = 'createdAtDesc',
  limit: number = 20
): UsePzkReviewsListReturn {
  const [items, setItems] = useState<PzkReviewListItemVM[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [sort, setSort] = useState<ReviewSortOptionVM>(initialSort)

  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(false)
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false)

  const [errorInitial, setErrorInitial] = useState<PzkReviewsErrorVM | null>(
    null
  )
  const [errorLoadMore, setErrorLoadMore] = useState<PzkInlineErrorVM | null>(
    null
  )

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef<boolean>(false)

  /**
   * Fetch reviews from API
   *
   * @param cursor - Pagination cursor (undefined for first page)
   * @param isInitialLoad - Whether this is the initial load (vs. load more)
   */
  const fetchReviews = useCallback(
    async (cursor: string | undefined, isInitialLoad: boolean) => {
      // Cancel previous request if still in flight
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      // Set appropriate loading state
      if (isInitialLoad) {
        setIsLoadingInitial(true)
        setErrorInitial(null)
      } else {
        setIsLoadingMore(true)
        setErrorLoadMore(null)
      }

      try {
        // Build query params
        const params = new URLSearchParams()
        params.set('sort', sort)
        params.set('limit', limit.toString())
        if (cursor) {
          params.set('cursor', cursor)
        }

        const response = await fetch(`/api/pzk/reviews?${params.toString()}`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-store',
          },
          signal: abortController.signal,
        })

        // Handle non-OK responses
        if (!response.ok) {
          let errorMessage = 'Nie udało się pobrać recenzji.'

          // Try to parse error from ApiResponse envelope
          try {
            const errorBody: ApiResponse<PzkReviewsList> = await response.json()
            if (errorBody.error && errorBody.error.message) {
              errorMessage = errorBody.error.message
            }
          } catch {
            // Ignore JSON parsing errors
          }

          // Map to user-friendly error
          const mappedError = mapPzkError(response.status, errorMessage)

          // Set appropriate error state
          if (isInitialLoad) {
            throw mappedError
          } else {
            // For loadMore, show inline error
            if (isMountedRef.current) {
              setErrorLoadMore({
                message: mappedError.message,
                retryable: mappedError.retryable,
              })
            }
            return
          }
        }

        // Parse successful response
        const apiResponse: ApiResponse<PzkReviewsList> = await response.json()

        // Validate contract: data must exist in successful response
        if (!apiResponse.data) {
          throw mapPzkError(undefined, 'Nieprawidłowa odpowiedź serwera.')
        }

        // Map DTO → VM
        const listVm = mapPzkReviewsListToVm(apiResponse.data, sort, limit)

        // Update state only if component is still mounted
        if (isMountedRef.current) {
          if (isInitialLoad) {
            // Initial load: replace items
            setItems(listVm.items)
          } else {
            // Load more: append items
            setItems((prev) => [...prev, ...listVm.items])
          }

          setNextCursor(listVm.nextCursor)
          setErrorInitial(null)
          setErrorLoadMore(null)
        }
      } catch (err) {
        // Handle AbortError (request cancelled)
        if (err instanceof DOMException && err.name === 'AbortError') {
          return
        }

        // Update error state only if component is still mounted
        if (isMountedRef.current) {
          // If error is already a PzkReviewsErrorVM, use it directly
          if (
            err &&
            typeof err === 'object' &&
            'kind' in err &&
            'message' in err
          ) {
            if (isInitialLoad) {
              setErrorInitial(err as PzkReviewsErrorVM)
              setItems([])
            } else {
              setErrorLoadMore({
                message: (err as PzkReviewsErrorVM).message,
                retryable: (err as PzkReviewsErrorVM).retryable,
              })
            }
          } else {
            // Otherwise, map generic error
            const message =
              err instanceof Error
                ? err.message
                : 'Wystąpił nieoczekiwany błąd podczas pobierania recenzji.'
            const mappedError = mapPzkError(undefined, message)

            if (isInitialLoad) {
              setErrorInitial(mappedError)
              setItems([])
            } else {
              setErrorLoadMore({
                message: mappedError.message,
                retryable: mappedError.retryable,
              })
            }
          }
        }
      } finally {
        // Update loading state only if component is still mounted
        if (isMountedRef.current) {
          if (isInitialLoad) {
            setIsLoadingInitial(false)
          } else {
            setIsLoadingMore(false)
          }
        }
      }
    },
    [sort, limit]
  )

  /**
   * Fetch initial page on mount or when sort changes
   */
  useEffect(() => {
    isMountedRef.current = true

    // Reset state and fetch first page
    setItems([])
    setNextCursor(null)
    setErrorInitial(null)
    setErrorLoadMore(null)

    void fetchReviews(undefined, true)

    // Cleanup: abort request and mark as unmounted
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchReviews])

  /**
   * Reload function (exposed to components)
   */
  const reload = useCallback(async () => {
    setItems([])
    setNextCursor(null)
    setErrorLoadMore(null)
    await fetchReviews(undefined, true)
  }, [fetchReviews])

  /**
   * Load more function (exposed to components)
   */
  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) {
      return
    }

    await fetchReviews(nextCursor, false)
  }, [nextCursor, isLoadingMore, fetchReviews])

  /**
   * Change sort (triggers reload)
   */
  const handleSetSort = useCallback((newSort: ReviewSortOptionVM) => {
    setSort(newSort)
    // fetchReviews will be called by useEffect when sort changes
  }, [])

  return {
    items,
    hasMore: nextCursor !== null,
    isLoadingInitial,
    isLoadingMore,
    errorInitial,
    errorLoadMore,
    sort,
    reload,
    loadMore,
    setSort: handleSetSort,
  }
}
