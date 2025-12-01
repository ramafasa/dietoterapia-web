import type {
  PatientListItemDTO,
  PatientListItemVM,
  DashboardKPI,
  GetPatientsResponse,
  OffsetPagination,
  PaginationState,
} from '../../../types'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

/**
 * Convert PatientListItemDTO to PatientListItemVM
 */
export function mapPatientToVM(dto: PatientListItemDTO): PatientListItemVM {
  const fullName = [dto.firstName, dto.lastName].filter(Boolean).join(' ') || 'Brak danych'

  const lastWeightEntryText = dto.lastWeightEntry
    ? format(new Date(dto.lastWeightEntry), 'd MMM yyyy', { locale: pl })
    : 'Brak wpisów'

  return {
    id: dto.id,
    fullName,
    status: dto.status as 'active' | 'paused' | 'ended' | null,
    lastWeightEntry: dto.lastWeightEntry ? new Date(dto.lastWeightEntry) : null,
    weeklyObligationMet: dto.weeklyObligationMet,
    lastWeightEntryText,
  }
}

/**
 * Convert OffsetPagination to PaginationState
 */
export function mapPaginationToState(
  pagination: OffsetPagination,
  currentPage: number
): PaginationState {
  return {
    page: currentPage,
    pageSize: pagination.limit,
    total: pagination.total,
    hasMore: pagination.hasMore,
  }
}

/**
 * Calculate KPI metrics from patients list
 * Note: In MVP this is calculated from current page only.
 * For production, consider dedicated KPI endpoint.
 */
export function calculateKPI(response: GetPatientsResponse): DashboardKPI {
  const { patients } = response

  // Count only active patients for KPI
  const activePatients = patients.filter(p => p.status === 'active').length

  // Count active patients with entry this week
  const withEntryThisWeek = patients.filter(
    p => p.status === 'active' && p.weeklyObligationMet
  ).length

  // Calculate rate (percentage)
  const rate = activePatients > 0
    ? Math.round((withEntryThisWeek / activePatients) * 100)
    : 0

  return {
    activePatients,
    withEntryThisWeek,
    rate,
  }
}
