import { useState } from 'react'
import { passwordResetConfirmSchema, type PasswordResetConfirmInput } from '@/schemas/auth'
import toast from 'react-hot-toast'
import type { ApiError, ResetPasswordResponse } from '@/types'

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

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
        toast.error(errorData.message || 'Wystąpił błąd')
        return
      }

      setSuccess(true)
      toast.success((data as ResetPasswordResponse).message)

      // Redirect to login after 2 seconds
      setTimeout(() => {
        window.location.href = '/logowanie'
      }, 2000)
    } catch (error: any) {
      if (error.errors) {
        // Handle Zod validation errors
        const fieldErrors: Partial<Record<keyof PasswordResetConfirmInput, string>> = {}
        error.errors.forEach((err: any) => {
          fieldErrors[err.path[0] as keyof PasswordResetConfirmInput] = err.message
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
          Hasło zostało zmienione
        </div>
        <p className="text-neutral-dark">
          Za chwilę zostaniesz przekierowany do strony logowania...
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-dark mb-2">
          Nowe hasło
        </label>
        <input
          type="password"
          id="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.password ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={loading}
        />
        {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
        <p className="text-xs text-gray-500 mt-1">
          Min. 8 znaków, wielka i mała litera, cyfra
        </p>
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-dark mb-2">
          Potwierdź hasło
        </label>
        <input
          type="password"
          id="confirmPassword"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={loading}
        />
        {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-primary/90 transition disabled:opacity-50"
      >
        {loading ? 'Zapisywanie...' : 'Zmień hasło'}
      </button>
    </form>
  )
}
