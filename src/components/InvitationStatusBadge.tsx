interface InvitationStatusBadgeProps {
  status: 'pending' | 'used' | 'expired'
}

/**
 * InvitationStatusBadge - Odznaka statusu zaproszenia
 *
 * Wyświetla kolorową odznakę z polskim opisem statusu:
 * - pending: niebieski - "Oczekujące"
 * - used: zielony - "Użyte"
 * - expired: szary - "Wygasłe"
 */
export default function InvitationStatusBadge({ status }: InvitationStatusBadgeProps) {
  const statusConfig = {
    pending: {
      label: 'Oczekujące',
      className: 'bg-blue-100 text-blue-800 border-blue-200',
      ariaLabel: 'Status: Oczekujące - zaproszenie nie zostało jeszcze użyte',
    },
    used: {
      label: 'Użyte',
      className: 'bg-green-100 text-green-800 border-green-200',
      ariaLabel: 'Status: Użyte - zaproszenie zostało wykorzystane do rejestracji',
    },
    expired: {
      label: 'Wygasłe',
      className: 'bg-gray-100 text-gray-800 border-gray-200',
      ariaLabel: 'Status: Wygasłe - zaproszenie przekroczyło termin ważności',
    },
  }

  const config = statusConfig[status]

  return (
    <span
      className={`
        inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border
        ${config.className}
      `}
      aria-label={config.ariaLabel}
      role="status"
    >
      {config.label}
    </span>
  )
}
