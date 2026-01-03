import { useState, useEffect } from 'react'
import { usePasswordStrength } from '@/hooks/usePasswordStrength'
import Alert from './Alert'
import PasswordStrengthIndicator from './PasswordStrengthIndicator'
import ConsentAccordion, { type ConsentItemVM } from './ConsentAccordion'
import type { SignupFormVM, SignupFormErrors, SignupUIState, SignupRequest, SignupResponse, ApiError } from '@/types'
import { hashPasswordClient } from '@/lib/crypto'

interface SignupFormProps {
  token?: string // Opcjonalne dla publicznej rejestracji
  email?: string // Opcjonalne dla publicznej rejestracji
  expiresAt?: string | null
  mode?: 'invitation' | 'public' // Określa tryb formularza (domyślnie 'invitation')
}

/**
 * SignupForm Component
 *
 * Uniwersalny formularz rejestracji obsługujący 2 tryby:
 * - 'invitation': Rejestracja przez zaproszenie (email readonly, wymaga token)
 * - 'public': Publiczna rejestracja (email edytowalne, bez tokenu)
 */
export default function SignupForm({
  token,
  email: initialEmail = '',
  expiresAt,
  mode = 'invitation' // Domyślnie tryb zaproszenia dla wstecznej kompatybilności
}: SignupFormProps) {
  const isPublicMode = mode === 'public'
  const apiEndpoint = isPublicMode ? '/api/auth/public-signup' : '/api/auth/signup'

  // Form state
  const [form, setForm] = useState<SignupFormVM>({
    email: initialEmail,
    firstName: '',
    lastName: '',
    age: '',
    gender: '',
    password: '',
    confirmPassword: '',
    consents: getDefaultConsents(),
  })

  const [errors, setErrors] = useState<SignupFormErrors>({})
  const [ui, setUI] = useState<SignupUIState>({
    isLoading: false,
    isSubmitDisabled: true,
    serverError: null,
  })

  // Password strength hook
  const { score } = usePasswordStrength(form.password)

  // Update submit disabled state when form changes
  useEffect(() => {
    const hasRequiredFields =
      (isPublicMode ? form.email.trim() !== '' : true) && // Email wymagany tylko w trybie public
      form.firstName.trim() !== '' &&
      form.lastName.trim() !== '' &&
      form.password.length >= 8 &&
      form.confirmPassword.length >= 8

    const hasRequiredConsents =
      form.consents.find((c) => c.type === 'data_processing')?.accepted === true &&
      form.consents.find((c) => c.type === 'health_data')?.accepted === true

    setUI((prev) => ({
      ...prev,
      isSubmitDisabled: !hasRequiredFields || !hasRequiredConsents,
    }))
  }, [isPublicMode, form.email, form.firstName, form.lastName, form.password, form.confirmPassword, form.consents])

  // Focus first field with error when errors change
  useEffect(() => {
    const errorFields = Object.keys(errors)
    if (errorFields.length > 0) {
      const firstErrorField = errorFields[0]
      const element = document.getElementById(firstErrorField)
      if (element) {
        element.focus()
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, [errors])

  // Handle input changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))

    // Clear field error on change
    if (errors[name as keyof SignupFormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  // Handle consent changes
  const handleConsentsChange = (updatedConsents: ConsentItemVM[]) => {
    setForm((prev) => ({
      ...prev,
      consents: updatedConsents.map((c) => ({
        type: c.type,
        text: c.text,
        accepted: c.accepted,
      })),
    }))

    // Clear consents error on change
    if (errors.consents) {
      setErrors((prev) => ({ ...prev, consents: undefined }))
    }
  }

  // Handle confirmPassword blur - validate password match
  const handleConfirmPasswordBlur = () => {
    if (form.confirmPassword.length > 0) {
      if (form.confirmPassword.length < 8) {
        setErrors((prev) => ({ ...prev, confirmPassword: 'Hasło musi mieć co najmniej 8 znaków' }))
      } else if (form.password !== form.confirmPassword) {
        setErrors((prev) => ({ ...prev, confirmPassword: 'Podane hasła nie są zgodne' }))
      }
    }
  }

  // Validate form before submit
  const validateForm = (): boolean => {
    const newErrors: SignupFormErrors = {}

    // Email (tylko w trybie public - w trybie invitation jest readonly)
    if (isPublicMode) {
      if (!form.email.trim()) {
        newErrors.email = 'Email jest wymagany'
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        newErrors.email = 'Nieprawidłowy format adresu email'
      }
    }

    // First name
    if (!form.firstName.trim()) {
      newErrors.firstName = 'Imię jest wymagane'
    }

    // Last name
    if (!form.lastName.trim()) {
      newErrors.lastName = 'Nazwisko jest wymagane'
    }

    // Password
    if (form.password.length < 8) {
      newErrors.password = 'Hasło musi mieć co najmniej 8 znaków'
    }

    // Confirm Password
    if (form.confirmPassword.length < 8) {
      newErrors.confirmPassword = 'Hasło musi mieć co najmniej 8 znaków'
    } else if (form.password !== form.confirmPassword) {
      newErrors.confirmPassword = 'Podane hasła nie są zgodne'
    }

    // Age (optional, but if provided must be valid)
    if (form.age && form.age.trim() !== '') {
      const ageNum = parseInt(form.age, 10)
      if (isNaN(ageNum) || ageNum < 10 || ageNum > 120) {
        newErrors.age = 'Wiek musi być liczbą między 10 a 120'
      }
    }

    // Consents
    const hasDataProcessing = form.consents.find((c) => c.type === 'data_processing')?.accepted
    const hasHealthData = form.consents.find((c) => c.type === 'health_data')?.accepted

    if (!hasDataProcessing || !hasHealthData) {
      newErrors.consents = 'Musisz zaakceptować wymagane zgody RODO'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Clear previous errors
    setUI((prev) => ({ ...prev, serverError: null }))
    setErrors({})

    // Validate
    if (!validateForm()) {
      return
    }

    // Set loading state
    setUI((prev) => ({ ...prev, isLoading: true, isSubmitDisabled: true }))

    try {
      // Hash hasła przed wysłaniem (SHA-256)
      const passwordHash = await hashPasswordClient(form.password)

      // Build request payload
      const payload: any = {
        email: form.email,
        password: passwordHash, // SHA-256 hash (64 chars)
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        consents: form.consents,
      }

      // Dodaj invitationToken tylko w trybie invitation
      if (!isPublicMode && token) {
        payload.invitationToken = token
      }

      // Add optional fields
      if (form.age && form.age.trim() !== '') {
        payload.age = parseInt(form.age, 10)
      }
      if (form.gender) {
        payload.gender = form.gender as 'male' | 'female'
      }

      // Call API (endpoint zależy od trybu)
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (response.ok) {
        // Success - redirect to welcome page
        const data: SignupResponse = await response.json()
        window.location.href = '/waga/welcome'
      } else {
        // Handle errors
        const error: ApiError = await response.json()

        if (response.status === 400) {
          // Invalid/expired invitation or missing consents
          setUI((prev) => ({
            ...prev,
            serverError: error.message || 'Zaproszenie jest nieprawidłowe lub wygasło',
          }))
        } else if (response.status === 409) {
          // Email already registered
          setUI((prev) => ({
            ...prev,
            serverError: 'Konto z tym adresem e-mail już istnieje. Spróbuj się zalogować.',
          }))
        } else if (response.status === 422) {
          // Validation errors - map to fields
          setUI((prev) => ({
            ...prev,
            serverError: error.message || 'Nieprawidłowe dane formularza',
          }))
        } else {
          // Server error
          setUI((prev) => ({
            ...prev,
            serverError: 'Wystąpił błąd serwera. Spróbuj ponownie później.',
          }))
        }
      }
    } catch (error) {
      console.error('Signup error:', error)
      setUI((prev) => ({
        ...prev,
        serverError: 'Wystąpił nieoczekiwany błąd. Sprawdź połączenie i spróbuj ponownie.',
      }))
    } finally {
      setUI((prev) => ({ ...prev, isLoading: false }))
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 sm:p-8">
      {/* Server error alert */}
      {ui.serverError && (
        <div className="mb-6">
          <Alert
            variant="error"
            message={ui.serverError}
            onClose={() => setUI((prev) => ({ ...prev, serverError: null }))}
          />
        </div>
      )}

      {/* Invitation expiry info (tylko dla trybu invitation) */}
      {!isPublicMode && expiresAt && (
        <div className="mb-6 border rounded-lg p-4 flex items-start gap-3 bg-blue-50 border-blue-200 text-blue-800" role="alert">
          <div className="flex-shrink-0 text-blue-600">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">
              Zaproszenie ważne do: {new Date(expiresAt).toLocaleDateString('pl-PL', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-dark mb-2">
            Adres e-mail {isPublicMode && <span className="text-red-600">*</span>}
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={form.email}
            onChange={handleChange}
            readOnly={!isPublicMode} // Tylko w trybie public jest edytowalne
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none ${
              isPublicMode
                ? 'focus:ring-2 focus:ring-primary'
                : 'bg-gray-100 text-gray-600 cursor-not-allowed'
            } ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-600">
              {errors.email}
            </p>
          )}
        </div>

        {/* First Name */}
        <div>
          <label htmlFor="firstName" className="block text-sm font-medium text-neutral-dark mb-2">
            Imię <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            value={form.firstName}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.firstName ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-invalid={!!errors.firstName}
            aria-describedby={errors.firstName ? 'firstName-error' : undefined}
          />
          {errors.firstName && (
            <p id="firstName-error" className="mt-1 text-sm text-red-600">
              {errors.firstName}
            </p>
          )}
        </div>

        {/* Last Name */}
        <div>
          <label htmlFor="lastName" className="block text-sm font-medium text-neutral-dark mb-2">
            Nazwisko <span className="text-red-600">*</span>
          </label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            value={form.lastName}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.lastName ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-invalid={!!errors.lastName}
            aria-describedby={errors.lastName ? 'lastName-error' : undefined}
          />
          {errors.lastName && (
            <p id="lastName-error" className="mt-1 text-sm text-red-600">
              {errors.lastName}
            </p>
          )}
        </div>

        {/* Age (optional) */}
        <div>
          <label htmlFor="age" className="block text-sm font-medium text-neutral-dark mb-2">
            Wiek (opcjonalnie)
          </label>
          <input
            type="number"
            id="age"
            name="age"
            min="10"
            max="120"
            value={form.age}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.age ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-invalid={!!errors.age}
            aria-describedby={errors.age ? 'age-error' : undefined}
          />
          {errors.age && (
            <p id="age-error" className="mt-1 text-sm text-red-600">
              {errors.age}
            </p>
          )}
        </div>

        {/* Gender (optional) */}
        <div>
          <label htmlFor="gender" className="block text-sm font-medium text-neutral-dark mb-2">
            Płeć (opcjonalnie)
          </label>
          <select
            id="gender"
            name="gender"
            value={form.gender}
            onChange={handleChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">-- Wybierz --</option>
            <option value="male">Mężczyzna</option>
            <option value="female">Kobieta</option>
          </select>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-neutral-dark mb-2">
            Hasło <span className="text-red-600">*</span>
          </label>
          <input
            type="password"
            id="password"
            name="password"
            value={form.password}
            onChange={handleChange}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.password ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          {errors.password && (
            <p id="password-error" className="mt-1 text-sm text-red-600">
              {errors.password}
            </p>
          )}

          {/* Password strength indicator */}
          <PasswordStrengthIndicator password={form.password} />
        </div>

        {/* Confirm Password */}
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-dark mb-2">
            Powtórz hasło <span className="text-red-600">*</span>
          </label>
          <input
            type="password"
            id="confirmPassword"
            name="confirmPassword"
            value={form.confirmPassword}
            onChange={handleChange}
            onBlur={handleConfirmPasswordBlur}
            className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
            }`}
            aria-invalid={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
          />
          {errors.confirmPassword && (
            <p id="confirmPassword-error" className="mt-1 text-sm text-red-600">
              {errors.confirmPassword}
            </p>
          )}
        </div>

        {/* Consents */}
        <div>
          <ConsentAccordion
            items={form.consents.map((c) => ({
              type: c.type,
              text: c.text,
              accepted: c.accepted,
              required: c.type === 'data_processing' || c.type === 'health_data',
            }))}
            onChange={handleConsentsChange}
          />
          {errors.consents && (
            <p className="mt-2 text-sm text-red-600">{errors.consents}</p>
          )}
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={ui.isSubmitDisabled || ui.isLoading}
          className="w-full bg-primary text-white font-semibold py-3 px-6 rounded-lg hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-busy={ui.isLoading}
          aria-label={ui.isLoading ? 'Trwa tworzenie konta' : 'Utwórz konto'}
        >
          {ui.isLoading ? 'Tworzenie konta...' : 'Utwórz konto'}
        </button>

        {/* Helper text */}
        <p className="text-xs text-gray-600 text-center mt-4">
          Masz już konto?{' '}
          <a href="/auth/login" className="text-primary font-medium hover:underline">
            Zaloguj się
          </a>
        </p>
      </form>
    </div>
  )
}

/**
 * Default consents with placeholder text
 * In production, this should come from a config/database
 */
function getDefaultConsents(): Array<{ type: string; text: string; accepted: boolean }> {
  return [
    {
      type: 'data_processing',
      text: 'Wyrażam zgodę na przetwarzanie moich danych osobowych przez Paulina Maciak Dietoterapia w celu świadczenia usług dietetycznych oraz zarządzania kontem użytkownika zgodnie z Rozporządzeniem Parlamentu Europejskiego i Rady (UE) 2016/679 z dnia 27 kwietnia 2016 r. w sprawie ochrony osób fizycznych w związku z przetwarzaniem danych osobowych i w sprawie swobodnego przepływu takich danych (RODO).\n\nAdministratorem danych osobowych jest Paulina Maciak prowadząca działalność gospodarczą pod nazwą Paulina Maciak Dietoterapia.\n\nPrzetwarzane dane obejmują: imię, nazwisko, adres e-mail, wiek, płeć oraz dane kontaktowe niezbędne do świadczenia usług.\n\nDane będą przechowywane przez okres świadczenia usług oraz przez czas wymagany przepisami prawa.\n\nMam prawo do dostępu do swoich danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych oraz wniesienia sprzeciwu wobec przetwarzania. Przysługuje mi również prawo do cofnięcia zgody w dowolnym momencie bez wpływu na zgodność z prawem przetwarzania dokonanego przed jej cofnięciem.',
      accepted: false,
    },
    {
      type: 'health_data',
      text: 'Wyrażam zgodę na przetwarzanie moich danych dotyczących zdrowia (w tym danych o wadze, pomiarach ciała oraz informacji zdrowotnych zawartych w formularzach) przez Paulina Maciak Dietoterapia w celu świadczenia usług dietetycznych.\n\nDane zdrowotne są szczególną kategorią danych osobowych objętych wzmocnioną ochroną zgodnie z art. 9 RODO. Przetwarzanie tych danych jest niezbędne do świadczenia kompleksowych usług dietetycznych.\n\nPrzetwarzane dane zdrowotne obejmują: pomiary wagi, BMI, informacje o stanie zdrowia, chorobach, przyjmowanych lekach, alergiach pokarmowych oraz inne informacje medyczne podane w formularzach i podczas konsultacji.\n\nDane zdrowotne będą przetwarzane wyłącznie przez uprawniony personel i przechowywane w zabezpieczonych systemach. Dostęp do danych mają jedynie osoby bezpośrednio uczestniczące w świadczeniu usług dietetycznych.\n\nMam prawo do dostępu do swoich danych zdrowotnych, ich sprostowania, usunięcia, ograniczenia przetwarzania oraz wniesienia sprzeciwu wobec przetwarzania. Przysługuje mi również prawo do cofnięcia zgody w dowolnym momencie.',
      accepted: false,
    },
  ]
}
