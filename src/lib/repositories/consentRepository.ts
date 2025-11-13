import { db } from '@/db'
import { consents } from '../../db/schema'
import type { Consent } from '../../db/schema'

/**
 * Repository Layer dla operacji na zgodach RODO (consents)
 *
 * Odpowiedzialności:
 * - Zapisywanie zgód użytkownika podczas rejestracji
 * - Pobieranie historii zgód użytkownika (RODO compliance)
 */
export class ConsentRepository {
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
      await db.insert(consents).values(values)
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
      const userConsents = await db
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

// Import eq i desc dla Drizzle queries
import { eq, desc } from 'drizzle-orm'

// Export singleton instance
export const consentRepository = new ConsentRepository()
