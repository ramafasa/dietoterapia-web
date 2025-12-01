import { useState } from 'react'
import { passwordResetRequestSchema, type PasswordResetRequestInput } from '@/schemas/auth'
import toast from 'react-hot-toast'

export default function PasswordResetRequestForm() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [formData, setFormData] = useState<PasswordResetRequestInput>({ email: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof PasswordResetRequestInput, string>>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    try {
      const validated = passwordResetRequestSchema.parse(formData)

      // Always show success after validation to prevent email enumeration
      setSuccess(true)

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validated),
        })

        const data = await res.json()

        if (res.ok) {
          toast.success('Link do resetu hasła został wysłany')
        } else {
          // Log error silently, but still show success to user
          console.error('Password reset request failed:', data)
        }
      } catch (networkError) {
        // Network error - log silently but still show success
        console.error('Network error during password reset:', networkError)
      }
    } catch (error: any) {
      if (error.errors) {
        const fieldErrors: Partial<Record<keyof PasswordResetRequestInput, string>> = {}
        error.errors.forEach((err: any) => {
          fieldErrors[err.path[0] as keyof PasswordResetRequestInput] = err.message
        })
        setErrors(fieldErrors)
      } else {
        toast.error('Wystąpił błąd')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-8" role="status" aria-live="polite">
        <div className="text-green-600 text-xl font-semibold mb-4">
          Link został wysłany
        </div>
        <p className="text-neutral-dark mb-6">
          Jeśli konto z podanym adresem email istnieje, wysłaliśmy link do resetu hasła.
        </p>
        <a href="/logowanie" className="text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded">
          Wróć do logowania
        </a>
      </div>
    )
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
          value={formData.email}
          onChange={(e) => setFormData({ email: e.target.value })}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.email ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={loading}
          placeholder="twoj@email.pl"
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          required
        />
        {errors.email && (
          <p id="email-error" className="text-red-500 text-sm mt-1" role="alert">
            {errors.email}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50"
      >
        {loading ? 'Wysyłanie...' : 'Wyślij link do resetu'}
      </button>

      <div className="text-center">
        <a href="/logowanie" className="text-sm text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded">
          Wróć do logowania
        </a>
      </div>
    </form>
  )
}
