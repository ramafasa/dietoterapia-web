/**
 * PzkInternalNav Component
 *
 * Internal navigation for PZK area (Katalog / Recenzje).
 *
 * Features:
 * - Active state based on current page
 * - Accessible navigation landmark
 * - Simple link-based navigation
 *
 * Props:
 * - active: 'catalog' | 'reviews'
 */

interface PzkInternalNavProps {
  active: 'catalog' | 'reviews'
}

export function PzkInternalNav({ active }: PzkInternalNavProps) {
  return (
    <nav className="mb-8" aria-label="Nawigacja PZK" data-testid="pzk-internal-nav">
      <div className="flex gap-4">
        <a
          href="/pacjent/pzk/katalog"
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            active === 'catalog'
              ? 'bg-primary text-white'
              : 'border-2 border-primary text-primary hover:bg-primary/5'
          }`}
          aria-current={active === 'catalog' ? 'page' : undefined}
        >
          Katalog
        </a>
        <a
          href="/pacjent/pzk/recenzje"
          className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
            active === 'reviews'
              ? 'bg-primary text-white'
              : 'border-2 border-primary text-primary hover:bg-primary/5'
          }`}
          aria-current={active === 'reviews' ? 'page' : undefined}
        >
          Recenzje
        </a>
      </div>
    </nav>
  )
}
