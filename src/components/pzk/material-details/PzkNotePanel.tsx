/**
 * PzkNotePanel Component
 *
 * Patient's private note editor for material.
 *
 * Features:
 * - Textarea with real-time character count
 * - Save button (disabled when invalid or unchanged)
 * - Delete button (disabled when no saved note)
 * - Loading states (saving, deleting)
 * - Validation feedback (1-10000 chars after trim)
 * - Error handling with retry
 * - Last saved timestamp
 *
 * Props:
 * - materialId: string
 * - initialNote: PzkMaterialNoteVM | null
 */

import type { PzkMaterialNoteVM } from '@/types/pzk-vm'
import { usePzkNote } from '@/hooks/pzk/usePzkNote'
import { useState } from 'react'

interface PzkNotePanelProps {
  materialId: string
  initialNote: PzkMaterialNoteVM | null
}

export function PzkNotePanel({ materialId, initialNote }: PzkNotePanelProps) {
  const note = usePzkNote(materialId, initialNote)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    await note.deleteNote()
    setShowDeleteConfirm(false)
  }

  const charCount = note.value.trim().length

  return (
    <section
      className="bg-white rounded-xl border-2 border-neutral-light p-6"
      aria-label="Twoje notatki"
      data-testid="pzk-note-panel"
    >
      {/* Section Header */}
      <div className="mb-4">
        <h2 className="text-xl font-heading font-bold text-neutral-dark mb-1">
          Twoje notatki
        </h2>
        <p className="text-sm text-neutral-dark/60">
          Prywatna notatka widoczna tylko dla Ciebie.
        </p>
      </div>

      {/* Textarea */}
      <div className="mb-4">
        <textarea
          value={note.value}
          onChange={(e) => note.setValue(e.target.value)}
          placeholder="Wprowadź swoją notatkę..."
          disabled={note.isSaving || note.isDeleting}
          className="w-full min-h-[200px] p-4 border-2 border-neutral-dark/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Treść notatki"
        />

        {/* Character Count + Validation */}
        <div className="flex items-center justify-between mt-2 text-sm">
          <div>
            {note.validationError ? (
              <span className="text-red-600 font-medium">
                {note.validationError}
              </span>
            ) : (
              <span
                className={
                  charCount > 9000
                    ? 'text-yellow-600 font-medium'
                    : 'text-neutral-dark/60'
                }
              >
                {charCount.toLocaleString('pl-PL')} / 10 000 znaków
              </span>
            )}
          </div>

          {/* Last Saved Timestamp */}
          {note.lastSavedAt && (
            <span className="text-neutral-dark/60">
              Ostatnio zapisano:{' '}
              {new Date(note.lastSavedAt).toLocaleString('pl-PL')}
            </span>
          )}
        </div>
      </div>

      {/* Error Message */}
      {note.error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700 text-sm">{note.error.message}</p>
          {note.error.retryable && (
            <button
              onClick={note.save}
              className="mt-2 text-red-600 font-semibold hover:text-red-800 underline text-sm"
            >
              Spróbuj ponownie
            </button>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3">
        {/* Save Button */}
        <button
          onClick={note.save}
          disabled={!note.canSave}
          className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          aria-label="Zapisz notatkę"
        >
          {note.isSaving ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Zapisuję...
            </span>
          ) : (
            'Zapisz'
          )}
        </button>

        {/* Delete Button */}
        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={!note.canDelete}
            className="px-6 py-3 border-2 border-red-500 text-red-500 rounded-lg font-semibold hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            aria-label="Usuń notatkę"
          >
            Usuń
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <span className="text-sm text-neutral-dark/70">
              Czy na pewno usunąć?
            </span>
            <button
              onClick={handleDelete}
              disabled={note.isDeleting}
              className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 text-sm"
            >
              {note.isDeleting ? 'Usuwam...' : 'Tak, usuń'}
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              disabled={note.isDeleting}
              className="px-4 py-2 border-2 border-neutral-dark/20 text-neutral-dark rounded-lg font-semibold hover:bg-neutral-light transition-colors disabled:opacity-50 text-sm"
            >
              Anuluj
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
