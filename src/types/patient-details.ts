/**
 * ViewModels and types for Patient Details View (Dietitian)
 * Used in /dietetyk/pacjenci/[patientId]
 */

// ===== VIEW MODELS =====

/** History view filter options */
export type HistoryView = 'today' | 'week' | 'range'

/** Chart period options (in days) */
export type ChartPeriod = 30 | 90

/** Patient detail view state (UI orchestration) */
export type PatientDetailViewState = {
  selectedView: HistoryView
  chartPeriod: ChartPeriod
  range: HistoryFiltersVM
  isAddModalOpen: boolean
  isStatusModalOpen: boolean
  isLoading: boolean
  error: string | null
}

/** History filters for range view */
export type HistoryFiltersVM = {
  startDate: string // ISO date string (YYYY-MM-DD)
  endDate: string   // ISO date string (YYYY-MM-DD)
}

/** Form data for adding weight entry (dietitian) */
export type AddWeightForPatientFormVM = {
  weight: string           // String in input, converted to number before submit
  measurementDate: string  // ISO date string (YYYY-MM-DD)
  note: string             // Required in UX (min 10 chars)
  errors?: {
    weight?: string
    measurementDate?: string
    note?: string
    submit?: string
  }
}

/** Status badge color mapping */
export type StatusBadgeVariant = 'active' | 'paused' | 'ended' | 'unknown'

// ===== HELPERS =====

/**
 * Get badge variant from patient status
 */
export function getStatusBadgeVariant(status: string | null): StatusBadgeVariant {
  switch (status) {
    case 'active':
      return 'active'
    case 'paused':
      return 'paused'
    case 'ended':
      return 'ended'
    default:
      return 'unknown'
  }
}

/**
 * Get badge label from status
 */
export function getStatusLabel(status: string | null): string {
  switch (status) {
    case 'active':
      return 'Aktywny'
    case 'paused':
      return 'Wstrzymany'
    case 'ended':
      return 'Zakończony'
    default:
      return 'Nieznany'
  }
}

/**
 * Get status description/warning for change status modal
 */
export function getStatusWarning(status: 'active' | 'paused' | 'ended'): string {
  switch (status) {
    case 'paused':
      return 'Przypomnienia zostaną wyłączone dla tego pacjenta.'
    case 'ended':
      return 'Retencja danych: 24 miesiące. Nie będzie można dodawać nowych wpisów wagi.'
    default:
      return ''
  }
}
