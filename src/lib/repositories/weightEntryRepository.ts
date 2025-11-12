import { db } from '@/db'
import { weightEntries } from '../../db/schema'
import { eq, and, desc, lt, sql } from 'drizzle-orm'
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

      const result = await db
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
      const result = await db
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
      const result = await db
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
      const result = await db
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
   * Pobiera wpisy wagi dla użytkownika z paginacją
   *
   * @param userId - ID użytkownika
   * @param limit - Liczba wpisów do pobrania
   * @param offset - Offset dla paginacji
   * @returns Promise<WeightEntry[]> - lista wpisów
   */
  async getEntriesByUser(userId: string, limit: number = 30, offset: number = 0) {
    try {
      const result = await db
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
      const result = await db
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
}

// Export singleton instance
export const weightEntryRepository = new WeightEntryRepository()
