import type { Database } from '@/db'
import { events } from '../../db/schema'
import type { CreateEventCommand } from '../../types'

/**
 * Repository Layer dla operacji na events (analytics)
 *
 * Odpowiedzialności:
 * - Zapis zdarzeń użytkownika dla analytics
 * - Tracking user behavior (add_weight, edit_weight, reminder clicks, etc.)
 */
export class EventRepository {
  constructor(private db: Database) {}
  /**
   * Tworzy event analytics
   *
   * Używane do:
   * - Analytics - obliczanie KPI (weekly compliance, reminder effectiveness)
   * - User behavior tracking - analiza flow użytkownika
   * - A/B testing - porównanie skuteczności różnych podejść
   *
   * @param command - CreateEventCommand z danymi eventu
   * @returns Promise<void> - nie zwracamy rekordu, tylko potwierdzenie zapisu
   */
  async create(command: CreateEventCommand): Promise<void> {
    try {
      await this.db.insert(events).values({
        userId: command.userId,
        eventType: command.eventType,
        properties: command.properties ?? null,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error('[EventRepository] Error creating event:', error)
      // Don't throw - event tracking failures shouldn't block main operations
      // Log to monitoring system (e.g., Sentry) in production
    }
  }
}

// Export singleton instance for use in services
import { db } from '@/db'
export const eventRepository = new EventRepository(db)
