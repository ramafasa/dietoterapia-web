import { useState, useEffect } from 'react'
import { passwordResetConfirmSchema, type PasswordResetConfirmInput } from '@/schemas/auth'
import toast from 'react-hot-toast'
import type { ApiError, ResetPasswordResponse } from '@/types'
import PasswordStrengthIndicator from './PasswordStrengthIndicator'
import Alert from './Alert'
import { usePasswordStrength } from '@/hooks/usePasswordStrength'
import { isZodError } from '@/utils/type-guards'

interface PasswordResetConfirmFormProps {
  token: string
}

export default function PasswordResetConfirmForm({ token }: PasswordResetConfirmFormProps) {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState<PasswordResetConfirmInput>({
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordResetConfirmInput, string>>>({})
  const [apiError, setApiError] = useState<{ message: string; type: 'invalid_token' | 'validation' | 'server' } | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { score, rules } = usePasswordStrength(formData.password)

  // Live validation for confirmPassword matching
  useEffect(() => {
    if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
      setErrors((prev) => ({ ...prev, confirmPassword: 'Hasła muszą być identyczne' }))
    } else {
      setErrors((prev) => {
        const { confirmPassword, ...rest } = prev
        return rest
      })
    }
  }, [formData.password, formData.confirmPassword])

  // Check if minimum password requirements are met (for submit button)
  const isPasswordValid = () => {
    const requiredRules = rules.slice(0, 4) // first 4 rules are required
    return requiredRules.every((rule) => rule.satisfied)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})
    setApiError(null)

    try {
      // Client-side validation (for confirmPassword matching)
      const validated = passwordResetConfirmSchema.parse(formData)

      // Call new API endpoint with newPassword field (not confirmPassword)
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          newPassword: validated.password,
        }),
      })

      const data: ResetPasswordResponse | ApiError = await res.json()

      if (!res.ok) {
        // Handle structured ApiError response
        const errorData = data as ApiError

        // Map error types
        if (res.status === 400 && errorData.error === 'invalid_token') {
          setApiError({
            message: 'Token nieprawidłowy lub wygasł. Poproś o nowy link do resetu hasła.',
            type: 'invalid_token',
          })
        } else if (res.status === 422) {
          setApiError({
            message: errorData.message || 'Hasło nie spełnia wymagań bezpieczeństwa.',
            type: 'validation',
          })
        } else {
          setApiError({
            message: 'Nieoczekiwany błąd serwera. Spróbuj ponownie później.',
            type: 'server',
          })
        }
        return
      }

      setSuccess(true)
      toast.success((data as ResetPasswordResponse).message)

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/logowanie'
      }, 2000)
    } catch (error: unknown) {
      if (isZodError(error)) {
        // Handle Zod validation errors
        const fieldErrors: Partial<Record<keyof PasswordResetConfirmInput, string>> = {}
        error.errors.forEach((err) => {
          fieldErrors[err.path[0] as keyof PasswordResetConfirmInput] = err.message
        })
        setErrors(fieldErrors)
      } else {
        setApiError({
          message: 'Błąd połączenia. Sprawdź swoje połączenie internetowe.',
          type: 'server',
        })
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="text-green-600 text-xl font-semibold mb-4">
          Hasło zostało zmienione
        </div>
        <p className="text-neutral-dark">
          Za chwilę zostaniesz przekierowany do strony logowania...
        </p>
      </div>
    )
  }

  // Check if form can be submitted
  const canSubmit = isPasswordValid() && formData.password === formData.confirmPassword && !loading

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* API Error Alert */}
      {apiError && (
        <Alert
          variant="error"
          message={apiError.message}
          onClose={() => setApiError(null)}
          actionLabel={apiError.type === 'invalid_token' ? 'Wyślij ponownie link' : undefined}
          onAction={apiError.type === 'invalid_token' ? () => (window.location.href = '/reset-hasla') : undefined}
        />
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-dark mb-2">
          Nowe hasło
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
            aria-label="Nowe hasło"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary rounded"
            aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}

        <PasswordStrengthIndicator password={formData.password} />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-dark mb-2">
          Potwierdź hasło
        </label>
        <div className="relative">
          <input
            type={showConfirmPassword ? 'text' : 'password'}
            id="confirmPassword"
            value={formData.confirmPassword}
            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
            className={`w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
              errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
            }`}
            disabled={loading}
            aria-label="Potwierdź hasło"
          />
          <button
            type="button"
            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary rounded"
            aria-label={showConfirmPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            {showConfirmPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
        {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Zmień hasło"
      >
        {loading ? 'Zapisywanie...' : 'Zmień hasło'}
      </button>
    </form>
  )
}
