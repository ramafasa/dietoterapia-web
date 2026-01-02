/**
 * usePzkMyReview Hook
 *
 * Custom React hook for managing patient's own PZK review.
 *
 * Features:
 * - Fetch my review (GET /api/pzk/reviews/me)
 * - Upsert review (PUT /api/pzk/reviews/me)
 * - Delete review (DELETE /api/pzk/reviews/me)
 * - Local state management (rating, content, isDirty)
 * - Client-side validation (rating 1-6, content 1-5000 chars)
 * - Loading states (isLoading, isSaving, isDeleting)
 * - Error handling with retry
 * - Content preservation on errors
 *
 * Usage:
 * ```tsx
 * const myReview = usePzkMyReview()
 *
 * if (myReview.isLoading) return <LoadingState />
 * if (myReview.error) return <ErrorState error={myReview.error} onRetry={myReview.reload} />
 *
 * return (
 *   <MyReviewPanel
 *     initialMyReview={myReview.data}
 *     onUpsert={myReview.upsert}
 *     onDelete={myReview.delete}
 *   />
 * )
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ApiResponse,
  PzkMyReviewDto,
  PzkReviewUpsertRequest,
} from '@/types/pzk-dto'
import type {
  PzkMyReviewVM,
  PzkRating,
  PzkReviewsErrorVM,
} from '@/types/pzk-vm'
import { mapPzkMyReviewDtoToVm, mapPzkError } from '@/lib/pzk/mappers'

type UsePzkMyReviewReturn = {
  data: PzkMyReviewVM | null
  isLoading: boolean
  isSaving: boolean
  isDeleting: boolean
  error: PzkReviewsErrorVM | null
  reload: () => Promise<void>
  upsert: (req: PzkReviewUpsertRequest) => Promise<void>
  deleteReview: () => Promise<void>
}

/**
 * Hook for managing patient's own review
 *
 * @returns My review state and actions
 */
export function usePzkMyReview(): UsePzkMyReviewReturn {
  const [data, setData] = useState<PzkMyReviewVM | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [error, setError] = useState<PzkReviewsErrorVM | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef<boolean>(false)

  /**
   * Fetch my review from API
   */
  const fetchMyReview = useCallback(async () => {
    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/pzk/reviews/me', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        signal: abortController.signal,
      })

      // Handle non-OK responses
      if (!response.ok) {
        let errorMessage = 'Nie udało się pobrać Twojej recenzji.'

        // Try to parse error from ApiResponse envelope
        try {
          const errorBody: ApiResponse<PzkMyReviewDto | null> =
            await response.json()
          if (errorBody.error && errorBody.error.message) {
            errorMessage = errorBody.error.message
          }
        } catch {
          // Ignore JSON parsing errors
        }

        // Map to user-friendly error
        const mappedError = mapPzkError(response.status, errorMessage)
        throw mappedError
      }

      // Parse successful response
      const apiResponse: ApiResponse<PzkMyReviewDto | null> =
        await response.json()

      // Validate contract: data can be null if no review exists
      if (apiResponse.data === undefined) {
        throw mapPzkError(undefined, 'Nieprawidłowa odpowiedź serwera.')
      }

      // Map DTO → VM (null if no review)
      const reviewVm = apiResponse.data
        ? mapPzkMyReviewDtoToVm(apiResponse.data)
        : null

      // Update state only if component is still mounted
      if (isMountedRef.current) {
        setData(reviewVm)
        setError(null)
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
          setError(err as PzkReviewsErrorVM)
        } else {
          // Otherwise, map generic error
          const message =
            err instanceof Error
              ? err.message
              : 'Wystąpił nieoczekiwany błąd podczas pobierania recenzji.'
          setError(mapPzkError(undefined, message))
        }
        setData(null)
      }
    } finally {
      // Update loading state only if component is still mounted
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  /**
   * Upsert review via PUT API
   *
   * @param req - Review upsert request (rating + content)
   * @throws Error if validation fails or request fails
   */
  const upsert = useCallback(async (req: PzkReviewUpsertRequest) => {
    // Client-side validation
    if (!req.rating || req.rating < 1 || req.rating > 6) {
      throw new Error('Wybierz ocenę od 1 do 6.')
    }

    const trimmedContent = req.content.trim()
    if (trimmedContent.length === 0) {
      throw new Error('Treść recenzji jest wymagana.')
    }

    if (trimmedContent.length > 5000) {
      throw new Error(
        `Recenzja jest za długa (${trimmedContent.length}/5000 znaków).`
      )
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch('/api/pzk/reviews/me', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ rating: req.rating, content: trimmedContent }),
      })

      if (!response.ok) {
        let errorMessage = 'Nie udało się zapisać recenzji.'

        // Try to parse error from ApiResponse envelope
        try {
          const errorBody: ApiResponse<PzkMyReviewDto> = await response.json()
          if (errorBody.error && errorBody.error.message) {
            errorMessage = errorBody.error.message
          }
        } catch {
          // Ignore JSON parsing errors
        }

        // Map specific status codes
        if (response.status === 401) {
          errorMessage = 'Sesja wygasła. Zaloguj się ponownie.'
        } else if (response.status === 403) {
          errorMessage = 'Brak dostępu do recenzji.'
        } else if (response.status === 400) {
          errorMessage = `Nieprawidłowe dane: ${errorMessage}`
        }

        throw new Error(errorMessage)
      }

      // Parse successful response
      const apiResponse: ApiResponse<PzkMyReviewDto> = await response.json()

      if (!apiResponse.data) {
        throw new Error('Nieprawidłowa odpowiedź serwera.')
      }

      // Map DTO → VM
      const reviewVm = mapPzkMyReviewDtoToVm(apiResponse.data)

      // Update state
      if (isMountedRef.current) {
        setData(reviewVm)
        setError(null)
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Wystąpił błąd podczas zapisywania recenzji.'

      throw new Error(message)
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false)
      }
    }
  }, [])

  /**
   * Delete review via DELETE API
   *
   * @throws Error if request fails
   */
  const deleteReview = useCallback(async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch('/api/pzk/reviews/me', {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        let errorMessage = 'Nie udało się usunąć recenzji.'

        // DELETE may return 204 No Content on success
        if (response.status !== 204) {
          try {
            const errorBody = await response.json()
            if (errorBody.error && errorBody.error.message) {
              errorMessage = errorBody.error.message
            }
          } catch {
            // Ignore JSON parsing errors
          }
        }

        // Map specific status codes
        if (response.status === 401) {
          errorMessage = 'Sesja wygasła. Zaloguj się ponownie.'
        } else if (response.status === 403) {
          errorMessage = 'Brak dostępu do recenzji.'
        } else if (response.status === 404) {
          // 404 is OK - review already deleted or doesn't exist
          // Don't throw error, just clear state
          if (isMountedRef.current) {
            setData(null)
            setError(null)
          }
          return
        }

        throw new Error(errorMessage)
      }

      // Success: Clear review state
      if (isMountedRef.current) {
        setData(null)
        setError(null)
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Wystąpił błąd podczas usuwania recenzji.'

      throw new Error(message)
    } finally {
      if (isMountedRef.current) {
        setIsDeleting(false)
      }
    }
  }, [])

  /**
   * Fetch on mount
   */
  useEffect(() => {
    isMountedRef.current = true

    void fetchMyReview()

    // Cleanup: abort request and mark as unmounted
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchMyReview])

  /**
   * Reload function (exposed to components)
   */
  const reload = useCallback(async () => {
    await fetchMyReview()
  }, [fetchMyReview])

  return {
    data,
    isLoading,
    isSaving,
    isDeleting,
    error,
    reload,
    upsert,
    deleteReview,
  }
}
