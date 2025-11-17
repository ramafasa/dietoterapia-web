import { useState } from 'react'
import toast from 'react-hot-toast'
import type { CreateWeightEntryDietitianRequest } from '../../../types'
import type { AddWeightForPatientFormVM } from '../../../types/patient-details'
import {
  validateWeight,
  validateMeasurementDate,
  validateDietitianNote,
} from '../../../utils/validation/patient-weight'

type AddWeightForPatientModalProps = {
  isOpen: boolean
  onClose: () => void
  patientId: string
  onSuccess: () => void
}

/**
 * Add Weight For Patient Modal
 * Modal for dietitian to add weight entry for patient
 */
export default function AddWeightForPatientModal({
  isOpen,
  onClose,
  patientId,
  onSuccess,
}: AddWeightForPatientModalProps) {
  const [formData, setFormData] = useState<AddWeightForPatientFormVM>({
    weight: '',
    measurementDate: new Date().toISOString().split('T')[0], // Today's date
    note: '',
  })
  const [errors, setErrors] = useState<AddWeightForPatientFormVM['errors']>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isOpen) return null

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, weight: e.target.value })
    setErrors({ ...errors, weight: undefined })
  }

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, measurementDate: e.target.value })
    setErrors({ ...errors, measurementDate: undefined })
  }

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData({ ...formData, note: e.target.value })
    setErrors({ ...errors, note: undefined })
  }

  const validateForm = (): boolean => {
    const newErrors: AddWeightForPatientFormVM['errors'] = {}

    const weightError = validateWeight(formData.weight)
    if (weightError) newErrors.weight = weightError

    const dateError = validateMeasurementDate(formData.measurementDate)
    if (dateError) newErrors.measurementDate = dateError

    const noteError = validateDietitianNote(formData.note)
    if (noteError) newErrors.note = noteError

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setErrors({})

    try {
      const body: CreateWeightEntryDietitianRequest = {
        weight: parseFloat(formData.weight),
        measurementDate: formData.measurementDate,
        note: formData.note.trim(),
      }

      const response = await fetch(`/api/dietitian/patients/${patientId}/weight`, {
        method: 'POST',
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
        } else if (response.status === 409) {
          throw new Error('Wpis dla tej daty już istnieje')
        } else if (response.status === 400) {
          const errorData = await response.json()
          // Check for backfill_limit_exceeded
          if (errorData.error === 'backfill_limit_exceeded') {
            setErrors({ measurementDate: 'Data nie może być starsza niż 7 dni wstecz' })
            setIsSubmitting(false)
            return
          }
          throw new Error(errorData.message || 'Błędne dane')
        } else if (response.status === 422) {
          const errorData = await response.json()
          throw new Error(errorData.message || 'Błędne dane walidacyjne')
        } else {
          throw new Error('Wystąpił błąd podczas dodawania wpisu')
        }
      }

      // Success
      toast.success('Wpis wagi został dodany')
      onSuccess()
      onClose()
      resetForm()
    } catch (err) {
      if (err instanceof Error) {
        setErrors({ ...errors, submit: err.message })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({
      weight: '',
      measurementDate: new Date().toISOString().split('T')[0],
      note: '',
    })
    setErrors({})
  }

  const handleClose = () => {
    if (!isSubmitting) {
      resetForm()
      onClose()
    }
  }

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
            Dodaj wpis wagi
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
          {/* Weight Input */}
          <div className="mb-4">
            <label htmlFor="weight" className="block text-sm font-semibold text-neutral-dark mb-2">
              Waga (kg) <span className="text-red-600">*</span>
            </label>
            <input
              type="number"
              id="weight"
              value={formData.weight}
              onChange={handleWeightChange}
              disabled={isSubmitting}
              step="0.1"
              min="30"
              max="250"
              placeholder="np. 75.5"
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.weight ? 'border-red-500' : 'border-neutral-dark/20'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
            />
            {errors.weight && (
              <p className="text-red-600 text-sm mt-1">{errors.weight}</p>
            )}
          </div>

          {/* Measurement Date Input */}
          <div className="mb-4">
            <label htmlFor="measurementDate" className="block text-sm font-semibold text-neutral-dark mb-2">
              Data pomiaru <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              id="measurementDate"
              value={formData.measurementDate}
              onChange={handleDateChange}
              disabled={isSubmitting}
              max={new Date().toISOString().split('T')[0]}
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.measurementDate ? 'border-red-500' : 'border-neutral-dark/20'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
            />
            {errors.measurementDate && (
              <p className="text-red-600 text-sm mt-1">{errors.measurementDate}</p>
            )}
            <p className="text-xs text-neutral-dark/60 mt-1">
              Maksymalnie 7 dni wstecz
            </p>
          </div>

          {/* Note Textarea */}
          <div className="mb-4">
            <label htmlFor="note" className="block text-sm font-semibold text-neutral-dark mb-2">
              Notatka <span className="text-red-600">*</span>
            </label>
            <textarea
              id="note"
              value={formData.note}
              onChange={handleNoteChange}
              disabled={isSubmitting}
              rows={4}
              maxLength={200}
              placeholder="Dodaj notatkę do wpisu (min. 10 znaków)..."
              className={`w-full px-4 py-2 rounded-lg border ${
                errors.note ? 'border-red-500' : 'border-neutral-dark/20'
              } focus:outline-none focus:ring-2 focus:ring-primary`}
            />
            <div className="flex items-center justify-between mt-1">
              {errors.note && (
                <p className="text-red-600 text-sm">{errors.note}</p>
              )}
              <p className="text-xs text-neutral-dark/60 ml-auto">
                {formData.note.length}/200
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
