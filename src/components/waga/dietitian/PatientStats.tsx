import type { PatientStatistics } from '../../../types'

type PatientStatsProps = {
  statistics: PatientStatistics
}

/**
 * Patient Statistics
 * Displays patient statistics in card tiles
 */
export default function PatientStats({ statistics }: PatientStatsProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return 'Brak danych'
    return new Date(date).toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const stats = [
    {
      label: 'Łączna liczba wpisów',
      value: statistics.totalEntries,
      icon: '📊',
    },
    {
      label: 'Tygodniowa realizacja',
      value: `${Math.round(statistics.weeklyComplianceRate * 100)}%`,
      icon: '✅',
    },
    {
      label: 'Obecna passa',
      value: `${statistics.currentStreak} tyg.`,
      icon: '🔥',
    },
    {
      label: 'Najdłuższa passa',
      value: `${statistics.longestStreak} tyg.`,
      icon: '🏆',
    },
    {
      label: 'Ostatni wpis',
      value: formatDate(statistics.lastEntry),
      icon: '📅',
    },
  ]

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <h2 className="text-xl font-heading font-semibold text-neutral-dark mb-4">
        Statystyki
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-neutral-light rounded-lg p-4 border border-neutral-dark/10"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl" aria-hidden="true">
                {stat.icon}
              </span>
              <span className="text-xs text-neutral-dark/60 font-semibold uppercase">
                {stat.label}
              </span>
            </div>
            <p className="text-2xl font-heading font-bold text-neutral-dark">
              {stat.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
