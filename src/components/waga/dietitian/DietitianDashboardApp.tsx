import { useState, useEffect, useMemo } from 'react'
import type {
  DashboardQueryVM,
  GetPatientsResponse,
  PatientStatusFilter,
  PaginationState,
  DashboardKPI,
  PatientListItemVM,
} from '../../../types'
import { mapPatientToVM, calculateKPI } from './helpers'
import DashboardKPIWidget from './DashboardKPIWidget'
import PatientListFilters from './PatientListFilters'
import PatientTable from './PatientTable'
import PatientCardList from './PatientCardList'
import PaginationControls from './PaginationControls'
import LoadingSkeleton from './LoadingSkeleton'
import EmptyState from './EmptyState'
import ErrorAlert from './ErrorAlert'
import SkipLink from './SkipLink'

// Props
interface DietitianDashboardAppProps {
  initialQuery?: DashboardQueryVM
  initialData?: GetPatientsResponse
}

/**
 * Main container for Dietitian Dashboard
 * Manages filters, pagination, data fetching and delegates rendering
 * Note: Always fetches fresh data from API to ensure up-to-date weeklyObligationMet status
 */
export default function DietitianDashboardApp({
  initialQuery,
  initialData,
}: DietitianDashboardAppProps) {
  // Initialize query state
  const [query, setQuery] = useState<DashboardQueryVM>(
    initialQuery || {
      status: 'active',
      page: 1,
      limit: 50,
    }
  )

  const [data, setData] = useState<GetPatientsResponse | null>(initialData || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derived state - memoized for performance
  const patientsVM: PatientListItemVM[] = useMemo(() => {
    if (!data) return []
    return data.patients.map(mapPatientToVM)
  }, [data])

  const kpi: DashboardKPI | null = useMemo(() => {
    if (!data) return null
    return calculateKPI(data)
  }, [data])

  const pagination: PaginationState | null = data
    ? {
        page: query.page,
        pageSize: data.pagination.limit,
        total: data.pagination.total,
        hasMore: data.pagination.hasMore,
      }
    : null

  // Fetch data when query changes
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const offset = (query.page - 1) * query.limit
        const url = `/api/dietitian/patients?status=${query.status}&limit=${query.limit}&offset=${offset}`

        const response = await fetch(url, {
          credentials: 'include',
        })

        if (!response.ok) {
          if (response.status === 401) {
            // Unauthorized - redirect to login
            window.location.href = '/logowanie'
            return
          }

          if (response.status === 403) {
            setError('Brak dostępu do tego zasobu.')
            return
          }

          if (response.status === 400) {
            // Validation error - reset to defaults
            setError('Nieprawidłowe parametry. Przywrócono domyślne ustawienia.')
            setQuery({ status: 'active', page: 1, limit: 50 })
            return
          }

          // Server error
          setError('Wystąpił błąd podczas ładowania danych.')
          return
        }

        const responseData: GetPatientsResponse = await response.json()
        setData(responseData)
      } catch (err) {
        console.error('Error fetching patients:', err)
        setError('Wystąpił błąd podczas ładowania danych.')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [query])

  // Update URL when query changes
  useEffect(() => {
    const params = new URLSearchParams()
    params.set('status', query.status)
    params.set('page', query.page.toString())

    // Use replaceState to avoid adding to browser history on every change
    const newUrl = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState({}, '', newUrl)
  }, [query])

  // Handle status filter change
  const handleStatusChange = (status: PatientStatusFilter) => {
    setQuery((prev) => ({
      ...prev,
      status,
      page: 1, // Reset to first page when filter changes
    }))
  }

  // Handle page change
  const handlePageChange = (page: number) => {
    setQuery((prev) => ({
      ...prev,
      page,
    }))
  }

  // Handle patient row/card click
  const handlePatientClick = (patientId: string) => {
    window.location.href = `/dietetyk/pacjenci/${patientId}`
  }

  // Handle retry on error
  const handleRetry = () => {
    setQuery({ status: 'active', page: 1, limit: 50 })
  }

  return (
    <>
      <SkipLink />
      <div className="min-h-screen bg-neutral-light py-8 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-3xl md:text-4xl font-heading font-bold text-neutral-dark mb-2">
              Panel Dietetyka
            </h1>
            <p className="text-neutral-dark/70">
              Przegląd pacjentów i ich aktywności
            </p>
          </header>

          {/* Main Content */}
          <main id="main-content">
            {/* Announce region for screen readers */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {isLoading && 'Ładowanie danych pacjentów...'}
              {!isLoading && data && `Załadowano ${data.patients.length} pacjentów`}
              {error && `Błąd: ${error}`}
            </div>

            {/* Error Alert */}
            {error && <ErrorAlert message={error} onRetry={handleRetry} />}

            {/* Loading Skeleton */}
            {isLoading && !data && <LoadingSkeleton />}

        {/* Empty State */}
        {!isLoading && data && data.patients.length === 0 && (
          <EmptyState
            currentFilter={query.status}
            onShowAll={() => handleStatusChange('all')}
          />
        )}

        {/* Main Content - KPI, Filters, List, Pagination */}
        {!isLoading && data && data.patients.length > 0 && kpi && pagination && (
          <>
            {/* KPI Widget */}
            <DashboardKPIWidget kpi={kpi} />

            {/* Filters */}
            <PatientListFilters value={query.status} onChange={handleStatusChange} />

            {/* Patient List - Table (desktop) / Cards (mobile) */}
            <PatientTable items={patientsVM} onRowClick={handlePatientClick} />
            <PatientCardList items={patientsVM} onCardClick={handlePatientClick} />

            {/* Pagination */}
            <PaginationControls pagination={pagination} onPageChange={handlePageChange} />
          </>
        )}
          </main>
        </div>
      </div>
    </>
  )
}
