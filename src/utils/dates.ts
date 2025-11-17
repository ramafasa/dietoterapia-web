import { format, subDays } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/**
 * Normalizuje widok (today/week/range) do zakresu dat (YYYY-MM-DD)
 *
 * Używane przez:
 * - GET /api/dietitian/patients/:patientId/weight
 *
 * Timezone: Europe/Warsaw
 *
 * @param view - Typ widoku: 'today' | 'week' | 'range'
 * @param startDate - Data początkowa (wymagana dla view='range')
 * @param endDate - Data końcowa (wymagana dla view='range')
 * @returns { startDate: string, endDate: string } - Zakres dat w formacie YYYY-MM-DD
 */
export function normalizeViewToDates(
  view: 'today' | 'week' | 'range',
  startDate?: string,
  endDate?: string
): { startDate: string; endDate: string } {
  const WARSAW_TZ = 'Europe/Warsaw'
  const now = new Date()
  const warsawNow = toZonedTime(now, WARSAW_TZ)

  switch (view) {
    case 'today': {
      // Dzisiaj: [today 00:00, today 23:59:59.999]
      const today = format(warsawNow, 'yyyy-MM-dd')
      return {
        startDate: today,
        endDate: today,
      }
    }

    case 'week': {
      // Ostatnie 7 dni (rolling window): [today - 6 dni, today]
      const today = format(warsawNow, 'yyyy-MM-dd')
      const weekAgo = format(subDays(warsawNow, 6), 'yyyy-MM-dd')
      return {
        startDate: weekAgo,
        endDate: today,
      }
    }

    case 'range': {
      // Przekazane daty (już zwalidowane przez Zod)
      if (!startDate || !endDate) {
        throw new Error('startDate and endDate are required for view=range')
      }
      return {
        startDate,
        endDate,
      }
    }

    default:
      throw new Error(`Invalid view: ${view}`)
  }
}
