import type { PatientStatusFilter } from '../../../types'

interface EmptyStateProps {
  currentFilter: PatientStatusFilter
  onShowAll?: () => void
}

/**
 * Empty State
 * Displays message when no patients match criteria
 */
export default function EmptyState({ currentFilter, onShowAll }: EmptyStateProps) {
  const isFiltered = currentFilter !== 'all'

  return (
    <div className="bg-white rounded-lg shadow-sm p-12 text-center">
      {/* Icon */}
      <div className="w-16 h-16 bg-neutral-dark/5 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg
          className="w-8 h-8 text-neutral-dark/40"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>

      {/* Message */}
      <h3 className="text-xl font-heading font-semibold text-neutral-dark mb-3">
        {isFiltered ? 'Brak wyników' : 'Brak pacjentów'}
      </h3>

      <p className="text-neutral-dark/70 mb-6 max-w-md mx-auto">
        {isFiltered
          ? 'Nie znaleziono pacjentów spełniających wybrane kryteria.'
          : 'Nie masz jeszcze żadnych pacjentów w systemie.'}
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {isFiltered && onShowAll && (
          <button
            onClick={onShowAll}
            className="px-6 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary hover:text-white transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Pokaż wszystkich pacjentów
          </button>
        )}

        {!isFiltered && (
          <a
            href="/dietetyk/zaproszenia"
            className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          >
            Zaproś pierwszego pacjenta
          </a>
        )}
      </div>

      {/* Helper Text */}
      {!isFiltered && (
        <p className="text-sm text-neutral-dark/50 mt-6">
          Wyślij zaproszenie pacjentowi, aby mógł założyć konto i zacząć dodawać pomiary wagi.
        </p>
      )}
    </div>
  )
}
