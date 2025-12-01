import { useState, useEffect, useCallback } from 'react'
import type { GetPatientChartResponse } from '../../types'
import type { ChartPeriod } from '../../types/patient-details'

type UseChartDataParams = {
  patientId: string
  period: ChartPeriod
}

type UseChartDataResult = {
  data: GetPatientChartResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch patient chart data
 * GET /api/dietitian/patients/:patientId/chart
 */
export function useChartData({
  patientId,
  period,
}: UseChartDataParams): UseChartDataResult {
  const [data, setData] = useState<GetPatientChartResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchChartData() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(
          `/api/dietitian/patients/${patientId}/chart?period=${period}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Pacjent nie został znaleziony')
          } else if (response.status === 403) {
            throw new Error('Brak uprawnień')
          } else if (response.status === 401) {
            throw new Error('Musisz być zalogowany')
          } else if (response.status === 422) {
            throw new Error('Nieprawidłowy okres wykresu')
          } else {
            throw new Error('Wystąpił błąd podczas pobierania danych wykresu')
          }
        }

        const result: GetPatientChartResponse = await response.json()
        setData(result)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchChartData()

    return () => {
      controller.abort()
    }
  }, [patientId, period, refetchTrigger])

  const refetch = useCallback(async () => {
    setRefetchTrigger((prev) => prev + 1)
  }, [])

  return { data, isLoading, error, refetch }
}
