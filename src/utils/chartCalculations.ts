import type { WeightStatistics } from '../types'
import { differenceInDays } from 'date-fns'

/**
 * Oblicza 7-dniową średnią kroczącą (MA7) dla wpisów wagi
 *
 * Algorytm:
 * - Rolling window po WEJŚCIACH (nie po dniach)
 * - Dla każdego wpisu: średnia z do 7 ostatnich dostępnych wpisów (włącznie z bieżącym)
 * - Jeśli mniej niż 7 wpisów, licz średnią z dostępnych (1..6)
 * - Zaokrąglenie do 1 miejsca po przecinku
 *
 * Używane przez:
 * - GET /api/dietitian/patients/:patientId/chart
 *
 * @param weights - Tablica wag (number[]) posortowana chronologicznie ASC
 * @param index - Indeks wpisu, dla którego liczymy MA7
 * @returns number - MA7 zaokrąglone do 1 miejsca po przecinku
 */
export function calculateMA7(weights: number[], index: number): number {
  // Wyznacz okno: max 7 ostatnich wpisów (włącznie z bieżącym)
  const windowStart = Math.max(0, index - 6)
  const windowEnd = index + 1 // exclusive
  const window = weights.slice(windowStart, windowEnd)

  // Oblicz średnią
  const sum = window.reduce((acc, w) => acc + w, 0)
  const avg = sum / window.length

  // Zaokrąglij do 1 miejsca po przecinku
  return Math.round(avg * 10) / 10
}

/**
 * Oblicza statystyki wagi dla wykresu
 *
 * Metryki:
 * - startWeight: waga z pierwszego wpisu w okresie
 * - endWeight: waga z ostatniego wpisu w okresie
 * - change: endWeight - startWeight (zaokrąglone do 1 miejsca po przecinku)
 * - changePercent: (change / startWeight) * 100 (zaokrąglone do 1 miejsca po przecinku)
 * - avgWeeklyChange: średnia zmiana tygodniowa (zaokrąglone do 1 miejsca po przecinku)
 * - trendDirection: 'increasing' | 'decreasing' | 'stable' (próg 0.1 kg)
 *
 * Edge cases:
 * - Brak wpisów: wszystkie wartości 0, trendDirection: 'stable'
 * - 1 wpis: startWeight = endWeight, change = 0, trendDirection: 'stable'
 * - 2+ wpisów: normalne obliczenia
 *
 * Używane przez:
 * - GET /api/dietitian/patients/:patientId/chart
 *
 * @param entries - Lista wpisów z polami { weight: number, measurementDate: Date }
 * @returns WeightStatistics
 */
export function calculateWeightStatistics(
  entries: Array<{ weight: number; measurementDate: Date }>
): WeightStatistics {
  // Edge case: brak wpisów
  if (entries.length === 0) {
    return {
      startWeight: 0,
      endWeight: 0,
      change: 0,
      changePercent: 0,
      avgWeeklyChange: 0,
      trendDirection: 'stable',
    }
  }

  // Edge case: 1 wpis
  if (entries.length === 1) {
    const weight = entries[0].weight
    return {
      startWeight: weight,
      endWeight: weight,
      change: 0,
      changePercent: 0,
      avgWeeklyChange: 0,
      trendDirection: 'stable',
    }
  }

  // 2+ wpisów - normalne obliczenia
  const startWeight = entries[0].weight
  const endWeight = entries[entries.length - 1].weight
  const change = Math.round((endWeight - startWeight) * 10) / 10

  // changePercent
  const changePercent =
    startWeight > 0 ? Math.round((change / startWeight) * 100 * 10) / 10 : 0

  // avgWeeklyChange
  // Obliczamy średnie tempo dzienne (change / liczba dni), przeskalowane do 7 dni
  const firstDate = entries[0].measurementDate
  const lastDate = entries[entries.length - 1].measurementDate
  const daysBetween = differenceInDays(lastDate, firstDate)

  let avgWeeklyChange = 0
  if (daysBetween > 0) {
    const dailyChange = change / daysBetween
    avgWeeklyChange = Math.round(dailyChange * 7 * 10) / 10
  }

  // trendDirection (próg 0.1 kg)
  let trendDirection: 'increasing' | 'decreasing' | 'stable'
  if (change > 0.1) {
    trendDirection = 'increasing'
  } else if (change < -0.1) {
    trendDirection = 'decreasing'
  } else {
    trendDirection = 'stable'
  }

  return {
    startWeight,
    endWeight,
    change,
    changePercent,
    avgWeeklyChange,
    trendDirection,
  }
}
