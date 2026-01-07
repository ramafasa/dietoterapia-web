/**
 * PzkRatingInput Component
 *
 * Accessible rating selector (1-6 scale) using radio button group.
 *
 * A11y features:
 * - Fieldset/legend for semantic grouping
 * - Radio buttons for keyboard navigation
 * - aria-describedby for error messages
 *
 * Pattern: Radio group (not clickable stars) for better accessibility
 */

import type { PzkRating } from '@/types/pzk-vm'

interface PzkRatingInputProps {
  value: PzkRating | null
  onChange: (value: PzkRating) => void
  disabled?: boolean
  errorId?: string
}

export function PzkRatingInput({
  value,
  onChange,
  disabled = false,
  errorId,
}: PzkRatingInputProps) {
  const ratings: PzkRating[] = [1, 2, 3, 4, 5, 6]

  return (
    <fieldset
      className="space-y-2"
      aria-describedby={errorId}
      disabled={disabled}
    >
      <legend className="text-sm font-semibold text-neutral-dark mb-2">
        Ocena (1-6)
      </legend>

      <div className="flex gap-2" role="radiogroup" aria-label="Ocena od 1 do 6">
        {ratings.map((rating) => (
          <label
            key={rating}
            className={`
              flex items-center justify-center
              w-10 h-10 rounded-lg border-2 cursor-pointer
              transition-colors
              ${
                value === rating
                  ? 'border-primary bg-primary text-white'
                  : 'border-neutral-dark/20 bg-white text-neutral-dark hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <input
              type="radio"
              name="rating"
              value={rating}
              checked={value === rating}
              onChange={() => onChange(rating)}
              disabled={disabled}
              className="sr-only"
              aria-label={`Ocena ${rating} z 6`}
            />
            <span className="font-semibold" aria-hidden="true">{rating}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
