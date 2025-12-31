/**
 * PzkBreadcrumbs Component
 *
 * Hierarchical breadcrumb navigation for material details.
 *
 * Structure: PZK / Moduł X / Kategoria / Materiał
 *
 * Features:
 * - Links to parent pages (where applicable)
 * - Current page (no link)
 * - Accessible navigation (aria-label)
 * - Responsive text truncation for long titles
 *
 * Props:
 * - breadcrumbs: PzkMaterialBreadcrumbsVM
 */

import type { PzkMaterialBreadcrumbsVM } from '@/types/pzk-vm'

interface PzkBreadcrumbsProps {
  breadcrumbs: PzkMaterialBreadcrumbsVM
}

export function PzkBreadcrumbs({ breadcrumbs }: PzkBreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumbs" className="mb-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {breadcrumbs.items.map((item, index) => {
          const isLast = index === breadcrumbs.items.length - 1

          return (
            <li key={index} className="flex items-center gap-2">
              {/* Item */}
              {item.href ? (
                <a
                  href={item.href}
                  className="text-primary hover:text-primary/80 transition-colors font-medium"
                >
                  {item.label}
                </a>
              ) : (
                <span className="text-neutral-dark/60">{item.label}</span>
              )}

              {/* Separator (not for last item) */}
              {!isLast && (
                <svg
                  className="h-4 w-4 text-neutral-dark/30"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
