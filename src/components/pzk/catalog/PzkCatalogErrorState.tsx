/**
 * PzkCatalogErrorState Component
 *
 * Error state display with user-friendly messages and retry.
 *
 * Features:
 * - Contextual error messages based on error kind
 * - Retry button (conditional based on retryable flag)
 * - Login CTA for unauthorized errors
 * - Accessible error presentation (Alert component pattern)
 *
 * Props:
 * - error: PzkCatalogErrorVM
 * - onRetry: Callback for retry action
 */

import type { PzkCatalogErrorVM } from '@/types/pzk-vm'

interface PzkCatalogErrorStateProps {
  error: PzkCatalogErrorVM
  onRetry: () => void
}

export function PzkCatalogErrorState({
  error,
  onRetry,
}: PzkCatalogErrorStateProps) {
  // Determine title based on error kind
  const getTitle = () => {
    switch (error.kind) {
      case 'unauthorized':
        return 'Wymagane logowanie'
      case 'forbidden':
        return 'Brak dostępu'
      case 'validation':
        return 'Nieprawidłowe dane'
      case 'network':
        return 'Brak połączenia'
      case 'server':
        return 'Błąd serwera'
      default:
        return 'Wystąpił błąd'
    }
  }

  // Determine icon SVG based on error kind
  const getIcon = () => {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden') {
      return (
        <svg
          className="h-12 w-12 text-yellow-500 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      )
    }

    return (
      <svg
        className="h-12 w-12 text-red-500 mx-auto"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-light">
      <div className="container mx-auto px-4 max-w-6xl pt-10 pb-24">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="max-w-md w-full">
            <div
              className="bg-white rounded-xl border-2 border-red-200 p-8 text-center"
              role="alert"
              aria-live="polite"
              data-testid="pzk-catalog-error"
            >
              {/* Icon */}
              <div className="mb-4">{getIcon()}</div>

              {/* Title */}
              <h2 className="text-2xl font-heading font-bold text-neutral-dark mb-2">
                {getTitle()}
              </h2>

              {/* Message */}
              <p className="text-neutral-dark/70 mb-6">{error.message}</p>

              {/* Actions */}
              <div className="flex flex-col gap-3">
                {/* Retry Button (if retryable) */}
                {error.retryable && (
                  <button
                    onClick={onRetry}
                    className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    data-testid="pzk-catalog-retry"
                  >
                    Spróbuj ponownie
                  </button>
                )}

                {/* Login CTA (for unauthorized) */}
                {error.kind === 'unauthorized' && (
                  <a
                    href="/logowanie"
                    className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                  >
                    Zaloguj się
                  </a>
                )}

                {/* Secondary CTA */}
                <a
                  href="/pzk/kup"
                  className="px-6 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary/5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  Dowiedz się więcej o PZK
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
