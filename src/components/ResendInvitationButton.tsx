import { useState } from 'react'
import { toast } from 'react-hot-toast'
import ConfirmModal from './ui/ConfirmModal'
import type { InvitationListItemDTO, ResendInvitationResponse, ApiError } from '@/types'

interface ResendInvitationButtonProps {
  invitationId: string
  email: string
  onSuccess: (updated: InvitationListItemDTO) => void
}

/**
 * ResendInvitationButton - Przycisk do ponownego wysłania zaproszenia
 *
 * Flow:
 * 1. Kliknięcie → Otwórz modal potwierdzenia
 * 2. Potwierdzenie → POST /api/dietitian/invitations/:id/resend
 * 3. Sukces → Toast + wywołaj onSuccess z uaktualnionymi danymi
 * 4. Błąd → Toast z komunikatem
 *
 * Features:
 * - Modal potwierdzenia (ConfirmModal)
 * - Loading state podczas żądania
 * - Obsługa błędów (401, 403, 404, 500)
 * - Toast notifications
 */
export default function ResendInvitationButton({
  invitationId,
  email,
  onSuccess,
}: ResendInvitationButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleOpenModal = () => {
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleConfirmResend = async () => {
    setIsSubmitting(true)
    setIsModalOpen(false)

    try {
      const response = await fetch(`/api/dietitian/invitations/${invitationId}/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        // Success (200)
        const result = data as ResendInvitationResponse
        toast.success(`Zaproszenie wysłane ponownie na ${email}`)

        // Wywołaj callback z uaktualnionymi danymi
        onSuccess(result.invitation)
      } else if (response.status === 401) {
        // Unauthorized
        toast.error('Brak autoryzacji. Zaloguj się ponownie.')
        setTimeout(() => {
          window.location.href = '/logowanie'
        }, 2000)
      } else if (response.status === 403) {
        // Forbidden
        toast.error('Brak uprawnień do tego zaproszenia')
      } else if (response.status === 404) {
        // Not found
        toast.error('Zaproszenie nie zostało znalezione')
      } else if (response.status === 500) {
        const apiError = data as ApiError
        if (apiError.error === 'email_send_failed') {
          toast.error('Nie udało się wysłać emaila. Spróbuj ponownie.')
        } else {
          toast.error('Wystąpił błąd serwera. Spróbuj ponownie.')
        }
      } else {
        // Other errors
        toast.error('Wystąpił nieoczekiwany błąd')
      }
    } catch (error) {
      console.error('Resend invitation error:', error)
      toast.error('Błąd połączenia z serwerem')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      {/* Przycisk "Wyślij ponownie" */}
      <button
        type="button"
        onClick={handleOpenModal}
        disabled={isSubmitting}
        className={`
          inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md
          transition-colors duration-200
          focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary
          ${
            isSubmitting
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-primary/10 text-primary hover:bg-primary/20'
          }
        `}
        aria-label={`Wyślij ponownie zaproszenie dla ${email}`}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <svg
              className="animate-spin -ml-0.5 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Wysyłanie...
          </>
        ) : (
          <>
            <svg
              className="-ml-0.5 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Wyślij ponownie
          </>
        )}
      </button>

      {/* Modal potwierdzenia */}
      <ConfirmModal
        isOpen={isModalOpen}
        title="Ponownie wysłać zaproszenie?"
        message={`Poprzednie zaproszenie zostanie unieważnione, a na adres ${email} zostanie wysłany nowy link rejestracyjny ważny przez 7 dni.`}
        confirmText="Wyślij ponownie"
        cancelText="Anuluj"
        onConfirm={handleConfirmResend}
        onCancel={handleCloseModal}
        variant="info"
      />
    </>
  )
}
