import type { PatientListItemVM } from '../../../types'
import StatusBadge from './StatusBadge'
import WeeklyObligationBadge from './WeeklyObligationBadge'

interface PatientTableProps {
  items: PatientListItemVM[]
  onRowClick: (patientId: string) => void
}

/**
 * Patient Table (Desktop view >= md)
 * Displays patients in a table format with columns:
 * - Full Name
 * - Status
 * - Last Entry Date
 * - Weekly Obligation Met
 */
export default function PatientTable({ items, onRowClick }: PatientTableProps) {
  return (
    <div className="hidden md:block bg-white rounded-lg shadow-sm overflow-hidden">
      <table className="w-full" role="table" aria-label="Lista pacjentów">
        <thead className="bg-neutral-dark/5 border-b border-neutral-dark/10">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-dark uppercase tracking-wider">
              Imię i nazwisko
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-dark uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-dark uppercase tracking-wider">
              Ostatni wpis
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-neutral-dark uppercase tracking-wider">
              Obowiązek tygodniowy
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-dark/10">
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => onRowClick(item.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onRowClick(item.id)
                }
              }}
              tabIndex={0}
              className="hover:bg-primary/5 cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
              role="button"
              aria-label={`Otwórz profil pacjenta ${item.fullName}`}
            >
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-sm font-medium text-neutral-dark">
                  {item.fullName}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <StatusBadge status={item.status} />
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className="text-sm text-neutral-dark/70">
                  {item.lastWeightEntryText}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <WeeklyObligationBadge met={item.weeklyObligationMet} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
