import { useState } from 'react';
import toast from 'react-hot-toast';
import { consultationSchema, type ConsultationFormData } from '../schemas/consultation';

export default function ConsultationForm() {
  const [formData, setFormData] = useState<ConsultationFormData>({
    consultationType: '' as any,
    visitType: '' as any,
    fullName: '',
    email: '',
    phone: '',
    preferredDate: '',
    additionalInfo: '',
    gdprConsent: false,
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ConsultationFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const newValue = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    setFormData(prev => ({
      ...prev,
      [name]: newValue,
    }));

    // Clear error for this field when user starts typing
    if (errors[name as keyof ConsultationFormData]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined,
      }));
    }

    // Update character count for additionalInfo
    if (name === 'additionalInfo') {
      setCharCount(value.length);
    }
  };

  const validateField = (name: keyof ConsultationFormData, value: any) => {
    try {
      const fieldSchema = consultationSchema.shape[name];
      fieldSchema.parse(value);
      setErrors(prev => ({ ...prev, [name]: undefined }));
      return true;
    } catch (error: any) {
      if (error.errors && error.errors[0]) {
        setErrors(prev => ({ ...prev, [name]: error.errors[0].message }));
      }
      return false;
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'email' || name === 'phone') {
      validateField(name as keyof ConsultationFormData, value);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate entire form
      const validatedData = consultationSchema.parse(formData);

      // Send to API
      const response = await fetch('/api/consultation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validatedData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Wystąpił błąd podczas wysyłania formularza');
      }

      // Success
      toast.success('Dziękujemy! Twoje zapytanie zostało wysłane. Paulina odpowie w ciągu 24 godzin.');

      // Reset form
      setFormData({
        consultationType: '' as any,
        visitType: '' as any,
        fullName: '',
        email: '',
        phone: '',
        preferredDate: '',
        additionalInfo: '',
        gdprConsent: false,
      });
      setCharCount(0);
      setErrors({});
    } catch (error: any) {
      if (error.errors) {
        // Zod validation errors
        const newErrors: Partial<Record<keyof ConsultationFormData, string>> = {};
        error.errors.forEach((err: any) => {
          if (err.path && err.path[0]) {
            newErrors[err.path[0] as keyof ConsultationFormData] = err.message;
          }
        });
        setErrors(newErrors);
        toast.error('Sprawdź poprawność wypełnienia formularza');
      } else {
        toast.error('Ups, coś poszło nie tak. Spróbuj ponownie lub napisz na dietoterapia@paulinamaciak.pl');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="bg-neutral-light p-6 md:p-8 rounded-2xl space-y-6">
        {/* Consultation Type */}
        <div>
          <label htmlFor="consultationType" className="block text-sm font-semibold text-neutral-dark mb-2">
            Typ konsultacji <span className="text-red-600">*</span>
          </label>
          <select
            id="consultationType"
            name="consultationType"
            value={formData.consultationType}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.consultationType ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">Wybierz typ konsultacji</option>
            <option value="diagnostyczna">Konsultacja diagnostyczna (60-90 min - 350 zł)</option>
            <option value="kontrolna">Konsultacja kontrolna (30-60 min - 150 zł)</option>
            <option value="kompleksowa">Konsultacja kompleksowa (90-120 min - 600 zł)</option>
          </select>
          {errors.consultationType && (
            <p className="text-red-600 text-sm mt-1">{errors.consultationType}</p>
          )}
        </div>

        {/* Visit Type */}
        <div>
          <label htmlFor="visitType" className="block text-sm font-semibold text-neutral-dark mb-2">
            Rodzaj wizyty <span className="text-red-600">*</span>
          </label>
          <select
            id="visitType"
            name="visitType"
            value={formData.visitType}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.visitType ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <option value="">Wybierz rodzaj wizyty</option>
            <option value="online">Spotkanie online</option>
            <option value="gabinet">Spotkanie w gabinecie (Gaj, powiat brzeziński, woj. łódzkie)</option>
          </select>
          {errors.visitType && (
            <p className="text-red-600 text-sm mt-1">{errors.visitType}</p>
          )}
        </div>

        {/* Full Name */}
        <div>
          <label htmlFor="fullName" className="block text-sm font-semibold text-neutral-dark mb-2">
            Imię i nazwisko <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="fullName"
            name="fullName"
            value={formData.fullName}
            onChange={handleChange}
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.fullName ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed`}
          />
          {errors.fullName && <p className="text-red-600 text-sm mt-1">{errors.fullName}</p>}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-semibold text-neutral-dark mb-2">
            Email <span className="text-red-600">*</span>
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.email ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed`}
          />
          {errors.email && <p className="text-red-600 text-sm mt-1">{errors.email}</p>}
        </div>

        {/* Phone */}
        <div>
          <label htmlFor="phone" className="block text-sm font-semibold text-neutral-dark mb-2">
            Telefon <span className="text-red-600">*</span>
          </label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="+48 XXX XXX XXX"
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.phone ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed`}
          />
          {errors.phone && <p className="text-red-600 text-sm mt-1">{errors.phone}</p>}
        </div>

        {/* Preferred Date */}
        <div>
          <label htmlFor="preferredDate" className="block text-sm font-semibold text-neutral-dark mb-2">
            Preferowany termin (opcjonalnie)
          </label>
          <textarea
            id="preferredDate"
            name="preferredDate"
            value={formData.preferredDate}
            onChange={handleChange}
            rows={3}
            placeholder="np. poniedziałek 10:00 lub wtorek po 15:00"
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.preferredDate ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none`}
          />
          {errors.preferredDate && <p className="text-red-600 text-sm mt-1">{errors.preferredDate}</p>}
        </div>

        {/* Additional Info */}
        <div>
          <label htmlFor="additionalInfo" className="block text-sm font-semibold text-neutral-dark mb-2">
            Dodatkowe informacje (opcjonalnie)
          </label>
          <textarea
            id="additionalInfo"
            name="additionalInfo"
            value={formData.additionalInfo}
            onChange={handleChange}
            rows={5}
            placeholder="Informacje o problemach zdrowotnych, celach"
            disabled={isSubmitting}
            className={`w-full px-4 py-3 rounded-lg border ${
              errors.additionalInfo ? 'border-red-600' : 'border-gray-300'
            } focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none`}
          />
          <div className="flex justify-between items-center mt-1">
            {errors.additionalInfo && <p className="text-red-600 text-sm">{errors.additionalInfo}</p>}
            <p className={`text-sm ml-auto ${charCount > 500 ? 'text-red-600' : 'text-gray-500'}`}>
              {charCount}/500
            </p>
          </div>
        </div>

        {/* GDPR Consent */}
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="gdprConsent"
              checked={formData.gdprConsent}
              onChange={handleChange}
              disabled={isSubmitting}
              className="mt-1 w-5 h-5 text-primary border-gray-300 rounded focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="text-sm text-neutral-dark">
              Akceptuję{' '}
              <a
                href="/polityka-prywatnosci"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-semibold"
              >
                politykę prywatności
              </a>{' '}
              i wyrażam zgodę na przetwarzanie moich danych osobowych w celu umówienia konsultacji.{' '}
              <span className="text-red-600">*</span>
            </span>
          </label>
          {errors.gdprConsent && <p className="text-red-600 text-sm mt-1">{errors.gdprConsent}</p>}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg"
        >
          {isSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Wysyłanie...
            </span>
          ) : (
            'Wyślij zapytanie'
          )}
        </button>
      </form>
    </div>
  );
}
