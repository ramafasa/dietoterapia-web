import type { PatientStatusFilter } from '../../../types'

interface PatientListFiltersProps {
  value: PatientStatusFilter
  onChange: (value: PatientStatusFilter) => void
}

/**
 * Patient List Filters
 * Dropdown for filtering patients by status
 */
export default function PatientListFilters({
  value,
  onChange,
}: PatientListFiltersProps) {
  const statusOptions: Array<{ value: PatientStatusFilter; label: string }> = [
    { value: 'all', label: 'Wszyscy' },
    { value: 'active', label: 'Aktywni' },
    { value: 'paused', label: 'Wstrzymani' },
    { value: 'ended', label: 'Zakończeni' },
  ]

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Filter Label */}
        <label
          htmlFor="status-filter"
          className="text-sm font-semibold text-neutral-dark"
        >
          Filtruj po statusie:
        </label>

        {/* Status Dropdown */}
        <select
          id="status-filter"
          value={value}
          onChange={(e) => onChange(e.target.value as PatientStatusFilter)}
          className="px-4 py-2 border border-neutral-dark/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white text-neutral-dark"
          aria-label="Filtr statusu pacjenta"
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Future: Search field can be added here post-MVP */}
      </div>
    </div>
  )
}
