/**
 * PzkEmptyCategoryState Component
 *
 * Displays when a category has no materials.
 *
 * Features:
 * - Empty state message
 * - Contextual category label (optional)
 *
 * Props:
 * - categoryLabel: Name of the category (optional)
 */

interface PzkEmptyCategoryStateProps {
  categoryLabel?: string
}

export function PzkEmptyCategoryState({
  categoryLabel,
}: PzkEmptyCategoryStateProps) {
  return (
    <div className="bg-neutral-light/60 rounded-xl p-8 text-center">
      <p className="text-neutral-dark/60">
        {categoryLabel
          ? `Brak materiałów w kategorii "${categoryLabel}".`
          : 'Brak materiałów w tej kategorii.'}
      </p>
    </div>
  )
}
