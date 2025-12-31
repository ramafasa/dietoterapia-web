/**
 * usePzkNote Hook
 *
 * Custom React hook for managing patient's private note for a material.
 *
 * Features:
 * - Local state management (value, isDirty)
 * - Save note (PUT /api/pzk/materials/:materialId/note)
 * - Delete note (DELETE /api/pzk/materials/:materialId/note)
 * - Client-side validation (1-10000 chars after trim)
 * - Loading states (isSaving, isDeleting)
 * - Error handling with retry
 *
 * Usage:
 * ```tsx
 * const note = usePzkNote(materialId, initialNote)
 *
 * <textarea value={note.value} onChange={(e) => note.setValue(e.target.value)} />
 * <button onClick={note.save} disabled={!note.canSave}>Zapisz</button>
 * ```
 */

import { useCallback, useState } from 'react'
import type {
  ApiResponse,
  PzkNoteDto,
  PzkNoteUpsertRequest,
} from '@/types/pzk-dto'
import type { PzkMaterialNoteVM } from '@/types/pzk-vm'

type UsePzkNoteReturn = {
  value: string
  setValue: (newValue: string) => void
  isDirty: boolean
  isSaving: boolean
  isDeleting: boolean
  canSave: boolean
  canDelete: boolean
  validationError: string | null
  error: { message: string; retryable: boolean } | null
  lastSavedAt: string | null
  save: () => Promise<void>
  deleteNote: () => Promise<void>
}

/**
 * Hook for managing patient's note
 *
 * @param materialId - Material UUID
 * @param initialNote - Initial note from API (null if no note exists)
 * @returns Note state and actions
 */
export function usePzkNote(
  materialId: string,
  initialNote: PzkMaterialNoteVM | null
): UsePzkNoteReturn {
  const [value, setValue] = useState<string>(initialNote?.content || '')
  const [isDirty, setIsDirty] = useState<boolean>(false)
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isDeleting, setIsDeleting] = useState<boolean>(false)
  const [error, setError] = useState<{
    message: string
    retryable: boolean
  } | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    initialNote?.updatedAt || null
  )

  /**
   * Validate note content
   * Returns error message or null if valid
   */
  const validateContent = useCallback((content: string): string | null => {
    const trimmed = content.trim()

    if (trimmed.length === 0) {
      return 'Notatka nie może być pusta.'
    }

    if (trimmed.length > 10000) {
      return `Notatka jest za długa (${trimmed.length}/10000 znaków).`
    }

    return null
  }, [])

  const validationError = validateContent(value)

  // Can save if:
  // - Not currently saving/deleting
  // - Content is dirty (changed)
  // - Content is valid
  const canSave = !isSaving && !isDeleting && isDirty && !validationError

  // Can delete if:
  // - Not currently saving/deleting
  // - Note exists (has been saved before)
  const canDelete = !isSaving && !isDeleting && lastSavedAt !== null

  /**
   * Update value and mark as dirty
   */
  const handleSetValue = useCallback((newValue: string) => {
    setValue(newValue)
    setIsDirty(true)
    setError(null)
  }, [])

  /**
   * Save note via PUT API
   */
  const save = useCallback(async () => {
    // Validate before saving
    const trimmed = value.trim()
    const validationErr = validateContent(trimmed)
    if (validationErr) {
      setError({ message: validationErr, retryable: false })
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const response = await fetch(`/api/pzk/materials/${materialId}/note`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ content: trimmed } as PzkNoteUpsertRequest),
      })

      if (!response.ok) {
        let errorMessage = 'Nie udało się zapisać notatki.'

        // Try to parse error from ApiResponse envelope
        try {
          const errorBody: ApiResponse<PzkNoteDto> = await response.json()
          if (errorBody.error && errorBody.error.message) {
            errorMessage = errorBody.error.message
          }
        } catch {
          // Ignore JSON parsing errors
        }

        // Map specific status codes
        if (response.status === 401) {
          errorMessage = 'Sesja wygasła. Zaloguj się ponownie.'
        } else if (response.status === 403) {
          errorMessage = 'Brak dostępu do tego materiału.'
        } else if (response.status === 404) {
          errorMessage = 'Materiał nie został znaleziony.'
        }

        setError({
          message: errorMessage,
          retryable: response.status >= 500,
        })
        return
      }

      // Parse successful response
      const apiResponse: ApiResponse<PzkNoteDto> = await response.json()

      if (!apiResponse.data) {
        throw new Error('Nieprawidłowa odpowiedź serwera.')
      }

      // Update state
      setValue(apiResponse.data.content)
      setLastSavedAt(apiResponse.data.updatedAt)
      setIsDirty(false)
      setError(null)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Wystąpił błąd podczas zapisywania notatki.'

      setError({ message, retryable: true })
    } finally {
      setIsSaving(false)
    }
  }, [materialId, value, validateContent])

  /**
   * Delete note via DELETE API
   */
  const deleteNote = useCallback(async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch(`/api/pzk/materials/${materialId}/note`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        let errorMessage = 'Nie udało się usunąć notatki.'

        // Try to parse error (DELETE may return 204 No Content on success)
        if (response.status !== 204) {
          try {
            const errorBody = await response.json()
            if (errorBody.error && errorBody.error.message) {
              errorMessage = errorBody.error.message
            }
          } catch {
            // Ignore JSON parsing errors
          }
        }

        // Map specific status codes
        if (response.status === 401) {
          errorMessage = 'Sesja wygasła. Zaloguj się ponownie.'
        } else if (response.status === 403) {
          errorMessage = 'Brak dostępu do tego materiału.'
        } else if (response.status === 404) {
          errorMessage = 'Notatka nie została znaleziona.'
        }

        setError({
          message: errorMessage,
          retryable: response.status >= 500,
        })
        return
      }

      // Success: Clear note state
      setValue('')
      setLastSavedAt(null)
      setIsDirty(false)
      setError(null)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Wystąpił błąd podczas usuwania notatki.'

      setError({ message, retryable: true })
    } finally {
      setIsDeleting(false)
    }
  }, [materialId])

  return {
    value,
    setValue: handleSetValue,
    isDirty,
    isSaving,
    isDeleting,
    canSave,
    canDelete,
    validationError,
    error,
    lastSavedAt,
    save,
    deleteNote,
  }
}
