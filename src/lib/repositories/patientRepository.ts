import type { Database } from '@/db'
import { users, weightEntries } from '../../db/schema'
import { eq, and, sql, desc } from 'drizzle-orm'

/**
 * Repository Layer dla operacji na pacjentach (users z role='patient')
 *
 * Odpowiedzialności:
 * - Pobieranie listy pacjentów z informacjami operacyjnymi (lastWeightEntry, weeklyObligationMet)
 * - Filtrowanie po statusie pacjenta
 * - Paginacja offsetowa (limit, offset)
 * - Obliczenia związane z compliance (obowiązek tygodniowy)
 */

/**
 * Typ zwracany przez findPatients - pacjent z polami dodatkowymi
 */
export type PatientWithCompliance = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  age: number | null
  gender: string | null
  status: string | null
  createdAt: Date
  lastWeightEntry: Date | null
  weeklyObligationMet: boolean
}

export class PatientRepository {
  constructor(private db: Database) {}
  /**
   * Pobiera podstawowe informacje o pacjencie (PatientSummaryDTO)
   *
   * Używane do:
   * - Wyświetlania informacji o pacjencie w nagłówkach widoków dietetyka
   * - Endpoint GET /api/dietitian/patients/:patientId/weight
   *
   * @param patientId - UUID pacjenta
   * @returns Promise<PatientSummaryDTO | null> - Podstawowe dane pacjenta lub null jeśli nie istnieje
   */
  async getPatientSummary(patientId: string): Promise<{
    id: string
    firstName: string | null
    lastName: string | null
    status: string | null
  } | null> {
    try {
      const [patient] = await this.db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          status: users.status,
        })
        .from(users)
        .where(and(eq(users.id, patientId), eq(users.role, 'patient')))
        .limit(1)

      return patient ?? null
    } catch (error) {
      console.error('[PatientRepository] Error getting patient summary:', error)
      throw error
    }
  }

  /**
   * Liczy całkowitą liczbę pacjentów spełniających kryteria filtrowania
   *
   * Używane do:
   * - Obliczenia paginacji (total, hasMore)
   *
   * @param status - Status do filtrowania: 'active' | 'paused' | 'ended' | 'all'
   * @returns Promise<number> - Liczba pacjentów
   */
  async countPatients({ status }: { status: string }): Promise<number> {
    try {
      const whereConditions = [eq(users.role, 'patient')]

      // Filtrowanie po statusie (jeśli nie 'all')
      if (status !== 'all') {
        whereConditions.push(eq(users.status, status))
      }

      const [result] = await this.db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(users)
        .where(and(...whereConditions))

      return result?.count ?? 0
    } catch (error) {
      console.error('[PatientRepository] Error counting patients:', error)
      throw error
    }
  }

  /**
   * Pobiera listę pacjentów z informacjami operacyjnymi
   *
   * Dla każdego pacjenta oblicza:
   * - lastWeightEntry: data ostatniego wpisu wagi (może być null)
   * - weeklyObligationMet: czy pacjent dodał wagę w bieżącym tygodniu (Europe/Warsaw)
   *
   * Lista jest sortowana:
   * 1. Po lastWeightEntry DESC (nulls last) - pacjenci bez wpisów na końcu
   * 2. Po createdAt DESC - najnowsi pacjenci wyżej
   *
   * @param status - Status do filtrowania
   * @param limit - Maksymalna liczba wyników (1-100)
   * @param offset - Przesunięcie dla paginacji (≥0)
   * @returns Promise<PatientWithCompliance[]> - Lista pacjentów z polami dodatkowymi
   */
  async findPatients({
    status,
    limit,
    offset,
  }: {
    status: string
    limit: number
    offset: number
  }): Promise<PatientWithCompliance[]> {
    try {
      // Obliczenie początku i końca bieżącego tygodnia (Europe/Warsaw)
      // Tydzień zaczyna się w poniedziałek (ISO standard)
      const startOfWeekSql = sql`DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw')`
      const nextWeekStartSql = sql`(DATE_TRUNC('week', NOW() AT TIME ZONE 'Europe/Warsaw') + interval '1 week')`

      // Warunki filtrowania
      const whereConditions = [eq(users.role, 'patient')]
      if (status !== 'all') {
        whereConditions.push(eq(users.status, status))
      }

      // Zapytanie z LEFT JOIN LATERAL dla lastWeightEntry
      // oraz EXISTS dla weeklyObligationMet
      const query = db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          age: users.age,
          gender: users.gender,
          status: users.status,
          createdAt: users.createdAt,
          // Ostatni wpis wagi (może być null)
          lastWeightEntry: sql<Date | null>`(
            SELECT measurement_date
            FROM weight_entries
            WHERE user_id = "users"."id"
            ORDER BY measurement_date DESC
            LIMIT 1
          )`,
          // Czy pacjent dodał wpis w bieżącym tygodniu
          weeklyObligationMet: sql<boolean>`EXISTS (
            SELECT 1
            FROM weight_entries
            WHERE user_id = "users"."id"
              AND (measurement_date AT TIME ZONE 'Europe/Warsaw') >= ${startOfWeekSql}
              AND (measurement_date AT TIME ZONE 'Europe/Warsaw') < ${nextWeekStartSql}
          )`,
        })
        .from(users)
        .where(and(...whereConditions))
        .orderBy(
          // Sortowanie: najpierw po lastWeightEntry DESC (nulls last)
          sql`(
            SELECT measurement_date
            FROM weight_entries
            WHERE user_id = ${users.id}
            ORDER BY measurement_date DESC
            LIMIT 1
          ) DESC NULLS LAST`,
          // Następnie po createdAt DESC
          desc(users.createdAt)
        )
        .limit(limit)
        .offset(offset)

      const results = await query

      return results as PatientWithCompliance[]
    } catch (error) {
      console.error('[PatientRepository] Error finding patients:', error)
      throw error
    }
  }
}

// Export singleton instance for use in services
import { db } from '@/db'
export const patientRepository = new PatientRepository(db)
