import type { DashboardKPI } from '../../../types'

interface DashboardKPIWidgetProps {
  kpi: DashboardKPI
}

/**
 * Dashboard KPI Widget
 * Displays key metrics: active patients and weekly compliance rate
 */
export default function DashboardKPIWidget({ kpi }: DashboardKPIWidgetProps) {
  const { activePatients, withEntryThisWeek, rate } = kpi

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
      <h2 className="text-lg font-heading font-semibold text-neutral-dark mb-4">
        Podsumowanie
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Active Patients */}
        <div className="flex flex-col">
          <span className="text-sm text-neutral-dark/60 mb-1">
            Aktywni pacjenci
          </span>
          <span className="text-3xl font-heading font-bold text-primary">
            {activePatients}
          </span>
        </div>

        {/* Patients with Entry */}
        <div className="flex flex-col">
          <span className="text-sm text-neutral-dark/60 mb-1">
            Z wpisem w tym tygodniu
          </span>
          <span className="text-3xl font-heading font-bold text-accent">
            {withEntryThisWeek}
          </span>
        </div>

        {/* Compliance Rate */}
        <div className="flex flex-col">
          <span className="text-sm text-neutral-dark/60 mb-1">
            Wskaźnik spełnienia
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-heading font-bold text-secondary">
              {rate}%
            </span>
            {rate >= 80 && (
              <span className="text-xl text-green-600" aria-label="Bardzo dobry wynik">
                ✓
              </span>
            )}
            {rate >= 50 && rate < 80 && (
              <span className="text-xl text-yellow-600" aria-label="Dobry wynik">
                ~
              </span>
            )}
            {rate < 50 && (
              <span className="text-xl text-red-600" aria-label="Wymaga poprawy">
                !
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Note about data scope (MVP) */}
      <p className="text-xs text-neutral-dark/40 mt-4 italic">
        * Dane dotyczą aktywnych pacjentów na bieżącej stronie
      </p>
    </div>
  )
}
