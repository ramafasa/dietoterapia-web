/**
 * PzkReviewsErrorState Component
 *
 * Error screen for reviews page with contextual CTAs.
 *
 * Features:
 * - User-friendly error message
 * - Conditional CTAs based on error kind:
 *   - 401: Login CTA
 *   - 403: Purchase CTA (/pzk/kup)
 *   - 500/network: Retry button
 *
 * Pattern: Similar to PzkCatalogErrorState
 */

import type { PzkReviewsErrorVM } from '@/types/pzk-vm'

interface PzkReviewsErrorStateProps {
  error: PzkReviewsErrorVM
  onRetry: () => void
}

export function PzkReviewsErrorState({
  error,
  onRetry,
}: PzkReviewsErrorStateProps) {
  return (
    <div className="min-h-screen bg-neutral-light flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-heading font-bold text-neutral-dark mb-4">
          {error.kind === 'unauthorized'
            ? 'Sesja wygasła'
            : error.kind === 'forbidden'
              ? 'Brak dostępu'
              : 'Wystąpił błąd'}
        </h1>

        <p className="text-lg text-neutral-dark/80 mb-8">{error.message}</p>

        <div className="flex flex-col gap-4">
          {/* Conditional primary CTA */}
          {error.kind === 'unauthorized' && (
            <a
              href="/logowanie"
              className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
            >
              Zaloguj się
            </a>
          )}

          {error.kind === 'forbidden' && (
            <a
              href="/pzk/kup"
              className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
            >
              Dowiedz się więcej o PZK
            </a>
          )}

          {error.retryable && (
            <button
              onClick={onRetry}
              className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors"
            >
              Spróbuj ponownie
            </button>
          )}

          {/* Secondary CTA: Back to PZK home */}
          <a
            href="/pacjent/pzk"
            className="inline-block px-6 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 transition-colors"
          >
            Wróć do PZK
          </a>
        </div>
      </div>
    </div>
  )
}
