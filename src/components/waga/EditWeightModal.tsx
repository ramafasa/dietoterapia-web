import { useCallback, useEffect, useRef, useState } from 'react';
import type { WeightEntryDTO, EditFormData, EditFormErrors, UpdateWeightEntryRequest } from '@/types';
import { useWeightEntry } from '@/hooks/useWeightEntry';

type EditWeightModalProps = {
  isOpen: boolean;
  entry: WeightEntryDTO | null;
  onClose: () => void;
  onSaved: (updated: WeightEntryDTO) => void;
};

export default function EditWeightModal({ isOpen, entry, onClose, onSaved }: EditWeightModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const weightInputRef = useRef<HTMLInputElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const [formData, setFormData] = useState<EditFormData>({
    weight: '',
    note: ''
  });

  const [errors, setErrors] = useState<EditFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get validation functions from useWeightEntry hook
  const { validateWeight, validateNote } = useWeightEntry();

  // Initialize form when entry changes
  useEffect(() => {
    if (entry) {
      setFormData({
        weight: entry.weight.toString(),
        note: entry.note || ''
      });
      setErrors({});
    }
  }, [entry]);

  // Focus on weight input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => weightInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Escape handler
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isSubmitting, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!entry) return;

      // Validate
      const weightError = validateWeight(formData.weight);
      const noteError = validateNote(formData.note);

      if (weightError || noteError) {
        setErrors({
          weight: weightError,
          note: noteError
        });
        return;
      }

      setIsSubmitting(true);
      setErrors({});

      try {
        const requestBody: UpdateWeightEntryRequest = {
          weight: parseFloat(formData.weight),
          note: formData.note?.trim() || undefined
        };

        const response = await fetch(`/api/weight/${entry.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          let errorMessage = 'Nie udało się zaktualizować wpisu.';

          try {
            const errorBody = await response.json();
            if (errorBody && typeof errorBody.message === 'string') {
              errorMessage = errorBody.message;
            }

            // Handle specific error codes
            if (response.status === 400 && errorBody?.error === 'edit_window_expired') {
              setErrors({ submit: 'Czas na edycję tego wpisu już minął.' });
              return;
            }

            if (response.status === 422 && Array.isArray(errorBody?.details)) {
              const fieldErrors: EditFormErrors = {};

              for (const detail of errorBody.details) {
                if (detail?.field === 'weight') {
                  fieldErrors.weight = detail.message;
                }
                if (detail?.field === 'note') {
                  fieldErrors.note = detail.message;
                }
              }

              setErrors(fieldErrors);
              return;
            }
          } catch {
            // ignore parsing errors
          }

          throw new Error(errorMessage);
        }

        const data = await response.json();
        onSaved(data.entry);
        onClose();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Wystąpił nieoczekiwany błąd.';
        setErrors({ submit: message });
      } finally {
        setIsSubmitting(false);
      }
    },
    [entry, formData, validateWeight, validateNote, onSaved, onClose]
  );

  const handleWeightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, weight: e.target.value }));
    setErrors((prev) => ({ ...prev, weight: undefined, submit: undefined }));
  }, []);

  const handleNoteChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, note: value }));
    setErrors((prev) => ({ ...prev, note: validateNote(value), submit: undefined }));
  }, [validateNote]);

  if (!isOpen || !entry) return null;

  const measurementDate = new Date(entry.measurementDate).toLocaleDateString('pl-PL', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" aria-hidden="true" onClick={onClose} />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white rounded-2xl shadow-soft-lg max-w-md w-full p-6"
      >
        {/* Header */}
        <div className="mb-6">
          <h2
            id="edit-modal-title"
            className="font-heading font-bold text-xl text-neutral-dark mb-1"
          >
            Edytuj pomiar
          </h2>
          <p className="text-sm text-neutral-dark/60">{measurementDate}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Weight Field */}
          <div className="mb-4">
            <label htmlFor="edit-weight" className="block text-sm font-medium text-neutral-dark mb-2">
              Waga (kg) <span className="text-rose-600">*</span>
            </label>
            <input
              ref={weightInputRef}
              type="number"
              id="edit-weight"
              step="0.1"
              min="30"
              max="250"
              value={formData.weight}
              onChange={handleWeightChange}
              disabled={isSubmitting}
              className={`w-full px-4 py-3 border rounded-lg text-base
                       focus:outline-none focus:ring-2 focus:ring-primary/50
                       disabled:bg-neutral-light/50 disabled:cursor-not-allowed
                       ${errors.weight ? 'border-rose-500' : 'border-neutral-light'}`}
              placeholder="np. 75.5"
            />
            {errors.weight && (
              <p className="mt-1 text-xs text-rose-600">{errors.weight}</p>
            )}
          </div>

          {/* Note Field */}
          <div className="mb-6">
            <label htmlFor="edit-note" className="block text-sm font-medium text-neutral-dark mb-2">
              Notatka (opcjonalnie)
            </label>
            <textarea
              id="edit-note"
              rows={3}
              maxLength={200}
              value={formData.note}
              onChange={handleNoteChange}
              disabled={isSubmitting}
              className={`w-full px-4 py-3 border rounded-lg text-base resize-none
                       focus:outline-none focus:ring-2 focus:ring-primary/50
                       disabled:bg-neutral-light/50 disabled:cursor-not-allowed
                       ${errors.note ? 'border-rose-500' : 'border-neutral-light'}`}
              placeholder="Dodaj notatkę..."
            />
            <div className="flex justify-between items-center mt-1">
              {errors.note ? (
                <p className="text-xs text-rose-600">{errors.note}</p>
              ) : (
                <span className="text-xs text-neutral-dark/50">
                  {formData.note?.length || 0} / 200
                </span>
              )}
            </div>
          </div>

          {/* Submit Error */}
          {errors.submit && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <p className="text-sm text-rose-600">{errors.submit}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 bg-transparent text-neutral-dark font-semibold py-3 px-6 rounded-lg
                       border-2 border-gray-300 hover:bg-gray-50 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anuluj
            </button>

            <button
              ref={saveButtonRef}
              type="submit"
              disabled={isSubmitting}
              className="flex-1 bg-primary text-white font-semibold py-3 px-6 rounded-lg
                       hover:bg-primary/90 transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed
                       focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
            >
              {isSubmitting ? 'Zapisywanie...' : 'Zapisz'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
