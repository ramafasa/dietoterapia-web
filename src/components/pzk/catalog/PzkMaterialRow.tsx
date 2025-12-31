/**
 * PzkMaterialRow Component
 *
 * Displays a material card with 3 possible states:
 * 1. Available (status=published + isActionable=true)
 *    - Link to material details
 * 2. Locked (status=published + isLocked=true + isActionable=false)
 *    - Lock icon + CTA to purchase page (new tab)
 * 3. Soon (status=publish_soon)
 *    - No action, "Wkrótce" badge
 *
 * Features:
 * - Title + description
 * - Badges (PDF, Video)
 * - Accessible action buttons
 * - data-testid for E2E tests
 *
 * Props:
 * - material: PzkMaterialRowVM (pre-computed variant and primaryAction)
 */

import type { PzkMaterialRowVM } from '@/types/pzk-vm'

interface PzkMaterialRowProps {
  material: PzkMaterialRowVM
}

export function PzkMaterialRow({ material }: PzkMaterialRowProps) {
  return (
    <article
      className="bg-neutral-light/60 rounded-xl p-4 border-2 border-transparent hover:border-primary/20 transition-colors"
      data-testid={`pzk-material-row-${material.id}`}
    >
      {/* Title + Description */}
      <div className="mb-3">
        <h4 className="text-lg font-semibold text-neutral-dark mb-1">
          {material.title}
          {material.aria?.statusLabel && (
            <span className="sr-only"> - {material.aria.statusLabel}</span>
          )}
        </h4>
        {material.description && (
          <p className="text-sm text-neutral-dark/70">{material.description}</p>
        )}
      </div>

      {/* Footer: Badges + Action */}
      <div className="flex items-center gap-4">
        {/* Badges (PDF, Video) */}
        <div className="flex gap-2">
          {material.hasPdf && (
            <span
              className="text-xs px-2 py-1 bg-primary/10 text-primary rounded"
              aria-label="Materiał zawiera pliki PDF"
            >
              📄 PDF
            </span>
          )}
          {material.hasVideos && (
            <span
              className="text-xs px-2 py-1 bg-primary/10 text-primary rounded"
              aria-label="Materiał zawiera filmy wideo"
            >
              🎥 Wideo
            </span>
          )}
        </div>

        {/* Primary Action */}
        <div className="ml-auto">
          {material.primaryAction.type === 'link' && (
            <a
              href={material.primaryAction.href}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              data-testid={`pzk-material-open-${material.id}`}
            >
              {material.primaryAction.label}
            </a>
          )}

          {material.primaryAction.type === 'cta' && (
            <a
              href={material.primaryAction.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/90 transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 flex items-center gap-2"
              data-testid={`pzk-material-cta-${material.id}`}
            >
              <span aria-hidden="true">🔒</span>
              <span>{material.primaryAction.label}</span>
              <span className="sr-only"> (otworzy nową kartę)</span>
            </a>
          )}

          {material.primaryAction.type === 'none' && (
            <span
              className="px-4 py-2 bg-neutral-dark/10 text-neutral-dark/50 rounded-lg text-sm font-semibold cursor-not-allowed"
              aria-disabled="true"
            >
              Wkrótce
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
