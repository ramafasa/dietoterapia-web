/**
 * usePzkPdfDownload Hook
 *
 * Custom React hook for downloading PDF attachments from PZK materials.
 *
 * Features:
 * - Per-PDF state tracking (loading, success, error, rate_limited)
 * - Presigned URL generation via API
 * - Download via window.open (user stays on page)
 * - Rate limiting handling (429 + Retry-After)
 * - Error handling with user-friendly messages
 *
 * Usage:
 * ```tsx
 * const { downloadPdf, getDownloadState } = usePzkPdfDownload(materialId)
 *
 * <button onClick={() => downloadPdf(pdfId)}>
 *   {getDownloadState(pdfId).status === 'loading' ? 'Pobieranie...' : 'Pobierz'}
 * </button>
 * ```
 */

import { useCallback, useState } from 'react'
import type {
  ApiResponse,
  PzkPresignRequest,
  PzkPresignResponse,
} from '@/types/pzk-dto'
import type { PzkPdfDownloadStateVM } from '@/types/pzk-vm'

type UsePzkPdfDownloadReturn = {
  downloadPdf: (pdfId: string) => Promise<void>
  getDownloadState: (pdfId: string) => PzkPdfDownloadStateVM
  resetDownloadState: (pdfId: string) => void
}

/**
 * Hook for downloading PDF attachments
 *
 * @param materialId - Material UUID
 * @returns Download function and state accessors
 */
export function usePzkPdfDownload(
  materialId: string
): UsePzkPdfDownloadReturn {
  const [stateByPdfId, setStateByPdfId] = useState<
    Record<string, PzkPdfDownloadStateVM>
  >({})

  /**
   * Get download state for specific PDF
   */
  const getDownloadState = useCallback(
    (pdfId: string): PzkPdfDownloadStateVM => {
      return stateByPdfId[pdfId] || { status: 'idle' }
    },
    [stateByPdfId]
  )

  /**
   * Reset download state for specific PDF
   */
  const resetDownloadState = useCallback((pdfId: string) => {
    setStateByPdfId((prev) => {
      const next = { ...prev }
      delete next[pdfId]
      return next
    })
  }, [])

  /**
   * Download PDF via presigned URL
   */
  const downloadPdf = useCallback(
    async (pdfId: string) => {
      // Set loading state
      setStateByPdfId((prev) => ({
        ...prev,
        [pdfId]: { status: 'loading' },
      }))

      try {
        // Call presign API
        const response = await fetch(
          `/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({ ttlSeconds: 60 } as PzkPresignRequest),
          }
        )

        // Handle rate limiting (429)
        if (response.status === 429) {
          // Try to get Retry-After from headers or response body
          const retryAfterHeader = response.headers.get('Retry-After')
          let retryAfterSeconds: number | undefined

          if (retryAfterHeader) {
            // Retry-After can be number (seconds) or HTTP date
            const parsed = parseInt(retryAfterHeader, 10)
            if (!isNaN(parsed)) {
              retryAfterSeconds = parsed
            }
          }

          // Try to get retryAfterSeconds from response body
          try {
            const errorBody: ApiResponse<PzkPresignResponse> =
              await response.json()
            if (
              errorBody.error?.details &&
              typeof errorBody.error.details === 'object' &&
              'retryAfterSeconds' in errorBody.error.details
            ) {
              retryAfterSeconds = errorBody.error.details
                .retryAfterSeconds as number
            }
          } catch {
            // Ignore JSON parsing errors
          }

          setStateByPdfId((prev) => ({
            ...prev,
            [pdfId]: {
              status: 'rate_limited',
              message: retryAfterSeconds
                ? `Zbyt wiele prób. Spróbuj ponownie za ${retryAfterSeconds}s.`
                : 'Zbyt wiele prób. Spróbuj ponownie za chwilę.',
              retryAfterSeconds,
            },
          }))
          return
        }

        // Handle other errors
        if (!response.ok) {
          let errorMessage = 'Nie udało się przygotować pobrania.'

          // Try to parse error from ApiResponse envelope
          try {
            const errorBody: ApiResponse<PzkPresignResponse> =
              await response.json()
            if (errorBody.error && errorBody.error.message) {
              errorMessage = errorBody.error.message
            }
          } catch {
            // Ignore JSON parsing errors
          }

          // Map specific status codes to user-friendly messages
          if (response.status === 401) {
            errorMessage = 'Sesja wygasła. Zaloguj się ponownie.'
          } else if (response.status === 403) {
            errorMessage = 'Brak dostępu do tego pliku.'
          } else if (response.status === 404) {
            errorMessage = 'Nie znaleziono pliku.'
          }

          setStateByPdfId((prev) => ({
            ...prev,
            [pdfId]: {
              status: 'error',
              message: errorMessage,
            },
          }))
          return
        }

        // Parse successful response
        const apiResponse: ApiResponse<PzkPresignResponse> =
          await response.json()

        if (!apiResponse.data || !apiResponse.data.url) {
          throw new Error('Nieprawidłowa odpowiedź serwera.')
        }

        // Open presigned URL in new tab (user stays on page)
        window.open(apiResponse.data.url, '_blank', 'noopener,noreferrer')

        // Set success state
        setStateByPdfId((prev) => ({
          ...prev,
          [pdfId]: {
            status: 'success',
            message: 'Pobieranie rozpoczęte.',
          },
        }))

        // Auto-reset success state after 3 seconds
        setTimeout(() => {
          resetDownloadState(pdfId)
        }, 3000)
      } catch (err) {
        // Handle network errors
        const message =
          err instanceof Error
            ? err.message
            : 'Wystąpił błąd podczas pobierania pliku.'

        setStateByPdfId((prev) => ({
          ...prev,
          [pdfId]: {
            status: 'error',
            message,
          },
        }))
      }
    },
    [materialId, resetDownloadState]
  )

  return {
    downloadPdf,
    getDownloadState,
    resetDownloadState,
  }
}
