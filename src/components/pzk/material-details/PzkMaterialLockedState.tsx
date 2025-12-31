/**
 * PzkMaterialLockedState Component
 *
 * Locked material state with lock icon and purchase CTA.
 *
 * Displays when:
 * - User is logged in as patient
 * - Material is published
 * - User doesn't have access to the module
 *
 * Features:
 * - Lock icon
 * - Explanation message
 * - CTA to purchase page (opens in new tab)
 * - No content/PDF/video/note sections (security: no metadata leak)
 *
 * Props:
 * - locked: PzkMaterialLockedVM
 */

import type { PzkMaterialLockedVM } from '@/types/pzk-vm'

interface PzkMaterialLockedStateProps {
  locked: PzkMaterialLockedVM
}

export function PzkMaterialLockedState({ locked }: PzkMaterialLockedStateProps) {
  return (
    <section
      className="bg-white rounded-xl border-2 border-yellow-500/20 p-8 text-center"
      role="status"
      aria-live="polite"
      data-testid="pzk-material-locked"
    >
      {/* Lock Icon */}
      <div className="mb-6">
        <svg
          className="h-16 w-16 text-yellow-500 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      </div>

      {/* Title */}
      <h2 className="text-2xl font-heading font-bold text-neutral-dark mb-3">
        Materiał zablokowany
      </h2>

      {/* Message */}
      <p className="text-neutral-dark/70 text-lg mb-6">{locked.message}</p>

      {/* CTA */}
      <a
        href={locked.cta.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        data-testid="pzk-material-locked-cta"
      >
        {locked.cta.label}
        {/* External link icon */}
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
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
      </a>

      {/* Secondary action */}
      <div className="mt-4">
        <a
          href="/pacjent/pzk/katalog"
          className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
        >
          Wróć do katalogu
        </a>
      </div>
    </section>
  )
}
