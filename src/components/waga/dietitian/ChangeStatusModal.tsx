import { useState } from 'react'
import toast from 'react-hot-toast'
import type { UpdatePatientStatusRequest } from '../../../types'
import { getStatusWarning } from '../../../types/patient-details'
import { validateStatusNote } from '../../../utils/validation/patient-weight'

type ChangeStatusModalProps = {
  isOpen: boolean
  onClose: () => void
  patientId: string
  currentStatus: 'active' | 'paused' | 'ended' | null
  onSuccess: () => void
}

/**
 * Change Status Modal
 * Modal for changing patient status with optional note
 */
export default function ChangeStatusModal({
  isOpen,
  onClose,
  patientId,
  currentStatus,
  onSuccess,
}: ChangeStatusModalProps) {
  const [status, setStatus] = useState<'active' | 'paused' | 'ended'>(
    currentStatus || 'active'
  )
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ note?: string; submit?: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatus(e.target.value as 'active' | 'paused' | 'ended')
    setErrors({})
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(e.target.value)
    setErrors({})
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate note
    const noteError = validateStatusNote(note)
    if (noteError) {
      setErrors({ note: noteError })
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const body: UpdatePatientStatusRequest = {
        status,
        note: note.trim() || undefined,
      }

      const response = await fetch(`/api/dietitian/patients/${patientId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Pacjent nie został znaleziony')
        } else if (response.status === 403) {
          throw new Error('Brak uprawnień')
        } else if (response.status === 422 || response.status === 400) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Błędne dane')
        } else {
          throw new Error('Wystąpił błąd podczas zmiany statusu')
        }
      }

      // Success
      toast.success('Status pacjenta został zmieniony')
      onSuccess()
      onClose()
      resetForm()
    } catch (err) {
      if (err instanceof Error) {
        setErrors({ submit: err.message })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setStatus(currentStatus || 'active')
    setNote('')
    setErrors({})
  }

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm()
      onClose()
    }
  }

  const warning = getStatusWarning(status)

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 id="modal-title" className="text-2xl font-heading font-bold text-neutral-dark">
            Zmień status pacjenta
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-neutral-dark/60 hover:text-neutral-dark transition-colors"
            aria-label="Zamknij modal"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Status Select */}
          <div className="mb-4">
            <label htmlFor="status" className="block text-sm font-semibold text-neutral-dark mb-2">
              Status <span className="text-red-600">*</span>
            </label>
            <select
              id="status"
              value={status}
              onChange={handleStatusChange}
              disabled={isSubmitting}
              className="w-full px-4 py-2 rounded-lg border border-neutral-dark/20 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="active">Aktywny</option>
              <option value="paused">Wstrzymany</option>
              <option value="ended">Zakończony</option>
            </select>
          </div>

          {/* Warning */}
          {warning && (
            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800">
                <strong>Uwaga:</strong> {warning}
              </p>
            </div>
          )}

          {/* Note Textarea */}
          <div className="mb-4">
            <label htmlFor="note" className="block text-sm font-semibold text-neutral-dark mb-2">
              Notatka (opcjonalna)
            </label>
            <textarea
              id="note"
              value={note}
              onChange={handleNoteChange}
              disabled={isSubmitting}
              rows={4}
              maxLength={500}
              placeholder="Dodaj notatkę do zmiany statusu..."
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.note ? 'border-red-500' : 'border-neutral-dark/20'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.note && (
                <p className="text-red-600 text-sm">{errors.note}</p>
              )}
              <p className="text-xs text-neutral-dark/60 ml-auto">
                {note.length}/500
              </p>
            </div>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{errors.submit}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg border border-neutral-dark/20 text-neutral-dark font-semibold hover:bg-neutral-dark/5 transition-colors disabled:opacity-50"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
