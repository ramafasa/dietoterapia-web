/**
 * PzkPdfDownloadButton Component
 *
 * Download button for a single PDF attachment.
 *
 * Features:
 * - Loading spinner during presign
 * - Success feedback (brief)
 * - Error message with retry
 * - Rate limiting message with countdown (optional)
 * - Disabled state during loading
 *
 * Props:
 * - pdfId: string
 * - label: string (PDF display name)
 * - state: PzkPdfDownloadStateVM
 * - onDownload: () => Promise<void>
 * - onRetry: () => void (for errors)
 */

import type { PzkPdfDownloadStateVM } from '@/types/pzk-vm'

interface PzkPdfDownloadButtonProps {
  pdfId: string
  label: string
  state: PzkPdfDownloadStateVM
  onDownload: () => Promise<void>
  onRetry: () => void
}

export function PzkPdfDownloadButton({
  pdfId,
  label,
  state,
  onDownload,
  onRetry,
}: PzkPdfDownloadButtonProps) {
  // Determine button text and styling based on state
  const getButtonContent = () => {
    switch (state.status) {
      case 'loading':
        return (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Pobieranie...
          </span>
        )

      case 'success':
        return (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            Pobrano
          </span>
        )

      case 'rate_limited':
        return 'Limit przekroczony'

      default:
        return 'Pobierz'
    }
  }

  const getButtonStyles = () => {
    const baseStyles =
      'px-4 py-2 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'

    switch (state.status) {
      case 'success':
        return `${baseStyles} bg-green-500 text-white`
      case 'error':
      case 'rate_limited':
        return `${baseStyles} bg-red-500 text-white opacity-75`
      case 'loading':
        return `${baseStyles} bg-primary/70 text-white cursor-wait`
      default:
        return `${baseStyles} bg-primary text-white hover:bg-primary/90`
    }
  }

  const isDisabled = state.status === 'loading' || state.status === 'success'

  return (
    <div className="flex flex-col gap-2" data-testid={`pdf-download-${pdfId}`}>
      {/* PDF Row */}
      <div className="flex items-center justify-between p-4 bg-neutral-light/60 rounded-lg">
        {/* PDF Info */}
        <div className="flex items-center gap-3 flex-1">
          <svg
            className="h-6 w-6 text-primary flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span className="font-medium text-neutral-dark">{label}</span>
        </div>

        {/* Download Button */}
        <button
          onClick={onDownload}
          disabled={isDisabled}
          className={getButtonStyles()}
          aria-label={`Pobierz ${label}`}
        >
          {getButtonContent()}
        </button>
      </div>

      {/* Error Message + Retry */}
      {state.status === 'error' && state.message && (
        <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
          <p className="text-red-700 mb-2">{state.message}</p>
          <button
            onClick={onRetry}
            className="text-red-600 font-semibold hover:text-red-800 underline"
          >
            Spróbuj ponownie
          </button>
        </div>
      )}

      {/* Rate Limit Message */}
      {state.status === 'rate_limited' && state.message && (
        <div className="px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
          <p className="text-yellow-800">{state.message}</p>
        </div>
      )}
    </div>
  )
}
