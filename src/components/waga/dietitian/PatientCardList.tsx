import type { PatientListItemVM } from '../../../types'
import StatusBadge from './StatusBadge'
import WeeklyObligationBadge from './WeeklyObligationBadge'

interface PatientCardListProps {
  items: PatientListItemVM[]
  onCardClick: (patientId: string) => void
}

/**
 * Patient Card List (Mobile view < md)
 * Displays patients as cards with badges
 */
export default function PatientCardList({ items, onCardClick }: PatientCardListProps) {
  return (
    <div className="md:hidden space-y-4">
      {items.map((item) => (
        <div
          key={item.id}
          onClick={() => onCardClick(item.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onCardClick(item.id)
            }
          }}
          tabIndex={0}
          className="bg-white rounded-lg shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-primary"
          role="button"
          aria-label={`Otwórz profil pacjenta ${item.fullName}`}
        >
          {/* Name */}
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-heading font-semibold text-neutral-dark">
              {item.fullName}
            </h3>
            <StatusBadge status={item.status} />
          </div>

          {/* Details Grid */}
          <div className="space-y-2">
            {/* Last Entry */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-dark/60">Ostatni wpis:</span>
              <span className="text-sm font-medium text-neutral-dark">
                {item.lastWeightEntryText}
              </span>
            </div>

            {/* Weekly Obligation */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-dark/60">Obowiązek tygodniowy:</span>
              <WeeklyObligationBadge met={item.weeklyObligationMet} />
            </div>
          </div>

          {/* Arrow indicator */}
          <div className="mt-4 flex justify-end">
            <span className="text-primary text-sm font-semibold" aria-hidden="true">
              Zobacz więcej →
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
