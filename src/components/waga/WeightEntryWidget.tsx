import { useState } from 'react';
import { useWeightEntry } from '@/hooks/useWeightEntry';
import type { WeightEntryWidgetProps } from '@/types';
import { toast } from 'react-hot-toast';
import ConfirmModal from '@/components/ui/ConfirmModal';

/**
 * WeightEntryWidget - main interactive form for adding weight entry
 * Includes validation, API integration, anomaly warning support (Step 4), and optional skip flow
 */
export default function WeightEntryWidget({
  onSuccess,
  onSkip,
  showSkipButton
}: WeightEntryWidgetProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    formData,
    updateField,
    errors,
    isSubmitting,
    validateWeight,
    validateDate,
    validateNote,
    handleSubmit,
    setFieldError,
    isDuplicateForSelectedDate,
    isDuplicateToday
  } = useWeightEntry();

  const shouldShowSkip = showSkipButton ?? true;
  const isDashboardContext = !shouldShowSkip && typeof onSuccess === 'function';

  // Calculate date constraints
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const minDate = sevenDaysAgo.toISOString().split('T')[0];

  const submitForm = async () => {
    if (isSubmitting) {
      return;
    }

    const result = await handleSubmit();

    if (result.success) {
      const successMessage = isDashboardContext
        ? 'Dodano pomiar wagi! 🎉'
        : 'Pierwsza waga dodana! Przekierowuję do dashboardu...';

      toast.success(successMessage, {
        duration: isDashboardContext ? 2500 : 3000,
        position: 'top-center'
      });

      if (isDashboardContext) {
        onSuccess?.();
      } else {
        onSuccess?.();
        setTimeout(() => {
          window.location.href = '/pacjent/waga';
        }, 1500);
      }

      if (result.warnings.length > 0) {
        console.warn('Weight entry warnings:', result.warnings);
      }
    } else {
      toast.error(result.message ?? 'Nie udało się dodać wagi. Spróbuj ponownie.', {
        duration: 5000,
        position: 'top-center'
      });
    }
  };

  /**
   * Handle form submission via button/Enter
   */
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitForm();
  };

  /**
   * Handle Ctrl+Enter / Cmd+Enter keyboard shortcut
   */
  const handleFormKeyDown = async (event: React.KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      await submitForm();
    }
  };

  const handleWeightChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    updateField('weight', event.target.value);
  };

  const handleWeightBlur = () => {
    if (formData.weight) {
      const error = validateWeight(formData.weight);
      setFieldError('weight', error);
    }
  };

  const handleWeightKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (['e', 'E', '+', '-'].includes(event.key)) {
      event.preventDefault();
    }
  };

  const handleDateBlur = () => {
    const error = validateDate(formData.measurementDate);
    setFieldError('measurementDate', error);
  };

  const handleNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateField('note', event.target.value);
  };

  const handleNoteBlur = () => {
    const error = validateNote(formData.note);
    setFieldError('note', error);
  };

  const handleSkipClick = () => {
    setIsModalOpen(true);
  };

  const handleConfirmSkip = () => {
    setIsModalOpen(false);
    onSkip?.();
    window.location.href = '/pacjent/waga';
  };

  const handleCancelSkip = () => {
    setIsModalOpen(false);
  };

  const duplicateMessage = isDuplicateForSelectedDate
    ? isDuplicateToday
      ? 'Masz już zapisany pomiar dla dzisiejszej daty.'
      : 'Masz już zapisany pomiar dla wybranej daty.'
    : null;

  const submitButtonDisabled =
    isSubmitting ||
    !!errors.weight ||
    !!errors.measurementDate ||
    !!errors.note ||
    isDuplicateForSelectedDate;

  return (
    <section className="mb-16">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-12">
        <h2 className="font-heading text-2xl md:text-3xl font-bold text-neutral-dark mb-8 text-center">
          {isDashboardContext ? 'Dodaj pomiar wagi' : 'Dodaj pierwszą wagę'}
        </h2>

        <form onSubmit={handleFormSubmit} onKeyDown={handleFormKeyDown} className="space-y-6">
          {/* Weight Input */}
          <div className="form-group">
            <label htmlFor="weight" className="block font-body font-semibold text-neutral-dark mb-2">
              Waga (kg) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              inputMode="decimal"
              id="weight"
              name="weight"
              min="30"
              max="250"
              step="0.1"
              value={formData.weight}
              onChange={handleWeightChange}
              onBlur={handleWeightBlur}
              onKeyDown={handleWeightKeyDown}
              placeholder="np. 75.5"
              className={`w-full px-4 py-3 rounded-lg border-2 font-body transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                errors.weight
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-300 bg-white focus:border-primary'
              }`}
              aria-describedby={errors.weight ? 'weight-error' : undefined}
              aria-invalid={!!errors.weight}
              disabled={isSubmitting}
              autoFocus
            />
            {errors.weight && (
              <p id="weight-error" className="text-red-600 text-sm mt-2 font-body" role="alert">
                {errors.weight}
              </p>
            )}
          </div>

          {/* Date Picker */}
          <div className="form-group">
            <label htmlFor="measurementDate" className="block font-body font-semibold text-neutral-dark mb-2">
              Data pomiaru
            </label>
            <input
              type="date"
              id="measurementDate"
              name="measurementDate"
              value={formData.measurementDate}
              onChange={(event) => updateField('measurementDate', event.target.value)}
              onBlur={handleDateBlur}
              max={today}
              min={minDate}
              className={`w-full px-4 py-3 rounded-lg border-2 font-body transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${
                errors.measurementDate
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-300 bg-white focus:border-primary'
              }`}
              aria-describedby={errors.measurementDate ? 'date-error' : undefined}
              aria-invalid={!!errors.measurementDate}
              disabled={isSubmitting}
            />
            {errors.measurementDate && (
              <p id="date-error" className="text-red-600 text-sm mt-2 font-body" role="alert">
                {errors.measurementDate}
              </p>
            )}
            <p className="text-gray-500 text-sm mt-1 font-body">
              Domyślnie dzisiaj. Możesz wybrać datę maksymalnie 7 dni wstecz.
            </p>

            {duplicateMessage && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {duplicateMessage}{' '}
                {isDuplicateToday
                  ? 'Jeśli chcesz zaktualizować dzisiejszy pomiar, skontaktuj się z dietetykiem.'
                  : 'Wybierz inną datę lub edytuj istniejący wpis.'}
              </div>
            )}
          </div>

          {/* Note (Optional) */}
          <div className="form-group">
            <label htmlFor="note" className="block font-body font-semibold text-neutral-dark mb-2">
              Notatka (opcjonalnie)
            </label>
            <textarea
              id="note"
              name="note"
              maxLength={200}
              value={formData.note}
              onChange={handleNoteChange}
              onBlur={handleNoteBlur}
              placeholder="np. po śniadaniu, przed treningiem..."
              rows={3}
              className={`w-full px-4 py-3 rounded-lg border-2 font-body transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none ${
                errors.note
                  ? 'border-red-500 bg-red-50'
                  : 'border-gray-300 bg-white focus:border-primary'
              }`}
              disabled={isSubmitting}
            />
            {errors.note && (
              <p className="text-red-600 text-sm mt-2 font-body" role="alert">
                {errors.note}
              </p>
            )}
            <p
              className={`text-sm mt-1 font-body ${
                formData.note && formData.note.length > 180 ? 'text-orange-500' : 'text-gray-500'
              }`}
              aria-live="polite"
            >
              {formData.note?.length || 0}/200 znaków
            </p>
          </div>

          {/* General submit error */}
          {errors.submit && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
              {errors.submit}
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="submit"
              disabled={submitButtonDisabled}
              className="flex-1 bg-primary text-white font-heading font-semibold py-4 px-6 rounded-lg hover:bg-primary/90 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
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
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Dodawanie...
                </span>
              ) : (
                (isDashboardContext ? 'Dodaj pomiar' : 'Dodaj pierwszą wagę')
              )}
            </button>

            {shouldShowSkip && (
              <button
                type="button"
                onClick={handleSkipClick}
                disabled={isSubmitting}
                className="flex-1 sm:flex-none bg-transparent text-neutral-dark font-body font-semibold py-4 px-6 rounded-lg border-2 border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-400/50 focus:ring-offset-2"
              >
                Pomiń i przejdź do dashboardu
              </button>
            )}
          </div>
        </form>
      </div>

      {shouldShowSkip && (
        <ConfirmModal
          isOpen={isModalOpen}
          title="Czy na pewno chcesz pominąć?"
          message="Możesz dodać wagę później na dashboardzie."
          confirmText="Pomiń"
          cancelText="Anuluj"
          onConfirm={handleConfirmSkip}
          onCancel={handleCancelSkip}
          variant="warning"
        />
      )}
    </section>
  );
}
