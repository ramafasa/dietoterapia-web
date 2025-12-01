import { useState } from 'react'
import type { HistoryView, HistoryFiltersVM } from '../../../types/patient-details'
import { useWeightHistory } from '../../../hooks/dietitian/useWeightHistory'
import WeightHistoryRangePicker from './WeightHistoryRangePicker'
import WeightEntryList from './WeightEntryList'

type WeightHistoryTabsProps = {
  patientId: string
  defaultView?: HistoryView
}

/**
 * Weight History Tabs
 * Tabbed interface for viewing weight history (Today / Week / Range)
 */
export default function WeightHistoryTabs({
  patientId,
  defaultView = 'week',
}: WeightHistoryTabsProps) {
  const [selectedView, setSelectedView] = useState<HistoryView>(defaultView)
  const [rangeFilters, setRangeFilters] = useState<HistoryFiltersVM>({
    startDate: '',
    endDate: '',
  })
  const [appliedFilters, setAppliedFilters] = useState<HistoryFiltersVM>({
    startDate: '',
    endDate: '',
  })

  // Fetch weight history based on selected view
  const {
    entries,
    hasMore,
    weeklyObligationMet,
    isLoading,
    error,
    loadMore,
    refetch,
  } = useWeightHistory({
    patientId,
    view: selectedView,
    startDate: selectedView === 'range' ? appliedFilters.startDate : undefined,
    endDate: selectedView === 'range' ? appliedFilters.endDate : undefined,
  })

  const handleTabChange = (view: HistoryView) => {
    setSelectedView(view)
  }

  const handleRangeApply = () => {
    setAppliedFilters(rangeFilters)
  }

  const tabs: { value: HistoryView; label: string }[] = [
    { value: 'today', label: 'Dziś' },
    { value: 'week', label: 'Ten tydzień' },
    { value: 'range', label: 'Zakres dat' },
  ]

  return (
    <div>
      {/* Tab Headers */}
      <div className="flex items-center gap-2 mb-4 border-b border-neutral-dark/10">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-4 py-2 font-semibold transition-colors ${
              selectedView === tab.value
                ? 'text-primary border-b-2 border-primary'
                : 'text-neutral-dark/60 hover:text-neutral-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Weekly Obligation Badge */}
      {selectedView === 'week' && (
        <div className="mb-4">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${
              weeklyObligationMet
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}
          >
            {weeklyObligationMet ? '✅ Obowiązek tygodniowy spełniony' : '❌ Obowiązek tygodniowy niespełniony'}
          </span>
        </div>
      )}

      {/* Range Picker (visible only for 'range' view) */}
      {selectedView === 'range' && (
        <WeightHistoryRangePicker
          value={rangeFilters}
          onChange={setRangeFilters}
          onApply={handleRangeApply}
        />
      )}

      {/* Entry List */}
      <WeightEntryList
        entries={entries}
        hasMore={hasMore}
        onLoadMore={loadMore}
        isLoading={isLoading}
        error={error}
      />
    </div>
  )
}
