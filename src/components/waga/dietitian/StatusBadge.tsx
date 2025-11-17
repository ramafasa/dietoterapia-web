interface StatusBadgeProps {
  status: 'active' | 'paused' | 'ended' | null
  onClick?: () => void
}

/**
 * Status Badge
 * Displays patient status with color coding
 * Optional onClick handler for interactive badge (opens change status modal)
 */
export default function StatusBadge({ status, onClick }: StatusBadgeProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
        <span className="w-2 h-2 rounded-full bg-gray-400" aria-hidden="true" />
        Nieznany
      </span>
    )
  }

  const statusConfig = {
    active: {
      label: 'Aktywny',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
      dotColor: 'bg-green-500',
    },
    paused: {
      label: 'Wstrzymany',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
      dotColor: 'bg-yellow-500',
    },
    ended: {
      label: 'Zakończony',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
      dotColor: 'bg-red-500',
    },
  }

  const config = statusConfig[status]
  const interactiveClasses = onClick ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor} ${interactiveClasses}`}
      aria-label={`Status: ${config.label}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
    >
      <span className={`w-2 h-2 rounded-full ${config.dotColor}`} aria-hidden="true" />
      {config.label}
    </span>
  )
}
