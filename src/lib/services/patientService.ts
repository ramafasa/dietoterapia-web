import { patientRepository } from '../repositories/patientRepository'
import { eventRepository } from '../repositories/eventRepository'
import { userRepository } from '../repositories/userRepository'
import { weightEntryRepository } from '../repositories/weightEntryRepository'
import { auditLogRepository } from '../repositories/auditLogRepository'
import type { GetPatientsResponse, PatientListItemDTO, OffsetPagination, GetPatientDetailsResponse, PatientStatistics, GetPatientChartResponse, ChartDataPoint, UpdatePatientStatusCommand, UpdatePatientStatusResponse } from '../../types'
import { NotFoundError } from '../errors'
import { startOfWeek, differenceInWeeks, subDays, addMonths } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { normalizeToStartOfDay, formatToDateString } from '../../utils/dates'
import { calculateMA7, calculateWeightStatistics } from '../../utils/chartCalculations'

/**
 * Service Layer dla logiki biznesowej pacjentów
 *
 * Odpowiedzialności:
 * - Orchestracja operacji pobierania listy pacjentów
 * - Mapowanie danych z repository → DTO dla API
 * - Obliczenie metadanych paginacji (hasMore)
 * - Asynchroniczne logowanie zdarzeń analytics (best-effort)
 */
export class PatientService {
  /**
   * Pobiera listę pacjentów z informacjami operacyjnymi
   *
   * Flow:
   * 1. Pobranie całkowitej liczby pacjentów spełniających kryteria (dla paginacji)
   * 2. Pobranie strony wyników z repository (limit, offset)
   * 3. Mapowanie wyników → PatientListItemDTO
   * 4. Obliczenie hasMore (czy są kolejne strony)
   * 5. Best-effort analytics event (view_patients_list)
   * 6. Zwrot GetPatientsResponse
   *
   * @param params - { status, limit, offset }
   * @param dietitianId - ID dietetyka (dla analytics, opcjonalnie)
   * @returns Promise<GetPatientsResponse> - Lista pacjentów + paginacja
   */
  async getPatientsList(
    params: { status: string; limit: number; offset: number },
    dietitianId?: string
  ): Promise<GetPatientsResponse> {
    try {
      const { status, limit, offset } = params

      // 1. Policz całkowitą liczbę pacjentów
      const total = await patientRepository.countPatients({ status })

      // 2. Pobierz stronę wyników
      const patients = await patientRepository.findPatients({ status, limit, offset })

      // 3. Mapowanie → PatientListItemDTO
      const patientDTOs: PatientListItemDTO[] = patients.map((patient) => ({
        id: patient.id,
        firstName: patient.firstName,
        lastName: patient.lastName,
        email: patient.email,
        age: patient.age,
        gender: patient.gender,
        status: patient.status,
        createdAt: patient.createdAt,
        lastWeightEntry: patient.lastWeightEntry,
        weeklyObligationMet: patient.weeklyObligationMet,
      }))

      // 4. Oblicz hasMore
      const hasMore = offset + patients.length < total

      // 5. Best-effort analytics (nie blokuje odpowiedzi)
      if (dietitianId) {
        eventRepository
          .create({
            userId: dietitianId,
            eventType: 'view_patients_list',
            properties: { status, limit, offset, total },
          })
          .catch((err) => {
            console.error('[PatientService] Failed to log analytics event:', err)
          })
      }

      // 6. Zwróć odpowiedź
      const pagination: OffsetPagination = {
        total,
        limit,
        offset,
        hasMore,
      }

      return {
        patients: patientDTOs,
        pagination,
      }
    } catch (error) {
      console.error('[PatientService] Error getting patients list:', error)
      throw error
    }
  }

  /**
   * Pobiera szczegóły pacjenta wraz ze statystykami wpisów wagi
   *
   * Flow:
   * 1. Pobranie użytkownika z bazy (weryfikacja istnienia i roli 'patient')
   * 2. Agregacja statystyk wpisów wagi:
   *    - totalEntries (COUNT)
   *    - lastEntry (MAX measurement_date)
   *    - weeklyPresence (lista tygodni z >=1 wpisem)
   * 3. Obliczenie metryk compliance:
   *    - weeklyComplianceRate (% tygodni z wpisem w ostatnich 12 tyg.)
   *    - currentStreak (ile kolejnych tygodni z wpisem od dziś wstecz)
   *    - longestStreak (najdłuższa sekwencja tygodni z wpisem)
   * 4. Best-effort analytics event (view_patient_details)
   * 5. Zwrot GetPatientDetailsResponse
   *
   * @param patientId - UUID pacjenta
   * @param dietitianId - UUID dietetyka (dla analytics, opcjonalnie)
   * @returns Promise<GetPatientDetailsResponse>
   * @throws NotFoundError - gdy pacjent nie istnieje lub nie ma roli 'patient'
   */
  async getPatientDetails(
    patientId: string,
    dietitianId?: string
  ): Promise<GetPatientDetailsResponse> {
    try {
      // 1. Pobierz użytkownika
      const patient = await userRepository.findById(patientId)

      if (!patient || patient.role !== 'patient') {
        throw new NotFoundError('Pacjent nie został znaleziony')
      }

      // 2. Agregacje statystyk wagi
      const [totalEntries, lastEntry, weeklyPresence] = await Promise.all([
        weightEntryRepository.countByUser(patientId),
        weightEntryRepository.getLastEntryDate(patientId),
        weightEntryRepository.getWeeklyPresence(patientId, 52), // ostatnie 52 tygodnie
      ])

      // 3. Oblicz metryki compliance
      const statistics = this.calculateStatistics(weeklyPresence, lastEntry, totalEntries)

      // 4. Best-effort analytics (nie blokuje odpowiedzi)
      if (dietitianId) {
        eventRepository
          .create({
            userId: dietitianId,
            eventType: 'view_patient_details',
            properties: { patientId },
          })
          .catch((err) => {
            console.error('[PatientService] Failed to log analytics event:', err)
          })
      }

      // 5. Zwróć odpowiedź
      return {
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          email: patient.email,
          age: patient.age,
          gender: patient.gender,
          status: patient.status,
          createdAt: patient.createdAt,
          updatedAt: patient.updatedAt,
        },
        statistics,
      }
    } catch (error) {
      console.error('[PatientService] Error getting patient details:', error)
      throw error
    }
  }

  /**
   * Oblicza statystyki compliance na podstawie listy tygodni z wpisami
   *
   * Metryki:
   * - weeklyComplianceRate: % tygodni z wpisem w ostatnich 12 tygodniach
   * - currentStreak: liczba kolejnych tygodni z wpisem od bieżącego tygodnia wstecz
   * - longestStreak: najdłuższa sekwencja kolejnych tygodni z wpisem
   *
   * @param weeklyPresence - Lista poniedziałków tygodni z >=1 wpisem (DESC order)
   * @param lastEntry - Data ostatniego wpisu (lub null)
   * @param totalEntries - Całkowita liczba wpisów
   * @returns PatientStatistics
   */
  private calculateStatistics(
    weeklyPresence: Date[],
    lastEntry: Date | null,
    totalEntries: number
  ): PatientStatistics {
    // Oblicz weeklyComplianceRate (ostatnie 12 tygodni)
    const now = toZonedTime(new Date(), 'Europe/Warsaw')
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 }) // poniedziałek
    const consideredWeeks = 12
    const weeksWithEntry = weeklyPresence.filter((weekStart) => {
      const weeksDiff = differenceInWeeks(currentWeekStart, weekStart)
      return weeksDiff >= 0 && weeksDiff < consideredWeeks
    }).length
    const weeklyComplianceRate = consideredWeeks > 0 ? weeksWithEntry / consideredWeeks : 0

    // Oblicz currentStreak
    const currentStreak = this.calculateCurrentStreak(weeklyPresence, currentWeekStart)

    // Oblicz longestStreak
    const longestStreak = this.calculateLongestStreak(weeklyPresence)

    return {
      totalEntries,
      weeklyComplianceRate,
      currentStreak,
      longestStreak,
      lastEntry,
    }
  }

  /**
   * Oblicza currentStreak - liczba kolejnych tygodni z wpisem od bieżącego tygodnia wstecz
   *
   * Algorytm:
   * 1. Rozpocznij od bieżącego tygodnia (lub poprzedniego, jeśli bieżący pusty)
   * 2. Idź wstecz po tygodniach, sprawdzając czy są w weeklyPresence
   * 3. Zatrzymaj się na pierwszym tygodniu bez wpisu
   * 4. Zwróć licznik
   *
   * @param weeklyPresence - Lista poniedziałków tygodni z wpisem (DESC)
   * @param currentWeekStart - Poniedziałek bieżącego tygodnia
   * @returns number - currentStreak
   */
  private calculateCurrentStreak(weeklyPresence: Date[], currentWeekStart: Date): number {
    if (weeklyPresence.length === 0) return 0

    // Konwertuj listę na Set dla szybszego lookup (porównujemy timestamp)
    const weekSet = new Set(weeklyPresence.map((d) => d.getTime()))

    let streak = 0
    let checkWeek = currentWeekStart

    // Sprawdzaj kolejne tygodnie wstecz
    while (weekSet.has(checkWeek.getTime())) {
      streak++
      // Przesuń do poprzedniego tygodnia (7 dni wstecz)
      checkWeek = new Date(checkWeek.getTime() - 7 * 24 * 60 * 60 * 1000)
    }

    return streak
  }

  /**
   * Oblicza longestStreak - najdłuższa sekwencja kolejnych tygodni z wpisem
   *
   * Algorytm:
   * 1. Sortuj listę tygodni ASC
   * 2. Przejdź po liście, licząc kolejne tygodnie bez przerwy
   * 3. Jeśli różnica między tygodniami > 1 tydzień, resetuj licznik
   * 4. Zwróć maksymalną wartość licznika
   *
   * @param weeklyPresence - Lista poniedziałków tygodni z wpisem (DESC)
   * @returns number - longestStreak
   */
  private calculateLongestStreak(weeklyPresence: Date[]): number {
    if (weeklyPresence.length === 0) return 0

    // Sortuj ASC (najstarsze → najnowsze)
    const sortedWeeks = [...weeklyPresence].sort((a, b) => a.getTime() - b.getTime())

    let maxStreak = 1
    let currentStreak = 1

    for (let i = 1; i < sortedWeeks.length; i++) {
      const prevWeek = sortedWeeks[i - 1]
      const currWeek = sortedWeeks[i]
      const diffWeeks = Math.round(
        (currWeek.getTime() - prevWeek.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )

      if (diffWeeks === 1) {
        // Kolejny tydzień - kontynuuj streak
        currentStreak++
        maxStreak = Math.max(maxStreak, currentStreak)
      } else {
        // Przerwa - resetuj streak
        currentStreak = 1
      }
    }

    return maxStreak
  }

  /**
   * Pobiera dane do wykresu wagi pacjenta (wykres + statystyki)
   *
   * Flow:
   * 1. Weryfikacja istnienia pacjenta (musi mieć rolę 'patient')
   * 2. Wyznaczenie zakresu dat (period: 30 lub 90 dni wstecz od dziś)
   * 3. Pobranie wpisów wagi z repository
   * 4. Mapowanie → ChartDataPoint[] (konwersje, formatowanie dat)
   * 5. Obliczenie MA7 dla każdego punktu
   * 6. Obliczenie statystyk (startWeight, endWeight, change, trend)
   * 7. MVP: goalWeight = null (brak źródła prawdy)
   * 8. Best-effort analytics event (view_patient_chart)
   * 9. Zwrot GetPatientChartResponse
   *
   * @param patientId - UUID pacjenta
   * @param periodDays - Okres w dniach: 30 | 90
   * @param dietitianId - UUID dietetyka (dla analytics, opcjonalnie)
   * @returns Promise<GetPatientChartResponse>
   * @throws NotFoundError - gdy pacjent nie istnieje lub nie ma roli 'patient'
   */
  async getPatientChartData(
    patientId: string,
    periodDays: 30 | 90,
    dietitianId?: string
  ): Promise<GetPatientChartResponse> {
    try {
      // 1. Weryfikacja pacjenta
      const patient = await userRepository.findById(patientId)

      if (!patient || patient.role !== 'patient') {
        throw new NotFoundError('Pacjent nie został znaleziony')
      }

      // 2. Wyznaczenie zakresu dat
      // startDate = dziś - (periodDays - 1) dni (początek dnia)
      // endDate = dziś (początek następnego dnia - użyjemy < zamiast <=)
      const now = new Date()
      const startDate = normalizeToStartOfDay(subDays(now, periodDays - 1))
      // endDate (exclusive) - początek następnego dnia, aby uwzględnić cały dzisiejszy dzień
      const endDate = normalizeToStartOfDay(subDays(now, -1)) // now + 1 dzień

      // 3. Pobranie wpisów wagi
      const entries = await weightEntryRepository.findByPatientAndDateRange(
        patientId,
        startDate,
        endDate
      )

      // 4. Mapowanie → ChartDataPoint[]
      const weights = entries.map((e) => parseFloat(e.weight))

      const chartDataPoints: ChartDataPoint[] = entries.map((entry, index) => ({
        date: formatToDateString(entry.measurementDate),
        weight: weights[index],
        source: entry.source,
        isOutlier: entry.isOutlier,
        ma7: calculateMA7(weights, index),
      }))

      // 5. Obliczenie statystyk
      const statistics = calculateWeightStatistics(
        entries.map((e) => ({
          weight: parseFloat(e.weight),
          measurementDate: e.measurementDate,
        }))
      )

      // 6. MVP: goalWeight = null
      const goalWeight = null

      // 7. Best-effort analytics (nie blokuje odpowiedzi)
      if (dietitianId) {
        eventRepository
          .create({
            userId: dietitianId,
            eventType: 'view_patient_chart',
            properties: { patientId, period: periodDays },
          })
          .catch((err) => {
            console.error('[PatientService] Failed to log analytics event:', err)
          })
      }

      // 8. Zwrot odpowiedzi
      return {
        patient: {
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          status: patient.status,
        },
        chartData: {
          entries: chartDataPoints,
          statistics,
          goalWeight,
        },
      }
    } catch (error) {
      console.error('[PatientService] Error getting patient chart data:', error)
      throw error
    }
  }

  /**
   * Aktualizuje status pacjenta (active | paused | ended)
   *
   * Flow:
   * 1. Pobranie obecnego stanu pacjenta (weryfikacja istnienia i roli 'patient')
   * 2. Przygotowanie danych do aktualizacji:
   *    - status: z command
   *    - updatedAt: now
   *    - endedAt: now (jeśli status==='ended'), null (w przeciwnym razie)
   *    - scheduledDeletionAt: endedAt + 24 miesiące (jeśli status==='ended'), null (w przeciwnym razie)
   * 3. Wykonanie aktualizacji przez userRepository
   * 4. Zbudowanie before/after snapshots do audit log
   * 5. Best-effort audit log (asynchronicznie)
   * 6. Best-effort analytics event (update_patient_status)
   * 7. Zwrot UpdatePatientStatusResponse['patient']
   *
   * @param command - UpdatePatientStatusCommand { patientId, status, note?, dietitianId }
   * @returns Promise<UpdatePatientStatusResponse['patient']>
   * @throws NotFoundError - gdy pacjent nie istnieje lub nie ma roli 'patient'
   */
  async updatePatientStatus(
    command: UpdatePatientStatusCommand
  ): Promise<UpdatePatientStatusResponse['patient']> {
    try {
      // 1. Pobierz obecny stan pacjenta
      const patient = await userRepository.findById(command.patientId)

      if (!patient || patient.role !== 'patient') {
        throw new NotFoundError('Pacjent nie został znaleziony')
      }

      // 2. Przygotuj dane do aktualizacji
      const now = new Date()
      const endedAt = command.status === 'ended' ? now : null
      const scheduledDeletionAt = command.status === 'ended' ? addMonths(now, 24) : null

      // 3. Zbuduj before snapshot (do audit log)
      const beforeSnapshot = {
        status: patient.status,
        endedAt: patient.endedAt,
        scheduledDeletionAt: patient.scheduledDeletionAt,
      }

      // 4. Wykonaj aktualizację
      const updatedPatient = await userRepository.updateStatus(command.patientId, {
        status: command.status,
        endedAt,
        scheduledDeletionAt,
        updatedAt: now,
      })

      // 5. Zbuduj after snapshot (z note jako metadane operacji)
      const afterSnapshot = {
        status: updatedPatient.status,
        endedAt: updatedPatient.endedAt,
        scheduledDeletionAt: updatedPatient.scheduledDeletionAt,
        note: command.note ?? null, // Note nie jest zapisywana w DB, tylko w audit log
      }

      // 6. Best-effort audit log (nie blokuje odpowiedzi)
      auditLogRepository
        .create({
          userId: command.dietitianId,
          action: 'update',
          tableName: 'users',
          recordId: command.patientId,
          before: beforeSnapshot,
          after: afterSnapshot,
        })
        .catch((err) => {
          console.error('[PatientService] Failed to create audit log:', err)
        })

      // 7. Best-effort analytics event (nie blokuje odpowiedzi)
      eventRepository
        .create({
          userId: command.dietitianId,
          eventType: 'update_patient_status',
          properties: {
            patientId: command.patientId,
            from: patient.status,
            to: updatedPatient.status,
          },
        })
        .catch((err) => {
          console.error('[PatientService] Failed to log analytics event:', err)
        })

      // 8. Zwróć DTO
      return {
        id: updatedPatient.id,
        firstName: updatedPatient.firstName,
        lastName: updatedPatient.lastName,
        status: updatedPatient.status,
        updatedAt: updatedPatient.updatedAt,
      }
    } catch (error) {
      console.error('[PatientService] Error updating patient status:', error)
      throw error
    }
  }
}

// Export singleton instance
export const patientService = new PatientService()
