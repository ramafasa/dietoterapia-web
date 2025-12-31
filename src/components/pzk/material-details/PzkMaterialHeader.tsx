/**
 * PzkMaterialHeader Component
 *
 * Material header with title, description, badge, and metadata.
 *
 * Features:
 * - Title (h1)
 * - Badge (available/locked/soon)
 * - Description (optional)
 * - Module metadata
 * - Responsive layout
 *
 * Props:
 * - header: PzkMaterialHeaderVM
 */

import type { PzkMaterialHeaderVM } from '@/types/pzk-vm'

interface PzkMaterialHeaderProps {
  header: PzkMaterialHeaderVM
}

export function PzkMaterialHeader({ header }: PzkMaterialHeaderProps) {
  // Badge styling based on kind
  const getBadgeStyles = () => {
    switch (header.badge.kind) {
      case 'available':
        return 'bg-primary/10 text-primary border-primary/20'
      case 'locked':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20'
      case 'soon':
        return 'bg-neutral-dark/10 text-neutral-dark/60 border-neutral-dark/20'
      default:
        return 'bg-neutral-dark/10 text-neutral-dark/60 border-neutral-dark/20'
    }
  }

  return (
    <header className="mb-8">
      {/* Title + Badge */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 mb-4">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold text-neutral-dark flex-1">
          {header.title}
        </h1>

        {/* Badge */}
        <span
          className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold border-2 ${getBadgeStyles()}`}
          aria-label={`Status: ${header.badge.label}`}
        >
          {header.badge.label}
        </span>
      </div>

      {/* Description (optional) */}
      {header.description && (
        <p className="text-lg text-neutral-dark/70 mb-3">
          {header.description}
        </p>
      )}

      {/* Meta (module) */}
      <div className="flex items-center gap-2 text-sm text-neutral-dark/60">
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
          />
        </svg>
        <span className="font-medium">{header.meta.moduleLabel}</span>
      </div>
    </header>
  )
}
