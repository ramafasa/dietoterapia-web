import { useState } from 'react';
import { useWeightEntry } from '@/hooks/useWeightEntry';
import type { WeightEntryWidgetProps } from '@/types';
import { toast } from 'react-hot-toast';
import ConfirmModal from '@/components/ui/ConfirmModal';

/**
 * WeightEntryWidget - main interactive form for adding first weight entry
 * Includes real-time validation, API integration, and skip option
 */
export default function WeightEntryWidget({ onSuccess, onSkip }: WeightEntryWidgetProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const {
    formData,
    updateField,
    errors,
    isSubmitting,
    validateWeight,
    handleSubmit,
    setFieldError
  } = useWeightEntry();

  // Calculate date constraints
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const minDate = sevenDaysAgo.toISOString().split('T')[0];

  /**
   * Handle form submission
   */
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await handleSubmit();

    if (result.success) {
      // Success toast
      toast.success('Pierwsza waga dodana! Przekierowuję do dashboardu...', {
        duration: 3000,
        position: 'top-center'
      });

      // Callback if provided
      onSuccess?.();

      // Redirect after 1.5s
      setTimeout(() => {
        window.location.href = '/waga';
      }, 1500);
    } else {
      // Error toast - use returned message directly (no async state issues)
      toast.error(result.message || 'Nie udało się dodać wagi. Spróbuj ponownie.', {
        duration: 5000,
        position: 'top-center'
      });
    }
  };

  /**
   * Handle skip button - otwiera modal potwierdzenia
   */
  const handleSkipClick = () => {
    setIsModalOpen(true);
  };

  /**
   * Potwierdzenie pominięcia - przekierowanie do dashboardu
   */
  const handleConfirmSkip = () => {
    setIsModalOpen(false);
    onSkip?.();
    window.location.href = '/waga';
  };

  /**
   * Anulowanie pominięcia - zamknięcie modala
   */
  const handleCancelSkip = () => {
    setIsModalOpen(false);
  };

  /**
   * Handle weight input change (without real-time validation)
   */
  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    updateField('weight', value);
  };

  /**
   * Handle weight input blur - validate when user leaves the field
   */
  const handleWeightBlur = () => {
    if (formData.weight) {
      const error = validateWeight(formData.weight);
      setFieldError('weight', error);
    }
  };

  return (
    <section className="mb-16">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-lg p-8 md:p-12">
        <h2 className="font-heading text-2xl md:text-3xl font-bold text-neutral-dark mb-8 text-center">
          Dodaj pierwszą wagę
        </h2>

        <form onSubmit={handleFormSubmit} className="space-y-6">
          {/* Weight Input */}
          <div className="form-group">
            <label htmlFor="weight" className="block font-body font-semibold text-neutral-dark mb-2">
              Waga (kg) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              id="weight"
              name="weight"
              min="30"
              max="250"
              step="0.1"
              value={formData.weight}
              onChange={handleWeightChange}
              onBlur={handleWeightBlur}
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
              onChange={(e) => updateField('measurementDate', e.target.value)}
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
              onChange={(e) => updateField('note', e.target.value)}
              placeholder="np. po śniadaniu, przed treningiem..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg border-2 border-gray-300 bg-white font-body transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              disabled={isSubmitting}
            />
            <p className={`text-sm mt-1 font-body ${formData.note && formData.note.length > 180 ? 'text-orange-500' : 'text-gray-500'}`}>
              {formData.note?.length || 0}/200 znaków
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="submit"
              disabled={isSubmitting || !!errors.weight || !!errors.measurementDate}
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
                'Dodaj pierwszą wagę'
              )}
            </button>

            <button
              type="button"
              onClick={handleSkipClick}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none bg-transparent text-neutral-dark font-body font-semibold py-4 px-6 rounded-lg border-2 border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-gray-400/50 focus:ring-offset-2"
            >
              Pomiń i przejdź do dashboardu
            </button>
          </div>
        </form>
      </div>

      {/* Modal potwierdzenia pominięcia */}
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
    </section>
  );
}
