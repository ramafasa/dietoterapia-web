import { useState, useEffect } from 'react'
import type { GetPatientDetailsResponse } from '../../types'

type UsePatientDetailsResult = {
  data: GetPatientDetailsResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Hook to fetch patient details (GET /api/dietitian/patients/:patientId)
 */
export function usePatientDetails(patientId: string): UsePatientDetailsResult {
  const [data, setData] = useState<GetPatientDetailsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchPatientDetails() {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/dietitian/patients/${patientId}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          if (response.status === 404) {
            throw new Error('Pacjent nie został znaleziony')
          } else if (response.status === 403) {
            throw new Error('Brak uprawnień')
          } else if (response.status === 401) {
            throw new Error('Musisz być zalogowany')
          } else {
            throw new Error('Wystąpił błąd podczas pobierania danych')
          }
        }

        const result: GetPatientDetailsResponse = await response.json()
        setData(result)
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError(err.message)
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchPatientDetails()

    // Cleanup: abort fetch on unmount or patientId change
    return () => {
      controller.abort()
    }
  }, [patientId, refetchTrigger])

  const refetch = async () => {
    setRefetchTrigger((prev) => prev + 1)
  }

  return { data, isLoading, error, refetch }
}
