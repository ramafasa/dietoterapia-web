interface StatusBadgeProps {
  status: 'active' | 'paused' | 'ended' | null
}

/**
 * Status Badge
 * Displays patient status with color coding
 */
export default function StatusBadge({ status }: StatusBadgeProps) {
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

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor}`}
      aria-label={`Status: ${config.label}`}
    >
      <span className={`w-2 h-2 rounded-full ${config.dotColor}`} aria-hidden="true" />
      {config.label}
    </span>
  )
}
