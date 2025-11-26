import type { Database } from '@/db'
import { consents } from '../../db/schema'
import type { Consent } from '../../db/schema'
// Import eq i desc dla Drizzle queries
import { eq, desc } from 'drizzle-orm'

/**
 * Repository Layer dla operacji na zgodach RODO (consents)
 *
 * Odpowiedzialności:
 * - Zapisywanie zgód użytkownika podczas rejestracji
 * - Pobieranie historii zgód użytkownika (RODO compliance)
 */
export class ConsentRepository {
  constructor(private db: Database) {}
  /**
   * Tworzy wiele zgód dla użytkownika (bulk insert)
   *
   * Używane do:
   * - Zapisania zgód podczas rejestracji pacjenta
   * - Zapewnienia zgodności z RODO (audit trail)
   *
   * UWAGA: Funkcja przyjmuje tablicę zgód i zapisuje je wszystkie w jednej operacji
   *
   * @param userId - ID użytkownika
   * @param consentList - Tablica zgód: { type, text, accepted }
   * @returns Promise<void>
   * @throws Error jeśli zapis się nie powiedzie
   */
  async createMany(
    userId: string,
    consentList: Array<{ type: string; text: string; accepted: boolean }>
  ): Promise<void> {
    try {
      // Mapuj dane wejściowe na format bazy danych
      const values = consentList.map((consent) => ({
        userId,
        consentType: consent.type,
        consentText: consent.text,
        accepted: consent.accepted,
        timestamp: new Date(),
      }))

      // Bulk insert wszystkich zgód
      await this.db.insert(consents).values(values)
    } catch (error) {
      console.error('[ConsentRepository] Error creating consents:', error)
      throw error
    }
  }

  /**
   * Pobiera wszystkie zgody użytkownika (dla eksportu danych RODO)
   *
   * Używane do:
   * - GET /api/user/export-data (prawo do przenoszenia danych)
   * - Audytu historii zgód
   *
   * @param userId - ID użytkownika
   * @returns Promise<Consent[]> - Lista wszystkich zgód użytkownika
   */
  async findByUserId(userId: string): Promise<Consent[]> {
    try {
      const userConsents = await this.db
        .select()
        .from(consents)
        .where(eq(consents.userId, userId))
        .orderBy(desc(consents.timestamp))

      return userConsents
    } catch (error) {
      console.error('[ConsentRepository] Error finding consents by user ID:', error)
      throw error
    }
  }
}

// Export singleton instance for use in services
import { db } from '@/db'
export const consentRepository = new ConsentRepository(db)
