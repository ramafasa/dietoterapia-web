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

      const res = await fetch('/api/auth/password-reset-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Wystąpił błąd')
        return
      }

      setSuccess(true)
      toast.success(data.message)
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
      <div className="text-center py-8">
        <div className="text-green-600 text-xl font-semibold mb-4">
          Link został wysłany
        </div>
        <p className="text-neutral-dark mb-6">
          Jeśli konto z podanym adresem email istnieje, wysłaliśmy link do resetu hasła.
        </p>
        <a href="/logowanie" className="text-primary hover:underline">
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
        />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50"
      >
        {loading ? 'Wysyłanie...' : 'Wyślij link do resetu'}
      </button>

      <div className="text-center">
        <a href="/logowanie" className="text-sm text-primary hover:underline">
          Wróć do logowania
        </a>
      </div>
    </form>
  )
}
