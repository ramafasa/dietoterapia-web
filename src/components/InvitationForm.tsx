import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { z } from 'zod'
import Alert from './Alert'
import type {
  InvitationFormData,
  InvitationFormErrors,
  CreateInvitationRequest,
  CreateInvitationResponse
} from '@/types'

// Validation schema using Zod
const invitationSchema = z.object({
  email: z
    .string()
    .min(1, 'Adres e-mail jest wymagany')
    .email('Podaj poprawny adres e-mail')
    .trim()
    .toLowerCase(),
})

interface InvitationFormProps {
  onSuccess?: (invitation: CreateInvitationResponse['invitation']) => void
}

/**
 * InvitationForm component for sending patient invitations
 * - Validates email input with Zod
 * - Sends POST /api/dietitian/invitations
 * - Shows success/error feedback via toasts and alerts
 * - Handles all error states (401, 403, 400, 409, 500)
 */
export default function InvitationForm({ onSuccess }: InvitationFormProps) {
  const [formData, setFormData] = useState<InvitationFormData>({ email: '' })
  const [errors, setErrors] = useState<InvitationFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [serverMessage, setServerMessage] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))

    // Clear errors when user starts typing
    if (errors.email) {
      setErrors((prev) => ({ ...prev, email: undefined }))
    }
    if (serverMessage) {
      setServerMessage(null)
    }
  }

  const validateForm = (): boolean => {
    try {
      invitationSchema.parse(formData)
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: InvitationFormErrors = {}
        error.errors.forEach((err) => {
          if (err.path[0] === 'email') {
            fieldErrors.email = err.message
          }
        })
        setErrors(fieldErrors)
      }
      return false
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Clear previous messages
    setServerMessage(null)

    // Validate form
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      const validatedData = invitationSchema.parse(formData)
      const requestBody: CreateInvitationRequest = {
        email: validatedData.email,
      }

      const response = await fetch('/api/dietitian/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      const data = await response.json()

      // Handle different status codes
      if (response.ok) {
        // Success (201)
        const result = data as CreateInvitationResponse
        toast.success(`Zaproszenie wysłane na ${result.invitation.email}`)

        // Reset form
        setFormData({ email: '' })
        setErrors({})

        // Call onSuccess callback
        if (onSuccess) {
          onSuccess(result.invitation)
        }
      } else if (response.status === 401) {
        // Unauthorized - redirect to login
        setServerMessage('Brak autoryzacji. Nastąpi przekierowanie do logowania...')
        setTimeout(() => {
          window.location.href = '/logowanie'
        }, 2000)
      } else if (response.status === 403) {
        // Forbidden - wrong role
        setServerMessage('Brak uprawnień. Tylko dietetyk może wysyłać zaproszenia.')
      } else if (response.status === 400) {
        // Validation error
        setErrors({ submit: 'Nieprawidłowe dane wejściowe' })
        toast.error('Nieprawidłowe dane wejściowe')
      } else if (response.status === 409) {
        // Email already exists
        setErrors({ email: 'Ten adres e-mail jest już zarejestrowany' })
        toast.error('Ten adres e-mail jest już zarejestrowany')
      } else if (response.status === 500 && data.error === 'email_send_failed') {
        // Email send failed
        setServerMessage(
          'Zaproszenie utworzono, ale nie udało się wysłać e-maila. Sprawdź konfigurację SMTP lub spróbuj ponownie.'
        )
        toast.error('Nie udało się wysłać e-maila')
      } else {
        // Other server errors
        setErrors({ submit: 'Wystąpił nieoczekiwany błąd serwera' })
        toast.error('Wystąpił nieoczekiwany błąd serwera')
      }
    } catch (error) {
      // Network error or unexpected error
      console.error('Invitation form error:', error)
      setErrors({ submit: 'Błąd połączenia. Sprawdź połączenie z internetem.' })
      toast.error('Błąd połączenia z serwerem')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit(e as unknown as React.FormEvent)
    }
  }

  return (
    <div>
      <h2 className="text-xl font-heading font-semibold text-neutral-dark mb-4">
        Wyślij zaproszenie
      </h2>

      {/* Server message alert */}
      {serverMessage && (
        <div className="mb-4">
          <Alert
            variant="warning"
            message={serverMessage}
            onClose={() => setServerMessage(null)}
          />
        </div>
      )}

      {/* General submit error */}
      {errors.submit && (
        <div className="mb-4">
          <Alert
            variant="error"
            message={errors.submit}
            onClose={() => setErrors((prev) => ({ ...prev, submit: undefined }))}
          />
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email field */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-neutral-dark mb-2"
          >
            Adres e-mail pacjenta
          </label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            className={`
              w-full px-4 py-2 border rounded-lg
              focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
              disabled:bg-gray-100 disabled:cursor-not-allowed
              ${errors.email ? 'border-red-500' : 'border-gray-300'}
            `}
            placeholder="pacjent@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : 'email-help'}
          />

          {/* Field error message */}
          {errors.email && (
            <p id="email-error" className="mt-1 text-sm text-red-600">
              {errors.email}
            </p>
          )}

          {/* Help text */}
          {!errors.email && (
            <p id="email-help" className="mt-1 text-sm text-neutral-dark/60">
              Link rejestracyjny będzie ważny przez 7 dni. Pacjent otrzyma e-mail z unikalnym linkiem do utworzenia konta.
            </p>
          )}
        </div>

        {/* Submit button */}
        <div>
          <button
            type="submit"
            disabled={isSubmitting}
            className={`
              w-full px-6 py-3 rounded-lg font-semibold
              transition-colors duration-200
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
              ${
                isSubmitting
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-primary text-white hover:bg-primary/90'
              }
            `}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Wysyłanie...' : 'Wyślij zaproszenie'}
          </button>
        </div>
      </form>
    </div>
  )
}
