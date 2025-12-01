import { useState } from 'react'
import type { HistoryFiltersVM } from '../../../types/patient-details'
import { validateDateRange } from '../../../utils/validation/patient-weight'

type WeightHistoryRangePickerProps = {
  value: HistoryFiltersVM
  onChange: (value: HistoryFiltersVM) => void
  onApply: () => void
}

/**
 * Weight History Range Picker
 * Date range selector for custom period filtering
 */
export default function WeightHistoryRangePicker({
  value,
  onChange,
  onApply,
}: WeightHistoryRangePickerProps) {
  const [errors, setErrors] = useState<{ startDate?: string; endDate?: string }>({})

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value
    onChange({ ...value, startDate: newStartDate })
    setErrors({}) // Clear errors on change
  }

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEndDate = e.target.value
    onChange({ ...value, endDate: newEndDate })
    setErrors({}) // Clear errors on change
  }

  const handleApply = () => {
    // Validate date range
    const validationErrors = validateDateRange(value.startDate, value.endDate)
    if (validationErrors) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    onApply()
  }

  return (
    <div className="bg-neutral-light rounded-lg p-4 border border-neutral-dark/10 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Start Date */}
        <div>
          <label htmlFor="startDate" className="block text-sm font-semibold text-neutral-dark mb-2">
            Data początkowa
          </label>
          <input
            type="date"
            id="startDate"
            value={value.startDate}
            onChange={handleStartDateChange}
            className={`w-full px-4 py-2 rounded-lg border ${
              errors.startDate ? 'border-red-500' : 'border-neutral-dark/20'
            } focus:outline-none focus:ring-2 focus:ring-primary`}
          />
          {errors.startDate && (
            <p className="text-red-600 text-sm mt-1">{errors.startDate}</p>
          )}
        </div>

        {/* End Date */}
        <div>
          <label htmlFor="endDate" className="block text-sm font-semibold text-neutral-dark mb-2">
            Data końcowa
          </label>
          <input
            type="date"
            id="endDate"
            value={value.endDate}
            onChange={handleEndDateChange}
            className={`w-full px-4 py-2 rounded-lg border ${
              errors.endDate ? 'border-red-500' : 'border-neutral-dark/20'
            } focus:outline-none focus:ring-2 focus:ring-primary`}
          />
          {errors.endDate && (
            <p className="text-red-600 text-sm mt-1">{errors.endDate}</p>
          )}
        </div>
      </div>

      {/* Apply Button */}
      <button
        onClick={handleApply}
        className="w-full md:w-auto px-6 py-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
      >
        Zastosuj zakres
      </button>
    </div>
  )
}
