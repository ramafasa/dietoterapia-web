/**
 * PzkMaterialPublishSoonState Component
 *
 * "Publish soon" material state - informational only.
 *
 * Displays when:
 * - Material status is 'publish_soon'
 * - OR access.reason is 'publish_soon'
 *
 * Features:
 * - Clock/calendar icon
 * - Informational message
 * - No CTA (per PRD)
 * - Link back to catalog
 * - No content/PDF/video/note sections
 *
 * Props:
 * - soon: PzkMaterialPublishSoonVM
 */

import type { PzkMaterialPublishSoonVM } from '@/types/pzk-vm'

interface PzkMaterialPublishSoonStateProps {
  soon: PzkMaterialPublishSoonVM
}

export function PzkMaterialPublishSoonState({
  soon,
}: PzkMaterialPublishSoonStateProps) {
  return (
    <section
      className="bg-white rounded-xl border-2 border-neutral-dark/10 p-8 text-center"
      role="status"
      aria-live="polite"
      data-testid="pzk-material-publish-soon"
    >
      {/* Clock Icon */}
      <div className="mb-6">
        <svg
          className="h-16 w-16 text-neutral-dark/40 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-heading font-bold text-neutral-dark mb-3">
        Dostępny wkrótce
      </h2>

      {/* Message */}
      <p className="text-neutral-dark/70 text-lg mb-6">{soon.message}</p>

      {/* Back to catalog */}
      <a
        href="/pacjent/pzk/katalog"
        className="inline-flex items-center gap-2 px-6 py-3 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary/5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
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
            d="M10 19l-7-7m0 0l7-7m-7 7h18"
          />
        </svg>
        Wróć do katalogu
      </a>
    </section>
  )
}
