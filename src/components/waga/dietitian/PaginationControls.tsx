import type { PaginationState } from '../../../types'

interface PaginationControlsProps {
  pagination: PaginationState
  onPageChange: (page: number) => void
}

/**
 * Pagination Controls
 * Navigation for paginated patient list
 */
export default function PaginationControls({
  pagination,
  onPageChange,
}: PaginationControlsProps) {
  const { page, pageSize, total, hasMore } = pagination

  const totalPages = Math.ceil(total / pageSize)
  const hasPrevious = page > 1
  const hasNext = hasMore

  // Generate page numbers to display (show max 5 pages)
  const getPageNumbers = (): number[] => {
    const pages: number[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show current page with 2 pages on each side
      let start = Math.max(1, page - 2)
      let end = Math.min(totalPages, page + 2)

      // Adjust if near start or end
      if (page <= 3) {
        end = maxVisible
      }
      if (page >= totalPages - 2) {
        start = totalPages - maxVisible + 1
      }

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }
    }

    return pages
  }

  const pageNumbers = getPageNumbers()

  // Calculate range of items shown
  const startItem = (page - 1) * pageSize + 1
  const endItem = Math.min(page * pageSize, total)

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Info Text */}
        <div className="text-sm text-neutral-dark/70">
          Pokazano <span className="font-semibold text-neutral-dark">{startItem}</span> -{' '}
          <span className="font-semibold text-neutral-dark">{endItem}</span> z{' '}
          <span className="font-semibold text-neutral-dark">{total}</span> pacjentów
        </div>

        {/* Pagination Buttons */}
        <div className="flex items-center gap-2">
          {/* Previous Button */}
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={!hasPrevious}
            className="px-4 py-2 border border-neutral-dark/20 rounded-lg text-sm font-semibold text-neutral-dark hover:bg-neutral-dark/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Poprzednia strona"
          >
            ← Poprzednia
          </button>

          {/* Page Numbers */}
          <div className="hidden md:flex items-center gap-1">
            {pageNumbers.map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                  pageNum === page
                    ? 'bg-primary text-white'
                    : 'text-neutral-dark hover:bg-neutral-dark/5'
                }`}
                aria-label={`Strona ${pageNum}`}
                aria-current={pageNum === page ? 'page' : undefined}
              >
                {pageNum}
              </button>
            ))}
          </div>

          {/* Current Page (mobile only) */}
          <div className="md:hidden px-4 py-2 bg-primary/10 rounded-lg text-sm font-semibold text-primary">
            {page} / {totalPages}
          </div>

          {/* Next Button */}
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={!hasNext}
            className="px-4 py-2 border border-neutral-dark/20 rounded-lg text-sm font-semibold text-neutral-dark hover:bg-neutral-dark/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Następna strona"
          >
            Następna →
          </button>
        </div>
      </div>
    </div>
  )
}
