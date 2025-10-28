import { useState } from 'react'
import { loginSchema, type LoginInput } from '@/schemas/auth'
import toast from 'react-hot-toast'

export default function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<LoginInput>({ email: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<keyof LoginInput, string>>>({})

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})

    try {
      const validated = loginSchema.parse(formData)

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validated),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Wystąpił błąd')
        return
      }

      toast.success('Zalogowano pomyślnie')
      window.location.href = data.redirectUrl
    } catch (error: any) {
      if (error.errors) {
        const fieldErrors: Partial<Record<keyof LoginInput, string>> = {}
        error.errors.forEach((err: any) => {
          fieldErrors[err.path[0] as keyof LoginInput] = err.message
        })
        setErrors(fieldErrors)
      } else {
        toast.error('Wystąpił błąd')
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
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
            errors.email ? 'border-red-500' : 'border-gray-300'
          }`}
          disabled={loading}
        />
        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-neutral-dark mb-2">
          Hasło
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
