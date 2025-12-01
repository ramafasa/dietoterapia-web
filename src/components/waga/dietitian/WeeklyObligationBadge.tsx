interface WeeklyObligationBadgeProps {
  met: boolean
}

/**
 * Weekly Obligation Badge
 * Displays whether patient has met their weekly weight entry obligation
 */
export default function WeeklyObligationBadge({ met }: WeeklyObligationBadgeProps) {
  return met ? (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800"
      aria-label="Obowiązek spełniony"
    >
      <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
      Tak
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800"
      aria-label="Obowiązek niespełniony"
    >
      <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
      Nie
    </span>
  )
}
