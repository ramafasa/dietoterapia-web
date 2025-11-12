import { useState, useRef, useEffect } from 'react'
import { loginSchema, type LoginInput } from '@/schemas/auth'
import type { LoginResponse, ApiError } from '@/types'
import toast from 'react-hot-toast'

// Props for LoginForm component (extensibility)
export interface LoginFormProps {
  // Override default redirect URLs by role
  roleRedirects?: {
    patient: string
    dietitian: string
  }
  // Custom navigation hook (useful for tests/e2e)
  onSuccessNavigate?: (url: string) => void
}

export default function LoginForm({
  roleRedirects = {
    patient: '/pacjent/waga',
    dietitian: '/dietetyk/pacjenci',
  },
  onSuccessNavigate,
}: LoginFormProps = {}) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<LoginInput>({ email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({})
  const [showPassword, setShowPassword] = useState(false)
  const emailInputRef = useRef<HTMLInputElement>(null)

  // Autofocus on email input after mount (a11y + UX)
  useEffect(() => {
    emailInputRef.current?.focus()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    try {
      // Client-side validation with Zod
      const validated = loginSchema.parse(formData)

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      })

      const data = await res.json()

      if (!res.ok) {
        // Handle ApiError response based on status code
        const apiError = data as ApiError

        // 401 Unauthorized - Invalid credentials or inactive user
        if (res.status === 401) {
          toast.error('Nieprawidłowy email lub hasło')
          // Clear password field for security (user must re-enter)
          setFormData((prev) => ({ ...prev, password: '' }))
          return
        }

        // 429 Too Many Requests - Rate limit (5 attempts/15min)
        if (res.status === 429) {
          // Try to extract lockedUntil timestamp from message (format: HH:MM or HH:MM:SS)
          const lockedUntilMatch = apiError.message.match(/do (\d{2}:\d{2}(?::\d{2})?)/)
          const lockedUntilTime = lockedUntilMatch ? lockedUntilMatch[1] : null

          const message = lockedUntilTime
            ? `Konto zablokowane do godziny ${lockedUntilTime} z powodu zbyt wielu nieudanych prób logowania.`
            : 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie później.'

          toast.error(message, { duration: 6000 })
          return
        }

        // 422 Unprocessable Entity - Validation error
        if (res.status === 422) {
          // Map validation errors to form fields
          const fieldErrors: Partial<Record<keyof LoginInput, string>> = {}

          // Check if error contains field-specific info
          if (apiError.message.toLowerCase().includes('email')) {
            fieldErrors.email = 'Nieprawidłowy format adresu email'
          }
          if (apiError.message.toLowerCase().includes('password') || apiError.message.toLowerCase().includes('hasło')) {
            fieldErrors.password = 'Hasło jest wymagane'
          }

          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors)
          } else {
            toast.error(apiError.message || 'Dane formularza są nieprawidłowe')
          }
          return
        }

        // 500 Internal Server Error - Generic server error
        if (res.status === 500) {
          toast.error('Wystąpił błąd serwera. Spróbuj ponownie.')
          return
        }

        // Fallback for other errors
        toast.error(apiError.message || apiError.error || 'Wystąpił błąd')
        return
      }

      // Success - Handle LoginResponse
      const loginResponse = data as LoginResponse
      toast.success('Zalogowano pomyślnie')

      // Determine redirect URL based on role
      const redirectUrl = loginResponse.user.role === 'dietitian'
        ? roleRedirects.dietitian
        : roleRedirects.patient

      // Use custom navigation hook if provided (for tests), otherwise default window.location
      if (onSuccessNavigate) {
        onSuccessNavigate(redirectUrl)
      } else {
        window.location.href = redirectUrl
      }
    } catch (error: any) {
      // Handle Zod validation errors (client-side)
      if (error.errors) {
        const fieldErrors: Partial<Record<keyof LoginInput, string>> = {}
        error.errors.forEach((err: any) => {
          fieldErrors[err.path[0] as keyof LoginInput] = err.message
        })
        setErrors(fieldErrors)
        toast.error('Popraw błędy w formularzu')
      } else if (error instanceof TypeError && error.message.includes('fetch')) {
        // Network error (no connection)
        toast.error('Błąd połączenia. Sprawdź połączenie internetowe.')
      } else {
        // Unknown error
        toast.error('Wystąpił nieoczekiwany błąd')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-neutral-dark mb-2">
          Adres email
        </label>
        <input
          type="email"
          id="email"
          ref={emailInputRef}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.email ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={loading}
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
        />
        {errors.email && (
          <p id="email-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.email}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-dark mb-2">
          Hasło
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.password ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-dark hover:text-primary transition"
            aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
            aria-pressed={showPassword}
            disabled={loading}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>
        </div>
        {errors.password && (
          <p id="password-error" role="alert" className="text-red-500 text-sm mt-1">
            {errors.password}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50"
      >
        {loading ? 'Logowanie...' : 'Zaloguj się'}
      </button>

      <div className="text-center">
        <a href="/reset-hasla" className="text-sm text-primary hover:underline">
          Zapomniałeś hasła?
        </a>
      </div>
    </form>
  )
}
