import { useState } from 'react'
import toast from 'react-hot-toast'

interface LogoutButtonProps {
  className?: string
  isMobile?: boolean
}

/**
 * Przycisk wylogowania z obsługą API, toast notifications i przekierowania
 *
 * Funkcjonalności:
 * - Wywołuje POST /api/auth/logout
 * - Loading state podczas wylogowywania
 * - Toast success po pomyślnym wylogowaniu
 * - Toast error w przypadku błędu
 * - Przekierowanie na "/" po sukcesie
 */
export default function LogoutButton({ className = '', isMobile = false }: LogoutButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleLogout = async () => {
    setIsLoading(true)

    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include' // Wysyłaj cookies
      })

      if (!response.ok) {
        throw new Error('Błąd wylogowania')
      }

      // Toast success
      toast.success('Zostałeś pomyślnie wylogowany')

      // Redirect z opóźnieniem (żeby toast był widoczny)
      setTimeout(() => {
        window.location.href = '/'
      }, 1000)
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('Nie udało się wylogować. Spróbuj ponownie.')
      setIsLoading(false) // Przywróć stan przycisku
    }
  }

  // Desktop version - kompaktowy przycisk z ikoną i tekstem
  if (!isMobile) {
    return (
      <button
        onClick={handleLogout}
        disabled={isLoading}
        className={`
          inline-flex
          items-center
          space-x-2
          px-4
          py-2
          font-body
          text-neutral-dark
          hover:text-primary
          transition-colors
          rounded-lg
          hover:bg-neutral-light
          disabled:opacity-50
          disabled:cursor-not-allowed
          ${className}
        `}
        aria-label="Wyloguj się"
      >
        {/* Ikona logout (Heroicons - arrow-right-on-rectangle) */}
        <svg
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
          />
        </svg>

        {/* Tekst */}
        <span>{isLoading ? 'Wylogowywanie...' : 'Wyloguj'}</span>
      </button>
    )
  }

  // Mobile version - pełna szerokość z wyraźnym stylem
  return (
    <button
      onClick={handleLogout}
      disabled={isLoading}
      className={`
        w-full
        flex
        items-center
        justify-center
        space-x-2
        px-6
        py-3
        font-body
        font-semibold
        text-neutral-dark
        bg-neutral-light
        hover:bg-primary
        hover:text-white
        transition-colors
        rounded-lg
        disabled:opacity-50
        disabled:cursor-not-allowed
        ${className}
      `}
      aria-label="Wyloguj się"
    >
      {/* Ikona logout */}
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
        />
      </svg>

      {/* Tekst */}
      <span>{isLoading ? 'Wylogowywanie...' : 'Wyloguj'}</span>
    </button>
  )
}
