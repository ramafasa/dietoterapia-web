/**
 * usePzkMaterialDetails Hook
 *
 * Custom React hook for fetching PZK material details from the API.
 * Handles loading state, errors, and provides reload capability.
 *
 * Features:
 * - AbortController for request cancellation (cleanup on unmount)
 * - isMountedRef to prevent state updates after unmount
 * - DTO → VM mapping via mapPzkMaterialDetailsToVm
 * - ApiResponse envelope parsing
 * - User-friendly error messages via mapPzkError
 * - Support for 404 not found errors
 *
 * Usage:
 * ```tsx
 * const { material, isLoading, error, reload } = usePzkMaterialDetails(materialId)
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiResponse, PzkMaterialDetails } from '@/types/pzk-dto'
import type {
  PzkMaterialDetailsVM,
  PzkMaterialDetailsErrorVM,
} from '@/types/pzk-vm'
import { mapPzkMaterialDetailsToVm, mapPzkError } from '@/lib/pzk/mappers'

type UsePzkMaterialDetailsState = {
  material: PzkMaterialDetailsVM | null
  isLoading: boolean
  error: PzkMaterialDetailsErrorVM | null
  reload: () => Promise<void>
}

/**
 * Fetch PZK material details from API
 *
 * @param materialId - Material UUID
 * @returns Material details state and reload function
 *
 * @example
 * const { material, isLoading, error, reload } = usePzkMaterialDetails(id)
 *
 * if (isLoading) return <LoadingState />
 * if (error) return <ErrorState error={error} onRetry={reload} />
 * if (!material) return null
 *
 * return <MaterialDetailsView material={material} />
 */
export function usePzkMaterialDetails(
  materialId: string
): UsePzkMaterialDetailsState {
  const [material, setMaterial] = useState<PzkMaterialDetailsVM | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<PzkMaterialDetailsErrorVM | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef<boolean>(false)

  const fetchMaterialDetails = useCallback(async () => {
    // Validate materialId (basic UUID check)
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(materialId)) {
      const validationError: PzkMaterialDetailsErrorVM = {
        kind: 'validation',
        message: 'Nieprawidłowy identyfikator materiału.',
        retryable: false,
      }
      setError(validationError)
      setIsLoading(false)
      return
    }

    // Cancel previous request if still in flight
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/pzk/materials/${materialId}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        signal: abortController.signal,
      })

      // Handle non-OK responses
      if (!response.ok) {
        let errorMessage = 'Nie udało się pobrać szczegółów materiału.'

        // Try to parse error from ApiResponse envelope
        try {
          const errorBody: ApiResponse<PzkMaterialDetails> =
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
      const apiResponse: ApiResponse<PzkMaterialDetails> =
        await response.json()

      // Validate contract: data must exist in successful response
      if (!apiResponse.data) {
        throw mapPzkError(undefined, 'Nieprawidłowa odpowiedź serwera.')
      }

      // Map DTO → VM
      const materialVm = mapPzkMaterialDetailsToVm(apiResponse.data)

      // Update state only if component is still mounted
      if (isMountedRef.current) {
        setMaterial(materialVm)
        setError(null)
      }
    } catch (err) {
      // Handle AbortError (request cancelled)
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }

      // Update error state only if component is still mounted
      if (isMountedRef.current) {
        // If error is already a PzkMaterialDetailsErrorVM, use it directly
        if (
          err &&
          typeof err === 'object' &&
          'kind' in err &&
          'message' in err
        ) {
          setError(err as PzkMaterialDetailsErrorVM)
        } else {
          // Otherwise, map generic error
          const message =
            err instanceof Error
              ? err.message
              : 'Wystąpił nieoczekiwany błąd podczas pobierania materiału.'
          setError(mapPzkError(undefined, message))
        }
        setMaterial(null)
      }
    } finally {
      // Update loading state only if component is still mounted
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [materialId])

  // Fetch on mount and when materialId changes
  useEffect(() => {
    isMountedRef.current = true

    void fetchMaterialDetails()

    // Cleanup: abort request and mark as unmounted
    return () => {
      isMountedRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchMaterialDetails])

  // Reload function (exposed to components)
  const reload = useCallback(async () => {
    await fetchMaterialDetails()
  }, [fetchMaterialDetails])

  return {
    material,
    isLoading,
    error,
    reload,
  }
}
