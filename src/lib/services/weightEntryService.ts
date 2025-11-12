import { weightEntryRepository } from '../repositories/weightEntryRepository'
import { auditLogRepository } from '../repositories/auditLogRepository'
import { eventRepository } from '../repositories/eventRepository'
import type { CreateWeightEntryCommand, AnomalyWarning, GetWeightEntriesResponse, WeightEntryDTO, UpdateWeightEntryCommand, UpdateWeightEntryResponse } from '../../types'
import { differenceInDays, differenceInHours, startOfDay, endOfDay, addDays } from 'date-fns'
import { toZonedTime, fromZonedTime } from 'date-fns-tz'
import { db } from '@/db'

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
 * Custom error dla wygaśnięcia okna edycji (400 Bad Request)
 */
export class EditWindowExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EditWindowExpiredError'
  }
}

/**
 * Custom error dla braku uprawnień (403 Forbidden)
 */
export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

/**
 * Custom error dla nie znalezionego zasobu (404 Not Found)
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
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

  /**
   * Aktualizuje wpis wagi pacjenta (PATCH /api/weight/:id)
   *
   * Flow:
   * 1. Pobranie wpisu po ID dla użytkownika (IDOR-safe)
   * 2. Weryfikacja source='patient'
   * 3. Sprawdzenie okna edycji (do końca następnego dnia po measurementDate)
   * 4. Normalizacja wartości (zaokrąglenie wagi, trim notatki)
   * 5. Re-ewaluacja outlier (jeśli weight zmienione)
   * 6. Aktualizacja rekordu przez repository
   * 7. Zwrot DTO
   *
   * @param command - UpdateWeightEntryCommand z danymi do aktualizacji
   * @returns Promise<UpdateWeightEntryResponse['entry']> - zaktualizowany wpis
   * @throws NotFoundError - jeśli wpis nie istnieje lub nie należy do użytkownika
   * @throws ForbiddenError - jeśli source != 'patient'
   * @throws EditWindowExpiredError - jeśli okno edycji minęło
   */
  async updatePatientEntry(
    command: UpdateWeightEntryCommand
  ): Promise<UpdateWeightEntryResponse['entry']> {
    // 1. Pobranie wpisu po ID dla użytkownika (IDOR-safe)
    const entry = await weightEntryRepository.getByIdForUser(command.id, command.updatedBy)

    if (!entry) {
      throw new NotFoundError('Wpis wagi nie został znaleziony lub nie masz do niego dostępu')
    }

    // 2. Weryfikacja source='patient'
    if (entry.source !== 'patient') {
      throw new ForbiddenError(
        'Można edytować tylko wpisy utworzone przez pacjenta. Ten wpis został dodany przez dietetyka.'
      )
    }

    // 3. Sprawdzenie okna edycji (do końca następnego dnia po measurementDate w Europe/Warsaw)
    this.validateEditWindow(entry.measurementDate)

    // 4. Normalizacja wartości
    const normalizedWeight = command.weight !== undefined
      ? Math.round(command.weight * 10) / 10 // Zaokrąglenie do 0.1 kg
      : undefined

    const normalizedNote = command.note !== undefined
      ? command.note.trim()
      : undefined

    // 5. Re-ewaluacja outlier (jeśli weight zmienione)
    let isOutlier = entry.isOutlier
    let outlierConfirmed = entry.outlierConfirmed

    if (normalizedWeight !== undefined && normalizedWeight !== parseFloat(entry.weight)) {
      // Weight changed - re-evaluate outlier
      const anomalyResult = await this.detectAnomaly(
        entry.userId,
        normalizedWeight,
        entry.measurementDate
      )
      isOutlier = anomalyResult.isOutlier
      // Reset outlierConfirmed when weight changes
      outlierConfirmed = null
    }

    // 6. Prepare before/after snapshots for audit log
    const beforeSnapshot = {
      weight: parseFloat(entry.weight),
      note: entry.note,
      isOutlier: entry.isOutlier,
      outlierConfirmed: entry.outlierConfirmed,
    }

    const afterSnapshot = {
      weight: normalizedWeight ?? parseFloat(entry.weight),
      note: normalizedNote ?? entry.note,
      isOutlier,
      outlierConfirmed,
    }

    // 7. Aktualizacja rekordu przez repository
    const updatedEntry = await weightEntryRepository.updateEntry(entry.id, {
      weight: normalizedWeight,
      note: normalizedNote,
      isOutlier,
      outlierConfirmed,
      updatedBy: command.updatedBy,
    })

    // 8. Audit Log (async - nie blokuje zwrotu odpowiedzi)
    auditLogRepository.create({
      userId: command.updatedBy,
      action: 'update',
      tableName: 'weight_entries',
      recordId: entry.id,
      before: beforeSnapshot,
      after: afterSnapshot,
    }).catch(err => {
      console.error('[WeightEntryService] Failed to create audit log:', err)
      // Don't throw - audit failures shouldn't fail the main operation
    })

    // 9. Event tracking (async - nie blokuje zwrotu odpowiedzi)
    eventRepository.create({
      userId: command.updatedBy,
      eventType: 'edit_weight',
      properties: {
        source: 'patient',
        entryId: entry.id,
        weightChanged: normalizedWeight !== undefined,
        noteChanged: normalizedNote !== undefined,
      },
    }).catch(err => {
      console.error('[WeightEntryService] Failed to create event:', err)
      // Don't throw - event tracking failures shouldn't fail the main operation
    })

    // 10. Mapowanie do DTO (zgodnie z UpdateWeightEntryResponse)
    return {
      id: updatedEntry.id,
      userId: updatedEntry.userId,
      weight: parseFloat(updatedEntry.weight), // Convert decimal string to number
      measurementDate: updatedEntry.measurementDate,
      source: updatedEntry.source as 'patient' | 'dietitian',
      isBackfill: updatedEntry.isBackfill,
      isOutlier: updatedEntry.isOutlier,
      outlierConfirmed: updatedEntry.outlierConfirmed,
      note: updatedEntry.note,
      createdAt: updatedEntry.createdAt,
      updatedAt: updatedEntry.updatedAt!,
      updatedBy: updatedEntry.updatedBy!,
    }
  }

  /**
   * Waliduje okno edycji - max do końca następnego dnia po measurementDate
   *
   * Reguła: Pacjent może edytować wpis do końca następnego dnia po measurementDate
   * (w timezone Europe/Warsaw).
   *
   * Przykład:
   * - measurementDate: 2025-10-29 (dowolna godzina)
   * - deadline: 2025-10-30 23:59:59.999 Europe/Warsaw
   * - now: 2025-10-31 00:00:01 Europe/Warsaw → błąd (okno minęło)
   *
   * @param measurementDate - Data pomiaru wpisu
   * @throws EditWindowExpiredError - jeśli okno edycji minęło
   */
  private validateEditWindow(measurementDate: Date): void {
    const now = new Date()

    // Convert measurementDate to Europe/Warsaw and calculate deadline
    const measurementWarsaw = toZonedTime(measurementDate, this.TIMEZONE)
    const nextDayWarsaw = addDays(measurementWarsaw, 1)
    const deadlineWarsaw = endOfDay(nextDayWarsaw)

    // Convert deadline back to UTC for comparison with current time
    const deadlineUtc = fromZonedTime(deadlineWarsaw, this.TIMEZONE)

    if (now > deadlineUtc) {
      throw new EditWindowExpiredError(
        'Okres edycji tego wpisu wygasł. Możesz edytować wpis tylko do końca następnego dnia po dacie pomiaru.'
      )
    }
  }

  /**
   * Potwierdza lub odrzuca anomalię (outlier) dla wpisu wagi (POST /api/weight/:id/confirm)
   *
   * Flow:
   * 1. Pobranie wpisu przez repository
   * 2. Weryfikacja istnienia wpisu (404 jeśli brak)
   * 3. Autoryzacja (RBAC):
   *    - Pacjent: tylko własne wpisy (entry.userId === sessionUserId)
   *    - Dietetyk: wpisy pacjentów zgodnie z relacją (TODO: implement RBAC helper)
   * 4. Walidacja: wpis musi mieć isOutlier = true (400 jeśli nie)
   * 5. Idempotencja: jeśli outlierConfirmed już ustawione na żądaną wartość → zwróć bieżący stan
   * 6. Transakcja (TODO w kroku 4):
   *    - Aktualizacja outlierConfirmed przez repository
   *    - Audit log (action: 'update', table: 'weight_entries')
   *    - Event tracking (eventType: 'confirm_outlier')
   * 7. Zwrot DTO zgodnie z ConfirmOutlierResponse
   *
   * @param params - Parametry operacji
   * @param params.id - ID wpisu wagi (UUID)
   * @param params.confirmed - Czy anomalia jest potwierdzona (true) czy odrzucona (false)
   * @param params.sessionUserId - ID użytkownika z sesji (owner weryfikacja)
   * @param params.sessionUserRole - Rola użytkownika ('patient' | 'dietitian')
   * @returns Promise - DTO zgodny z ConfirmOutlierResponse['entry']
   * @throws NotFoundError - jeśli wpis nie istnieje
   * @throws ForbiddenError - jeśli brak uprawnień do wpisu
   * @throws BadRequestError - jeśli wpis nie jest outlier
   */
  async confirmOutlier(params: {
    id: string
    confirmed: boolean
    sessionUserId: string
    sessionUserRole: 'patient' | 'dietitian' | string
  }) {
    const { id, confirmed, sessionUserId, sessionUserRole } = params

    // 1. Pobranie wpisu przez repository
    const entry = await weightEntryRepository.findById(id)

    // 2. Weryfikacja istnienia wpisu
    if (!entry) {
      throw new NotFoundError('Wpis wagi nie został znaleziony')
    }

    // 3. Autoryzacja (RBAC)
    if (sessionUserRole === 'patient') {
      // Pacjent może potwierdzać tylko własne wpisy
      if (entry.userId !== sessionUserId) {
        throw new ForbiddenError('Nie masz uprawnień do potwierdzenia tego wpisu')
      }
    } else if (sessionUserRole === 'dietitian') {
      // TODO: Implement RBAC helper - canAccessPatientEntry(sessionUserId, entry.userId)
      // Na MVP zakładamy, że dietetyk ma dostęp do wszystkich swoich pacjentów
      // W produkcji należy sprawdzić relację dietitian-patient
      console.warn('[WeightEntryService] Dietitian RBAC not fully implemented - assuming access granted')
    } else {
      throw new ForbiddenError('Nieprawidłowa rola użytkownika')
    }

    // 4. Walidacja: wpis musi być outlier
    if (!entry.isOutlier) {
      throw new Error('Wpis nie jest oznaczony jako anomalia')
    }

    // 5. Idempotencja: jeśli już ustawione na żądaną wartość
    if (entry.outlierConfirmed === confirmed) {
      // Zwróć bieżący stan (200 OK - idempotent)
      return {
        id: entry.id,
        userId: entry.userId,
        weight: parseFloat(entry.weight),
        measurementDate: entry.measurementDate,
        source: entry.source as 'patient' | 'dietitian',
        isBackfill: entry.isBackfill,
        isOutlier: entry.isOutlier,
        outlierConfirmed: entry.outlierConfirmed,
        note: entry.note,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
      }
    }

    // 6. Prepare before/after snapshots for audit log
    const beforeSnapshot = {
      outlierConfirmed: entry.outlierConfirmed,
      isOutlier: entry.isOutlier,
    }

    const afterSnapshot = {
      outlierConfirmed: confirmed,
      isOutlier: entry.isOutlier,
    }

    // 7. Transakcja: update + audit log + event tracking
    // Note: Drizzle doesn't support transactions with returning() for all operations,
    // so we'll run update first, then audit/events asynchronously
    const updatedEntry = await weightEntryRepository.updateOutlierConfirmation(
      id,
      confirmed,
      sessionUserId
    )

    // 8. Audit Log (async - nie blokuje zwrotu odpowiedzi)
    auditLogRepository.create({
      userId: sessionUserId,
      action: 'update',
      tableName: 'weight_entries',
      recordId: entry.id,
      before: beforeSnapshot,
      after: afterSnapshot,
    }).catch(err => {
      console.error('[WeightEntryService] Failed to create audit log for confirm_outlier:', err)
      // Don't throw - audit failures shouldn't fail the main operation
    })

    // 9. Event tracking (async - nie blokuje zwrotu odpowiedzi)
    eventRepository.create({
      userId: sessionUserId,
      eventType: 'confirm_outlier',
      properties: {
        confirmed,
        source: entry.source,
        entryId: entry.id,
        role: sessionUserRole,
      },
    }).catch(err => {
      console.error('[WeightEntryService] Failed to create event for confirm_outlier:', err)
      // Don't throw - event tracking failures shouldn't fail the main operation
    })

    // 10. Zwrot DTO zgodnie z ConfirmOutlierResponse
    return {
      id: updatedEntry.id,
      userId: updatedEntry.userId,
      weight: parseFloat(updatedEntry.weight),
      measurementDate: updatedEntry.measurementDate,
      source: updatedEntry.source as 'patient' | 'dietitian',
      isBackfill: updatedEntry.isBackfill,
      isOutlier: updatedEntry.isOutlier,
      outlierConfirmed: updatedEntry.outlierConfirmed,
      note: updatedEntry.note,
      createdAt: updatedEntry.createdAt,
      updatedAt: updatedEntry.updatedAt!,
    }
  }
}

// Export singleton instance
export const weightEntryService = new WeightEntryService()
