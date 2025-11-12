import { useCallback, useMemo, useState } from 'react';
import type {
  WeightEntryFormData,
  WeightEntryErrors,
  CreateWeightEntryRequest,
  CreateWeightEntryResponse,
  AnomalyWarning
} from '@/types';

const getTodayString = () => new Date().toISOString().split('T')[0];

type WeightEntrySubmitSuccess = {
  success: true;
  response: CreateWeightEntryResponse;
  warnings: AnomalyWarning[];
};

type WeightEntrySubmitFailure = {
  success: false;
  message: string;
  status?: number;
  code?: string;
};

export type WeightEntrySubmitResult = WeightEntrySubmitSuccess | WeightEntrySubmitFailure;

/**
 * Custom hook for weight entry form management
 * Handles form state, validation, and API submission
 */
export function useWeightEntry() {
  const [formData, setFormData] = useState<WeightEntryFormData>({
    weight: '',
    measurementDate: getTodayString(),
    note: ''
  });

  const [errors, setErrors] = useState<WeightEntryErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState<string | null>(null);

  const isDuplicateForSelectedDate = useMemo(
    () => duplicateDate != null && duplicateDate === formData.measurementDate,
    [duplicateDate, formData.measurementDate]
  );
  const isDuplicateToday = useMemo(
    () => duplicateDate != null && duplicateDate === getTodayString(),
    [duplicateDate]
  );

  /**
   * Validates weight field
   * Rules: 30-250 kg, max 1 decimal place, required
   */
  const validateWeight = useCallback((value: string): string | undefined => {
    if (!value || value.trim() === '') {
      return 'Waga jest wymagana';
    }

    const numValue = parseFloat(value);

    if (Number.isNaN(numValue)) {
      return 'Waga musi być liczbą';
    }

    if (numValue < 30) {
      return 'Waga nie może być mniejsza niż 30 kg';
    }

    if (numValue > 250) {
      return 'Waga nie może być większa niż 250 kg';
    }

    if (!/^\d+(?:\.\d{1})?$/.test(value)) {
      return 'Maksymalnie 1 miejsce po przecinku';
    }

    return undefined;
  }, []);

  /**
   * Validates measurement date
   * Rules: max 7 days back, cannot be future date
   */
  const validateDate = useCallback((value: string): string | undefined => {
    const today = getTodayString();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const minDateString = sevenDaysAgo.toISOString().split('T')[0];

    if (value > today) {
      return 'Nie można wybrać przyszłej daty';
    }

    if (value < minDateString) {
      return 'Możesz dodać wagę maksymalnie 7 dni wstecz';
    }

    return undefined;
  }, []);

  /**
   * Validates note length
   */
  const validateNote = useCallback((value?: string): string | undefined => {
    if (value && value.length > 200) {
      return 'Notatka może mieć maksymalnie 200 znaków';
    }
    return undefined;
  }, []);

  /**
   * Reset form state to initial values
   */
  const resetForm = useCallback(() => {
    setFormData({
      weight: '',
      measurementDate: getTodayString(),
      note: ''
    });
    setErrors({});
    setDuplicateDate(null);
  }, []);

  /**
   * Submits weight entry to API
   * Returns object with success status and additional data
   */
  const handleSubmit = useCallback(async (): Promise<WeightEntrySubmitResult> => {
    const weightError = validateWeight(formData.weight);
    const dateError = validateDate(formData.measurementDate);
    const noteError = validateNote(formData.note);

    if (weightError || dateError || noteError) {
      setErrors({
        weight: weightError,
        measurementDate: dateError,
        note: noteError
      });

      return {
        success: false,
        message: 'Popraw błędy walidacji',
        status: 422,
        code: 'validation_error'
      };
    }

    setIsSubmitting(true);
    setErrors({});
    setDuplicateDate(null);

    try {
      const requestBody: CreateWeightEntryRequest = {
        weight: parseFloat(formData.weight),
        measurementDate: formData.measurementDate,
        note: formData.note?.trim() ? formData.note.trim() : undefined
      };

      const response = await fetch('/api/weight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        let errorBody: any = null;

        try {
          errorBody = await response.json();
        } catch {
          // ignore JSON parse errors
        }

        const message: string =
          errorBody?.message ?? 'Wystąpił błąd podczas dodawania wagi.';

        if (response.status === 409) {
          setErrors(prev => ({ ...prev, submit: message }));
          setDuplicateDate(formData.measurementDate);

          return {
            success: false,
            message,
            status: 409,
            code: errorBody?.error ?? 'duplicate_entry'
          };
        }

        if (response.status === 400) {
          setErrors(prev => ({
            ...prev,
            measurementDate: message,
            submit: message
          }));

          return {
            success: false,
            message,
            status: 400,
            code: errorBody?.error ?? 'bad_request'
          };
        }

        if (response.status === 422 && Array.isArray(errorBody?.details)) {
          const fieldErrors: WeightEntryErrors = {};

          for (const detail of errorBody.details) {
            if (detail?.field === 'weight') {
              fieldErrors.weight = detail.message;
            }
            if (detail?.field === 'measurementDate') {
              fieldErrors.measurementDate = detail.message;
            }
            if (detail?.field === 'note') {
              fieldErrors.note = detail.message;
            }
          }

          setErrors(fieldErrors);

          return {
            success: false,
            message,
            status: 422,
            code: errorBody?.error ?? 'validation_error'
          };
        }

        setErrors(prev => ({ ...prev, submit: message }));

        return {
          success: false,
          message,
          status: response.status,
          code: errorBody?.error
        };
      }

      const data: CreateWeightEntryResponse = await response.json();

      setErrors({});
      setDuplicateDate(null);

      setFormData(prev => ({
        ...prev,
        weight: '',
        note: ''
      }));

      return {
        success: true,
        response: data,
        warnings: data.warnings ?? []
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Wystąpił błąd podczas dodawania wagi.';

      setErrors(prev => ({ ...prev, submit: message }));

      return {
        success: false,
        message,
        code: 'network_error'
      };
    } finally {
      setIsSubmitting(false);
    }
  }, [formData, validateDate, validateNote, validateWeight]);

  /**
   * Updates form field value
   */
  const updateField = useCallback(
    <K extends keyof WeightEntryFormData>(field: K, value: WeightEntryFormData[K]) => {
      setFormData(prev => ({ ...prev, [field]: value }));

      if (errors[field]) {
        setErrors(prev => ({ ...prev, [field]: undefined }));
      }

      if (errors.submit) {
        setErrors(prev => ({ ...prev, submit: undefined }));
      }

      if (field === 'measurementDate') {
        setDuplicateDate(null);
      }

      if (field === 'note') {
        setErrors(prev => ({ ...prev, note: validateNote(value as string) }));
      }
    },
    [errors, validateNote]
  );

  /**
   * Sets validation error for a specific field (used for onBlur validation)
   */
  const setFieldError = useCallback(
    (field: keyof WeightEntryErrors, error: string | undefined) => {
      setErrors(prev => ({ ...prev, [field]: error }));
    },
    []
  );

  return {
    formData,
    setFormData,
    updateField,
    errors,
    isSubmitting,
    validateWeight,
    validateDate,
    validateNote,
    handleSubmit,
    setFieldError,
    duplicateDate,
    isDuplicateForSelectedDate,
    isDuplicateToday,
    resetForm
  };
}
