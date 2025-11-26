import type { Database } from '@/db'
import { weightEntries } from '../../db/schema'
import { eq, and, desc, lt, gte, sql } from 'drizzle-orm'
import type { CreateWeightEntryCommand } from '../../types'
import { format } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'

/**
 * Repository Layer dla operacji na wpisach wagi
 *
 * Odpowiedzialności:
 * - Dostęp do bazy danych (Drizzle ORM)
 * - Queries z obsługą timezone Europe/Warsaw
 * - Operacje CRUD na tabeli weight_entries
 */
export class WeightEntryRepository {
  constructor(private db: Database) {}
  /**
   * Sprawdza czy wpis wagi już istnieje dla danego użytkownika i daty
   *
   * Używa unique constraint z timezone Europe/Warsaw:
   * - Konwertuje measurementDate do Europe/Warsaw
   * - Porównuje tylko datę (bez czasu)
   * - Zwraca true jeśli wpis istnieje
   *
   * @param userId - ID użytkownika
   * @param measurementDate - Data pomiaru w formacie Date object
   * @returns Promise<boolean> - true jeśli wpis istnieje
   */
  async checkDuplicateEntry(userId: string, measurementDate: Date): Promise<boolean> {
    try {
      // Convert Date to date string in Europe/Warsaw timezone for SQL comparison
      const measurementWarsaw = toZonedTime(measurementDate, 'Europe/Warsaw')
      const dateString = format(measurementWarsaw, 'yyyy-MM-dd')

      const result = await this.db
        .select({ id: weightEntries.id })
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, userId),
            sql`DATE(${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw') = ${dateString}::date`
          )
        )
        .limit(1)

      return result.length > 0
    } catch (error) {
      console.error('[WeightEntryRepository] Error checking duplicate entry:', error)
      throw error
    }
  }

  /**
   * Pobiera ostatni wpis wagi dla użytkownika PRZED określoną datą (dla anomaly detection)
   *
   * Używane do:
   * - Wykrywania anomalii (zmiana > 3kg w 48h)
   * - Porównania z poprzednią wagą (chronologicznie)
   * - Obsługi backfill (ignoruje wpisy z przyszłości względem nowego wpisu)
   *
   * @param userId - ID użytkownika
   * @param beforeDate - Data przed którą szukamy wpisu (measurement date nowego wpisu)
   * @returns Promise<WeightEntry | null> - ostatni wpis przed beforeDate lub null jeśli brak
   */
  async getPreviousEntry(userId: string, beforeDate: Date) {
    try {
      const result = await this.db
        .select()
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, userId),
            lt(weightEntries.measurementDate, beforeDate)
          )
        )
        .orderBy(desc(weightEntries.measurementDate))
        .limit(1)

      return result.length > 0 ? result[0] : null
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching previous entry:', error)
      throw error
    }
  }

  /**
   * Tworzy nowy wpis wagi w bazie danych
   *
   * Wstawia rekord z:
   * - Danymi wagi (weight, measurementDate, note)
   * - Metadanymi (source, isBackfill, isOutlier)
   * - Audyt (createdBy, createdAt)
   *
   * @param command - CreateWeightEntryCommand z danymi wpisu
   * @param isBackfill - Czy wpis jest backfill (obliczone w Service Layer)
   * @param isOutlier - Czy wpis jest anomalią (obliczone w Service Layer)
   * @returns Promise<WeightEntry> - utworzony wpis z ID
   */
  async createEntry(
    command: CreateWeightEntryCommand,
    isBackfill: boolean = false,
    isOutlier: boolean = false
  ) {
    try {
      const result = await this.db
        .insert(weightEntries)
        .values({
          userId: command.userId,
          weight: command.weight.toString(), // decimal przechowywany jako string w Drizzle
          measurementDate: command.measurementDate,
          source: command.source,
          isBackfill,
          isOutlier,
          outlierConfirmed: false,
          note: command.note ?? null,
          createdBy: command.createdBy,
          createdAt: new Date(),
        })
        .returning()

      if (result.length === 0) {
        throw new Error('Failed to create weight entry - no rows returned')
      }

      return result[0]
    } catch (error) {
      console.error('[WeightEntryRepository] Error creating entry:', error)
      throw error
    }
  }

  /**
   * Pobiera wpis wagi po ID (dla operacji PATCH/DELETE)
   *
   * @param id - ID wpisu wagi
   * @returns Promise<WeightEntry | null> - wpis lub null jeśli nie istnieje
   */
  async getEntryById(id: string) {
    try {
      const result = await this.db
        .select()
        .from(weightEntries)
        .where(eq(weightEntries.id, id))
        .limit(1)

      return result.length > 0 ? result[0] : null
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching entry by ID:', error)
      throw error
    }
  }

  /**
   * Pobiera wpis wagi po ID dla konkretnego użytkownika (IDOR-safe)
   *
   * Używane w PATCH/DELETE dla weryfikacji właścicielstwa.
   *
   * @param id - ID wpisu wagi
   * @param userId - ID użytkownika (weryfikacja właścicielstwa)
   * @returns Promise<WeightEntry | null> - wpis lub null jeśli nie istnieje/nie należy do usera
   */
  async getByIdForUser(id: string, userId: string) {
    try {
      const result = await this.db
        .select()
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.id, id),
            eq(weightEntries.userId, userId)
          )
        )
        .limit(1)

      return result.length > 0 ? result[0] : null
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching entry by ID for user:', error)
      throw error
    }
  }

  /**
   * Aktualizuje wpis wagi (PATCH /api/weight/:id)
   *
   * Aktualizuje pola:
   * - weight (opcjonalne)
   * - note (opcjonalne)
   * - isOutlier (re-ewaluacja)
   * - outlierConfirmed (reset przy zmianie wagi)
   * - updatedBy
   * - updatedAt (automatycznie)
   *
   * @param id - ID wpisu wagi
   * @param patch - Pola do aktualizacji
   * @returns Promise<WeightEntry> - zaktualizowany wpis
   */
  async updateEntry(
    id: string,
    patch: {
      weight?: number
      note?: string
      isOutlier?: boolean
      outlierConfirmed?: boolean | null
      updatedBy: string
    }
  ) {
    try {
      // Prepare values for update
      const values: any = {
        updatedBy: patch.updatedBy,
        updatedAt: new Date(),
      }

      // Add optional fields if provided
      if (patch.weight !== undefined) {
        values.weight = patch.weight.toString() // decimal stored as string
      }
      if (patch.note !== undefined) {
        values.note = patch.note
      }
      if (patch.isOutlier !== undefined) {
        values.isOutlier = patch.isOutlier
      }
      if (patch.outlierConfirmed !== undefined) {
        values.outlierConfirmed = patch.outlierConfirmed
      }

      const result = await this.db
        .update(weightEntries)
        .set(values)
        .where(eq(weightEntries.id, id))
        .returning()

      if (result.length === 0) {
        throw new Error('Failed to update weight entry - no rows returned')
      }

      return result[0]
    } catch (error) {
      console.error('[WeightEntryRepository] Error updating entry:', error)
      throw error
    }
  }

  /**
   * Pobiera wpisy wagi dla użytkownika z paginacją
   *
   * @param userId - ID użytkownika
   * @param limit - Liczba wpisów do pobrania
   * @param offset - Offset dla paginacji
   * @returns Promise<WeightEntry[]> - lista wpisów
   */
  async getEntriesByUser(userId: string, limit: number = 30, offset: number = 0) {
    try {
      const result = await this.db
        .select()
        .from(weightEntries)
        .where(eq(weightEntries.userId, userId))
        .orderBy(desc(weightEntries.measurementDate))
        .limit(limit)
        .offset(offset)

      return result
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching entries by user:', error)
      throw error
    }
  }

  /**
   * Pobiera wpisy wagi dla użytkownika z filtrami i keyset pagination
   *
   * Używane przez GET /api/weight endpoint.
   *
   * Features:
   * - Filtrowanie po zakresie dat (startDate, endDate) w timezone Europe/Warsaw
   * - Keyset pagination (cursor-based) po measurement_date DESC
   * - Zwraca limit+1 rekordów dla detekcji hasMore
   *
   * @param params - Parametry zapytania
   * @param params.userId - ID użytkownika (wymagane)
   * @param params.startDate - Data początkowa (opcjonalne, format: YYYY-MM-DD)
   * @param params.endDate - Data końcowa (opcjonalne, format: YYYY-MM-DD)
   * @param params.limit - Liczba wpisów (domyślnie 30, max 100)
   * @param params.cursor - Cursor dla keyset pagination (ISO timestamp)
   * @returns Promise<WeightEntry[]> - lista wpisów (limit+1)
   */
  async findByUserWithFilters(params: {
    userId: string
    startDate?: string
    endDate?: string
    limit?: number
    cursor?: string
  }) {
    try {
      const { userId, startDate, endDate, limit = 30, cursor } = params

      // Build WHERE conditions
      const conditions = [eq(weightEntries.userId, userId)]

      // Keyset pagination: measurement_date < cursor
      if (cursor) {
        const cursorDate = new Date(cursor)
        conditions.push(lt(weightEntries.measurementDate, cursorDate))
      }

      // Date range filters (Europe/Warsaw timezone)
      // startDate - interpretujemy jako początek dnia w Warsaw TZ
      if (startDate) {
        // startDate w formacie YYYY-MM-DD → 00:00:00 w Europe/Warsaw
        conditions.push(
          sql`${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw' >= ${startDate}::date`
        )
      }

      // endDate - interpretujemy jako koniec dnia w Warsaw TZ (23:59:59.999)
      if (endDate) {
        // endDate w formacie YYYY-MM-DD → następny dzień 00:00:00 (exclusive)
        conditions.push(
          sql`${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw' < (${endDate}::date + interval '1 day')`
        )
      }

      // Execute query with limit+1 for hasMore detection
      const result = await this.db
        .select()
        .from(weightEntries)
        .where(and(...conditions))
        .orderBy(desc(weightEntries.measurementDate))
        .limit(limit + 1)

      return result
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching entries with filters:', error)
      throw error
    }
  }

  /**
   * Aktualizuje potwierdzenie anomalii dla wpisu wagi (POST /api/weight/:id/confirm)
   *
   * Aktualizuje tylko pola:
   * - outlierConfirmed (boolean)
   * - updatedBy (string)
   * - updatedAt (timestamp - automatycznie)
   *
   * Używane wyłącznie do oznaczania anomalii jako potwierdzone/odrzucone.
   *
   * @param id - ID wpisu wagi
   * @param confirmed - Czy anomalia jest potwierdzona (true) czy odrzucona (false)
   * @param updatedBy - ID użytkownika aktualizującego (patient lub dietitian)
   * @returns Promise<WeightEntry> - zaktualizowany wpis
   */
  async updateOutlierConfirmation(
    id: string,
    confirmed: boolean,
    updatedBy: string
  ) {
    try {
      const result = await this.db
        .update(weightEntries)
        .set({
          outlierConfirmed: confirmed,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(weightEntries.id, id))
        .returning()

      if (result.length === 0) {
        throw new Error('Failed to update outlier confirmation - no rows returned')
      }

      return result[0]
    } catch (error) {
      console.error('[WeightEntryRepository] Error updating outlier confirmation:', error)
      throw error
    }
  }

  /**
   * Alias dla getEntryById - używany w nowej logice confirmOutlier
   *
   * @param id - ID wpisu wagi
   * @returns Promise<WeightEntry | null> - wpis lub null jeśli nie istnieje
   */
  async findById(id: string) {
    return this.getEntryById(id)
  }

  /**
   * Usuwa wpis wagi z bazy danych (DELETE /api/weight/:id)
   *
   * Uwaga: Nie sprawdza uprawnień - to zadanie Service Layer.
   * Repository wykonuje tylko operację DELETE w bazie.
   *
   * @param id - ID wpisu wagi do usunięcia
   * @returns Promise<void>
   */
  async deleteEntry(id: string): Promise<void> {
    try {
      await this.db.delete(weightEntries).where(eq(weightEntries.id, id))
    } catch (error) {
      console.error('[WeightEntryRepository] Error deleting entry:', error)
      throw error
    }
  }

  /**
   * Zlicza wszystkie wpisy wagi dla użytkownika
   *
   * Używane w GET /api/dietitian/patients/:patientId dla statystyk.
   *
   * @param userId - ID użytkownika
   * @returns Promise<number> - liczba wpisów
   */
  async countByUser(userId: string): Promise<number> {
    try {
      const result = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(weightEntries)
        .where(eq(weightEntries.userId, userId))

      return result[0]?.count ?? 0
    } catch (error) {
      console.error('[WeightEntryRepository] Error counting entries by user:', error)
      throw error
    }
  }

  /**
   * Pobiera datę ostatniego wpisu wagi dla użytkownika
   *
   * Używane w GET /api/dietitian/patients/:patientId dla statystyk.
   *
   * @param userId - ID użytkownika
   * @returns Promise<Date | null> - data ostatniego wpisu lub null jeśli brak wpisów
   */
  async getLastEntryDate(userId: string): Promise<Date | null> {
    try {
      const result = await this.db
        .select({ maxDate: sql<string | null>`MAX(${weightEntries.measurementDate})` })
        .from(weightEntries)
        .where(eq(weightEntries.userId, userId))

      // Convert string timestamp to Date object, or return null if no entries
      const maxDate = result[0]?.maxDate
      return maxDate ? new Date(maxDate) : null
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching last entry date:', error)
      throw error
    }
  }

  /**
   * Sprawdza czy pacjent dodał wpis wagi w bieżącym tygodniu (Europe/Warsaw)
   *
   * Używane przez:
   * - GET /api/dietitian/patients/:patientId/weight (weeklyObligationMet)
   *
   * Tydzień: poniedziałek 00:00 - niedziela 23:59:59 (ISO standard)
   *
   * @param userId - ID użytkownika
   * @returns Promise<boolean> - true jeśli pacjent ma wpis w bieżącym tygodniu
   */
  async hasEntryInCurrentWeek(userId: string): Promise<boolean> {
    try {
      // Obliczenie początku i końca bieżącego tygodnia (Europe/Warsaw)
      const startOfWeekSql = sql`DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw')`
      const nextWeekStartSql = sql`(DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw') + interval '1 week')`

      const result = await this.db
        .select({ exists: sql<boolean>`1` })
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, userId),
            sql`(${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw') >= ${startOfWeekSql}`,
            sql`(${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw') < ${nextWeekStartSql}`
          )
        )
        .limit(1)

      return result.length > 0
    } catch (error) {
      console.error('[WeightEntryRepository] Error checking weekly obligation:', error)
      throw error
    }
  }

  /**
   * Pobiera listę poniedziałków (week_start) tygodni z >=1 wpisem wagi
   *
   * Używane w GET /api/dietitian/patients/:patientId dla obliczania:
   * - weeklyComplianceRate
   * - currentStreak
   * - longestStreak
   *
   * Zwraca posortowaną listę poniedziałków (DESC) w timezone Europe/Warsaw.
   *
   * @param userId - ID użytkownika
   * @param weeksWindow - Liczba tygodni do sprawdzenia wstecz (domyślnie 52)
   * @returns Promise<Date[]> - lista poniedziałków tygodni z wpisami
   */
  async getWeeklyPresence(userId: string, weeksWindow: number = 52): Promise<Date[]> {
    try {
      // PostgreSQL date_trunc('week', timestamp) zwraca poniedziałek danego tygodnia w UTC
      // Używamy AT TIME ZONE 'Europe/Warsaw' aby measurement_date było interpretowane w Warsaw TZ
      const result = await this.db
        .select({
          weekStart: sql<string>`DATE_TRUNC('week', ${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw')`,
        })
        .from(weightEntries)
        .where(eq(weightEntries.userId, userId))
        .groupBy(sql`DATE_TRUNC('week', ${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw')`)
        .orderBy(sql`DATE_TRUNC('week', ${weightEntries.measurementDate} AT TIME ZONE 'Europe/Warsaw') DESC`)
        .limit(weeksWindow)

      // Convert string timestamps to Date objects
      return result.map(r => new Date(r.weekStart))
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching weekly presence:', error)
      throw error
    }
  }

  /**
   * Pobiera wpisy wagi dla pacjenta w określonym zakresie dat
   *
   * Używane przez:
   * - GET /api/dietitian/patients/:patientId/chart (wykres wagi)
   *
   * Zwraca pełne wpisy posortowane po measurement_date ASC (dla obliczeń MA7 i statystyk).
   * Timezone: Europe/Warsaw
   *
   * @param patientId - UUID pacjenta
   * @param startDate - Data początkowa (Date object, początek dnia w UTC) - inclusive
   * @param endDate - Data końcowa (Date object, początek następnego dnia w UTC) - exclusive
   * @returns Promise<WeightEntry[]> - lista wpisów posortowana po measurement_date ASC
   */
  async findByPatientAndDateRange(
    patientId: string,
    startDate: Date,
    endDate: Date
  ) {
    try {
      const result = await this.db
        .select()
        .from(weightEntries)
        .where(
          and(
            eq(weightEntries.userId, patientId),
            gte(weightEntries.measurementDate, startDate),
            lt(weightEntries.measurementDate, endDate)  // exclusive endDate
          )
        )
        .orderBy(weightEntries.measurementDate, weightEntries.createdAt)

      return result
    } catch (error) {
      console.error('[WeightEntryRepository] Error fetching entries by date range:', error)
      throw error
    }
  }
}

// Export singleton instance for use in services
import { db } from '@/db'
export const weightEntryRepository = new WeightEntryRepository(db)
