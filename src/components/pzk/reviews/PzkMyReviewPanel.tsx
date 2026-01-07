/**
 * PzkMyReviewPanel Component
 *
 * Panel for managing user's own review (add/edit/delete).
 *
 * Features:
 * - PzkRatingInput (1-6)
 * - Textarea for content (max 5000 chars)
 * - Save button (disabled when invalid/unchanged/busy)
 * - Delete button (visible when review exists, disabled when busy)
 * - Cancel button (reverts to saved state)
 * - Inline validation errors
 * - API error messages
 *
 * Pattern: Similar to PzkNotePanel, uses external state from usePzkMyReview hook
 */

import { useState, useEffect } from 'react'
import { PzkRatingInput } from './PzkRatingInput'
import type { PzkRating, PzkMyReviewVM } from '@/types/pzk-vm'
import type { PzkReviewUpsertRequest } from '@/types/pzk-dto'

interface PzkMyReviewPanelProps {
  initialMyReview: PzkMyReviewVM | null
  onUpsert: (req: PzkReviewUpsertRequest) => Promise<void>
  onDelete: () => Promise<void>
  isSaving: boolean
  isDeleting: boolean
}

export function PzkMyReviewPanel({
  initialMyReview,
  onUpsert,
  onDelete,
  isSaving,
  isDeleting,
}: PzkMyReviewPanelProps) {
  // Local form state
  const [rating, setRating] = useState<PzkRating | null>(
    initialMyReview?.rating || null
  )
  const [content, setContent] = useState<string>(
    initialMyReview?.content || ''
  )
  const [error, setError] = useState<string | null>(null)

  // Sync form state when initialMyReview changes (after save/delete)
  useEffect(() => {
    setRating(initialMyReview?.rating || null)
    setContent(initialMyReview?.content || '')
    setError(null)
  }, [initialMyReview])

  const isDirty =
    rating !== (initialMyReview?.rating || null) ||
    content !== (initialMyReview?.content || '')

  const canSave =
    !isSaving &&
    !isDeleting &&
    isDirty &&
    rating !== null &&
    content.trim().length > 0 &&
    content.trim().length <= 5000

  const canDelete = !isSaving && !isDeleting && initialMyReview !== null

  const handleSave = async () => {
    if (!rating || !content.trim()) {
      setError('Wybierz ocenę i wpisz treść recenzji.')
      return
    }

    setError(null)

    try {
      await onUpsert({ rating, content: content.trim() })
      // Success - form will be synced via useEffect when initialMyReview updates
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się zapisać recenzji.'
      )
    }
  }

  const handleDelete = async () => {
    if (
      !confirm(
        'Czy na pewno chcesz usunąć swoją recenzję? Tej operacji nie można cofnąć.'
      )
    ) {
      return
    }

    setError(null)

    try {
      await onDelete()
      // Success - form will be cleared via useEffect when initialMyReview becomes null
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nie udało się usunąć recenzji.'
      )
    }
  }

  const handleCancel = () => {
    setRating(initialMyReview?.rating || null)
    setContent(initialMyReview?.content || '')
    setError(null)
  }

  return (
    <section className="bg-white rounded-xl border-2 border-primary/20 p-6">
      <h2 className="text-xl font-heading font-semibold text-neutral-dark mb-4">
        {initialMyReview ? 'Twoja recenzja' : 'Dodaj recenzję'}
      </h2>

      {/* Rating Input */}
      <div className="mb-4">
        <PzkRatingInput
          value={rating}
          onChange={setRating}
          disabled={isSaving || isDeleting}
        />
      </div>

      {/* Content Textarea */}
      <div className="mb-4">
        <label
          htmlFor="review-content"
          className="block text-sm font-semibold text-neutral-dark mb-2"
        >
          Treść recenzji
        </label>
        <textarea
          id="review-content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={isSaving || isDeleting}
          rows={6}
          maxLength={5000}
          placeholder="Podziel się swoją opinią o Przestrzeni Zdrowej Kobiety..."
          className="w-full px-4 py-3 border-2 border-neutral-dark/20 rounded-lg focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-describedby="review-content-hint"
        />
        <p id="review-content-hint" className="text-sm text-neutral-dark/60 mt-1">
          {content.trim().length} / 5000 znaków
        </p>
      </div>

      {/* Error Message with aria-live */}
      {error && (
        <div
          className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600"
          role="alert"
          aria-live="polite"
        >
          {error}
        </div>
      )}

      {/* Success Message with aria-live */}
      {!error && !isDirty && initialMyReview && (
        <div
          className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600"
          role="status"
          aria-live="polite"
        >
          Recenzja zapisana pomyślnie
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-6 py-2 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={isSaving ? 'Zapisywanie recenzji...' : 'Zapisz recenzję'}
        >
          {isSaving ? 'Zapisywanie...' : 'Zapisz'}
        </button>

        {canDelete && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-6 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={isDeleting ? 'Usuwanie recenzji...' : 'Usuń recenzję'}
          >
            {isDeleting ? 'Usuwanie...' : 'Usuń'}
          </button>
        )}

        {isDirty && (
          <button
            onClick={handleCancel}
            disabled={isSaving || isDeleting}
            className="px-6 py-2 border-2 border-neutral-dark/20 text-neutral-dark rounded-lg font-semibold hover:bg-neutral-dark/5 focus:outline-none focus:ring-2 focus:ring-neutral-dark/20 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Anuluj zmiany"
          >
            Anuluj
          </button>
        )}
      </div>

      {/* Last Updated */}
      {initialMyReview && !isDirty && (
        <p className="text-sm text-neutral-dark/60 mt-4">
          {initialMyReview.metaLabel}
        </p>
      )}
    </section>
  )
}
