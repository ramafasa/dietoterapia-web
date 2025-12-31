/**
 * usePzkCatalog Hook
 *
 * Custom React hook for fetching PZK catalog data from the API.
 * Handles loading state, errors, and provides reload capability.
 *
 * Features:
 * - AbortController for request cancellation (cleanup on unmount)
 * - isMountedRef to prevent state updates after unmount
 * - DTO → VM mapping via mapPzkCatalogToVm
 * - ApiResponse envelope parsing
 * - User-friendly error messages via mapPzkError
 *
 * Usage:
 * ```tsx
 * const { catalog, isLoading, error, reload } = usePzkCatalog()
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiResponse, PzkCatalog } from '@/types/pzk-dto'
import type { PzkCatalogVM, PzkCatalogErrorVM } from '@/types/pzk-vm'
import { mapPzkCatalogToVm, mapPzkError } from '@/lib/pzk/mappers'

type UsePzkCatalogState = {
  catalog: PzkCatalogVM | null
  isLoading: boolean
  error: PzkCatalogErrorVM | null
  reload: () => Promise<void>
}

/**
 * Fetch PZK catalog data from API
 *
 * @returns Catalog state and reload function
 *
 * @example
 * const { catalog, isLoading, error, reload } = usePzkCatalog()
 *
 * if (isLoading) return <LoadingState />
 * if (error) return <ErrorState error={error} onRetry={reload} />
 * if (!catalog) return null
 *
 * return <CatalogView catalog={catalog} />
 */
export function usePzkCatalog(): UsePzkCatalogState {
  const [catalog, setCatalog] = useState<PzkCatalogVM | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<PzkCatalogErrorVM | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef<boolean>(false)

  const fetchCatalog = useCallback(async () => {
    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/pzk/catalog', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        signal: abortController.signal,
      })

      // Handle non-OK responses
      if (!response.ok) {
        let errorMessage = 'Nie udało się pobrać katalogu.'

        // Try to parse error from ApiResponse envelope
        try {
          const errorBody: ApiResponse<PzkCatalog> = await response.json()
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
      const apiResponse: ApiResponse<PzkCatalog> = await response.json()

      // Validate contract: data must exist in successful response
      if (!apiResponse.data) {
        throw mapPzkError(undefined, 'Nieprawidłowa odpowiedź serwera.')
      }

      // Map DTO → VM
      const catalogVm = mapPzkCatalogToVm(apiResponse.data)

      // Update state only if component is still mounted
      if (isMountedRef.current) {
        setCatalog(catalogVm)
        setError(null)
      }
    } catch (err) {
      // Handle AbortError (request cancelled)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      // Update error state only if component is still mounted
      if (isMountedRef.current) {
        // If error is already a PzkCatalogErrorVM, use it directly
        if (
          err &&
          typeof err === 'object' &&
          'kind' in err &&
          'message' in err
        ) {
          setError(err as PzkCatalogErrorVM)
        } else {
          // Otherwise, map generic error
          const message =
            err instanceof Error
              ? err.message
              : 'Wystąpił nieoczekiwany błąd podczas pobierania katalogu.'
          setError(mapPzkError(undefined, message))
        }
        setCatalog(null)
      }
    } finally {
      // Update loading state only if component is still mounted
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    isMountedRef.current = true

    void fetchCatalog()

    // Cleanup: abort request and mark as unmounted
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchCatalog])

  // Reload function (exposed to components)
  const reload = useCallback(async () => {
    await fetchCatalog()
  }, [fetchCatalog])

  return {
    catalog,
    isLoading,
    error,
    reload,
  }
}
