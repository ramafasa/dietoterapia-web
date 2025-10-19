import { useState } from 'react';

interface PaginationProps {
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ totalItems, itemsPerPage, onPageChange }: PaginationProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(totalItems / itemsPerPage);

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
    onPageChange(page);
    // Scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Don't render pagination if there's only one page
  if (totalPages <= 1) return null;

  const renderPageNumbers = () => {
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
      pages.push(
        <button
          key={i}
          onClick={() => handlePageChange(i)}
          aria-label={`Strona ${i}`}
          aria-current={currentPage === i ? 'page' : undefined}
          className={`
            min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg font-body font-semibold transition-colors duration-200
            ${
              currentPage === i
                ? 'bg-primary text-white'
                : 'bg-neutral-light text-neutral-dark hover:bg-secondary'
            }
          `}
        >
          {i}
        </button>
      );
    }
    return pages;
  };

  return (
    <nav aria-label="Paginacja opinii" className="flex items-center justify-center space-x-2 mt-12">
      {/* Previous Button */}
      <button
        onClick={() => handlePageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Poprzednia strona"
        className={`
          min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg font-body font-semibold transition-colors duration-200
          ${
            currentPage === 1
              ? 'bg-neutral-light text-gray-400 cursor-not-allowed'
              : 'bg-neutral-light text-neutral-dark hover:bg-secondary'
          }
        `}
      >
        Poprzednia
      </button>

      {/* Page Numbers */}
      <div className="flex items-center space-x-2">
        {renderPageNumbers()}
      </div>

      {/* Next Button */}
      <button
        onClick={() => handlePageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Następna strona"
        className={`
          min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg font-body font-semibold transition-colors duration-200
          ${
            currentPage === totalPages
              ? 'bg-neutral-light text-gray-400 cursor-not-allowed'
              : 'bg-neutral-light text-neutral-dark hover:bg-secondary'
          }
        `}
      >
        Następna
      </button>
    </nav>
  );
}
