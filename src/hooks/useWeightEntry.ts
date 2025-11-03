import { useState } from 'react';
import type {
  WeightEntryFormData,
  WeightEntryErrors,
  CreateWeightEntryRequest,
  CreateWeightEntryResponse
} from '@/types';

/**
 * Custom hook for weight entry form management
 * Handles form state, validation, and API submission
 */
export function useWeightEntry() {
  const [formData, setFormData] = useState<WeightEntryFormData>({
    weight: '',
    measurementDate: new Date().toISOString().split('T')[0], // Today
    note: ''
  });

  const [errors, setErrors] = useState<WeightEntryErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  /**
   * Validates weight field
   * Rules: 30-250 kg, max 1 decimal place, required
   */
  const validateWeight = (value: string): string | undefined => {
    if (!value || value.trim() === '') {
      return 'Waga jest wymagana';
    }

    const numValue = parseFloat(value);

    if (isNaN(numValue)) {
      return 'Waga musi być liczbą';
    }

    if (numValue < 30) {
      return 'Waga nie może być mniejsza niż 30 kg';
    }

    if (numValue > 250) {
      return 'Waga nie może być większa niż 250 kg';
    }

    // Check max 1 decimal place
    if (!/^\d+(\.\d{1})?$/.test(value)) {
      return 'Maksymalnie 1 miejsce po przecinku';
    }

    return undefined;
  };

  /**
   * Validates measurement date
   * Rules: max 7 days back, cannot be future date
   *
   * Note: Compares date strings (YYYY-MM-DD) instead of Date objects
   * to avoid timezone issues. Input type="date" always returns YYYY-MM-DD.
   */
  const validateDate = (value: string): string | undefined => {
    // Get today's date in YYYY-MM-DD format (local timezone)
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];

    // Calculate 7 days ago in YYYY-MM-DD format
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const minDateString = sevenDaysAgo.toISOString().split('T')[0];

    // Compare strings lexicographically (works for YYYY-MM-DD format)
    if (value > todayString) {
      return 'Nie można wybrać przyszłej daty';
    }

    if (value < minDateString) {
      return 'Możesz dodać wagę maksymalnie 7 dni wstecz';
    }

    return undefined;
  };

  /**
   * Submits weight entry to API
   * Returns object with success status and optional error message
   */
  const handleSubmit = async (): Promise<{ success: boolean; message?: string }> => {
    // Validate all fields
    const weightError = validateWeight(formData.weight);
    const dateError = validateDate(formData.measurementDate);

    if (weightError || dateError) {
      setErrors({
        weight: weightError,
        measurementDate: dateError
      });
      return { success: false, message: 'Popraw błędy walidacji' };
    }

    setIsSubmitting(true);
    setErrors({});

    try {
      const requestBody: CreateWeightEntryRequest = {
        weight: parseFloat(formData.weight),
        measurementDate: formData.measurementDate,
        note: formData.note || undefined
      };

      const response = await fetch('/api/weight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.message || 'Wystąpił błąd podczas dodawania wagi';

        // Set errors for backward compatibility with form display
        setErrors({ submit: errorMessage });

        return { success: false, message: errorMessage };
      }

      const data: CreateWeightEntryResponse = await response.json();

      // Log warnings if any (for first entry, probably empty)
      if (data.warnings && data.warnings.length > 0) {
        console.warn('Weight entry warnings:', data.warnings);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Wystąpił błąd podczas dodawania wagi';

      // Set errors for backward compatibility with form display
      setErrors({ submit: errorMessage });

      return { success: false, message: errorMessage };
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Updates form field value
   */
  const updateField = <K extends keyof WeightEntryFormData>(
    field: K,
    value: WeightEntryFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  /**
   * Sets validation error for a specific field (used for onBlur validation)
   */
  const setFieldError = (field: keyof WeightEntryErrors, error: string | undefined) => {
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  return {
    formData,
    setFormData,
    updateField,
    errors,
    isSubmitting,
    validateWeight,
    validateDate,
    handleSubmit,
    setFieldError
  };
}
