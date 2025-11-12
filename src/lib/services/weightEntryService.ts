import { weightEntryRepository } from '../repositories/weightEntryRepository'
import type { CreateWeightEntryCommand, AnomalyWarning, GetWeightEntriesResponse, WeightEntryDTO } from '../../types'
import { differenceInDays, differenceInHours, startOfDay } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/**
 * Custom error dla duplikatów wpisów (409 Conflict)
 */
export class DuplicateEntryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DuplicateEntryError'
  }
}

/**
 * Custom error dla przekroczenia limitu backfill (400 Bad Request)
 */
export class BackfillLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackfillLimitError'
  }
}

/**
 * Service Layer dla logiki biznesowej wpisów wagi
 *
 * Odpowiedzialności:
 * - Walidacja reguł biznesowych (backfill limit, anomaly detection)
 * - Orchestracja operacji (duplicate check, previous entry lookup, insert)
 * - Obliczanie flag (isBackfill, isOutlier)
 * - Generowanie warnings (anomaly detected)
 */
export class WeightEntryService {
  private readonly TIMEZONE = 'Europe/Warsaw'
  private readonly BACKFILL_LIMIT_DAYS = 7
  private readonly ANOMALY_THRESHOLD_KG = 3.0

  /**
   * Główna metoda tworzenia wpisu wagi
   *
   * Flow:
   * 1. Walidacja backfill limit (≤ 7 dni wstecz)
   * 2. Sprawdzenie duplikatu (unique constraint)
   * 3. Obliczenie flagi isBackfill
   * 4. Wykrywanie anomalii (zmiana > 3kg w ≤48h)
   * 5. Utworzenie wpisu przez repository
   * 6. Zwrot wyniku z warnings
   *
   * @param command - CreateWeightEntryCommand z danymi wpisu
   * @returns Promise z entry i warnings array
   * @throws DuplicateEntryError - jeśli wpis już istnieje
   * @throws BackfillLimitError - jeśli data > 7 dni wstecz
   */
  async createWeightEntry(command: CreateWeightEntryCommand) {
    // 1. Walidacja backfill limit
    this.validateBackfillLimit(command.measurementDate)

    // 2. Sprawdzenie duplikatu
    const isDuplicate = await weightEntryRepository.checkDuplicateEntry(
      command.userId,
      command.measurementDate
    )

    if (isDuplicate) {
      throw new DuplicateEntryError(
        'Wpis wagi dla tej daty już istnieje. Możesz edytować istniejący wpis.'
      )
    }

    // 3. Obliczenie flagi isBackfill
    const isBackfill = this.isBackfillEntry(command.measurementDate)

    // 4. Wykrywanie anomalii
    const anomalyResult = await this.detectAnomaly(
      command.userId,
      command.weight,
      command.measurementDate
    )

    // 5. Utworzenie wpisu przez repository
    const entry = await weightEntryRepository.createEntry(
      command,
      isBackfill,
      anomalyResult.isOutlier
    )

    // 6. Zwrot wyniku z warnings
    return {
      entry,
      warnings: anomalyResult.warnings,
    }
  }

  /**
   * Walidacja backfill limit - max 7 dni wstecz
   *
   * Sprawdza czy measurementDate nie jest wcześniejsza niż 7 dni od dziś.
   * Używa timezone Europe/Warsaw dla kalkulacji.
   *
   * @param measurementDate - Data pomiaru
   * @throws BackfillLimitError - jeśli data > 7 dni wstecz
   */
  private validateBackfillLimit(measurementDate: Date): void {
    const now = new Date()
    const nowWarsaw = toZonedTime(now, this.TIMEZONE)
    const measurementWarsaw = toZonedTime(measurementDate, this.TIMEZONE)

    const daysDifference = differenceInDays(nowWarsaw, measurementWarsaw)

    if (daysDifference > this.BACKFILL_LIMIT_DAYS) {
      throw new BackfillLimitError(
        `Możesz dodać wpis wagi maksymalnie ${this.BACKFILL_LIMIT_DAYS} dni wstecz. ` +
          `Data pomiaru jest ${daysDifference} dni wstecz.`
      )
    }

    // Zabezpieczenie: nie można dodawać wpisów w przyszłości
    if (daysDifference < 0) {
      throw new BackfillLimitError(
        'Nie można dodać wpisu wagi z przyszłą datą.'
      )
    }
  }

  /**
   * Sprawdza czy wpis jest backfill (data < dziś)
   *
   * Porównuje tylko daty (bez czasu) w timezone Europe/Warsaw.
   * Zwraca true jeśli measurementDate < dzisiaj.
   *
   * @param measurementDate - Data pomiaru
   * @returns boolean - true jeśli backfill
   */
  private isBackfillEntry(measurementDate: Date): boolean {
    const now = new Date()
    const nowWarsaw = toZonedTime(now, this.TIMEZONE)
    const measurementWarsaw = toZonedTime(measurementDate, this.TIMEZONE)

    const todayStart = startOfDay(nowWarsaw)
    const measurementStart = startOfDay(measurementWarsaw)

    return measurementStart < todayStart
  }

  /**
   * Wykrywa anomalie w zmianach wagi (> 3kg w ≤48h)
   *
   * Algorytm:
   * 1. Pobranie ostatniego wpisu użytkownika PRZED measurement date (obsługa backfill)
   * 2. Jeśli brak poprzedniego wpisu → brak anomalii
   * 3. Obliczenie zmiany wagi (delta)
   * 4. Obliczenie czasu między pomiarami (hours)
   * 5. Jeśli delta > 3kg I czas ≤ 48h → anomalia
   *
   * @param userId - ID użytkownika
   * @param currentWeight - Aktualna waga (nowy wpis)
   * @param measurementDate - Data pomiaru
   * @returns Object z isOutlier flag i warnings array
   */
  private async detectAnomaly(
    userId: string,
    currentWeight: number,
    measurementDate: Date
  ): Promise<{
    isOutlier: boolean
    warnings: AnomalyWarning[]
  }> {
    // 1. Pobranie ostatniego wpisu PRZED measurement date (obsługa backfill)
    const previousEntry = await weightEntryRepository.getPreviousEntry(userId, measurementDate)

    // 2. Brak poprzedniego wpisu → brak anomalii
    if (!previousEntry) {
      return {
        isOutlier: false,
        warnings: [],
      }
    }

    // 3. Obliczenie zmiany wagi
    const previousWeight = parseFloat(previousEntry.weight)
    const weightChange = Math.abs(currentWeight - previousWeight)

    // 4. Obliczenie czasu między pomiarami
    const hoursDifference = Math.abs(
      differenceInHours(measurementDate, previousEntry.measurementDate)
    )

    // 5. Detekcja anomalii: zmiana > 3kg I czas ≤ 48h
    const isAnomaly =
      weightChange > this.ANOMALY_THRESHOLD_KG && hoursDifference <= 48

    if (isAnomaly) {
      const warning: AnomalyWarning = {
        type: 'anomaly_detected',
        message:
          `Wykryto nietypową zmianę wagi: ${weightChange.toFixed(1)} kg w ${hoursDifference} godzin. ` +
          `Jeśli pomiar jest prawidłowy, możesz go potwierdzić.`,
        previousWeight,
        previousDate: previousEntry.measurementDate.toISOString(),
        change: currentWeight - previousWeight, // Może być ujemna (strata wagi)
      }

      return {
        isOutlier: true,
        warnings: [warning],
      }
    }

    return {
      isOutlier: false,
      warnings: [],
    }
  }

  /**
   * Pobiera historię wpisów wagi dla pacjenta (GET /api/weight)
   *
   * Features:
   * - Filtrowanie po zakresie dat (startDate, endDate)
   * - Keyset pagination (cursor-based)
   * - Mapowanie do DTO z konwersją typów
   * - Obliczanie hasMore i nextCursor
   *
   * @param params - Query parameters
   * @param params.userId - ID użytkownika (z sesji)
   * @param params.startDate - Data początkowa (opcjonalne, format: YYYY-MM-DD)
   * @param params.endDate - Data końcowa (opcjonalne, format: YYYY-MM-DD)
   * @param params.limit - Liczba wpisów (domyślnie 30, max 100)
   * @param params.cursor - Cursor dla keyset pagination (ISO timestamp)
   * @returns Promise<GetWeightEntriesResponse> - entries + pagination info
   */
  async listPatientEntries(params: {
    userId: string
    startDate?: string
    endDate?: string
    limit?: number
    cursor?: string
  }): Promise<GetWeightEntriesResponse> {
    const { userId, startDate, endDate, limit = 30, cursor } = params

    // Fetch entries from repository (limit+1 for hasMore detection)
    const results = await weightEntryRepository.findByUserWithFilters({
      userId,
      startDate,
      endDate,
      limit,
      cursor,
    })

    // Determine hasMore and slice to actual limit
    const hasMore = results.length > limit
    const entries = results.slice(0, limit)

    // Calculate nextCursor (last entry's measurementDate)
    const nextCursor = hasMore && entries.length > 0
      ? entries[entries.length - 1].measurementDate.toISOString()
      : null

    // Map to DTO (convert types)
    const entriesDTO: WeightEntryDTO[] = entries.map((entry) => ({
      id: entry.id,
      userId: entry.userId,
      weight: parseFloat(entry.weight), // Convert decimal string to number
      measurementDate: entry.measurementDate,
      source: entry.source as 'patient' | 'dietitian',
      isBackfill: entry.isBackfill,
      isOutlier: entry.isOutlier,
      outlierConfirmed: entry.outlierConfirmed,
      note: entry.note,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
    }))

    return {
      entries: entriesDTO,
      pagination: {
        hasMore,
        nextCursor,
      },
    }
  }
}

// Export singleton instance
export const weightEntryService = new WeightEntryService()
