import type { Database } from '@/db'
import { auditLog } from '../../db/schema'
import type { CreateAuditLogCommand } from '../../types'

/**
 * Repository Layer dla operacji na audit log
 *
 * Odpowiedzialności:
 * - Zapis audit trail dla operacji na danych wrażliwych
 * - Przechowywanie before/after snapshots dla compliance (RODO)
 */
export class AuditLogRepository {
  constructor(private db: Database) {}
  /**
   * Tworzy wpis audit log
   *
   * Używane do:
   * - Compliance (RODO) - ślad wszystkich operacji na danych zdrowotnych
   * - Debugging - analiza błędów i nieoczekiwanych zmian
   * - Security - wykrywanie nieautoryzowanych zmian
   *
   * @param command - CreateAuditLogCommand z danymi wpisu
   * @returns Promise<void> - nie zwracamy rekordu, tylko potwierdzenie zapisu
   */
  async create(command: CreateAuditLogCommand): Promise<void> {
    try {
      await this.db.insert(auditLog).values({
        userId: command.userId,
        action: command.action,
        tableName: command.tableName,
        recordId: command.recordId,
        before: command.before ?? null,
        after: command.after ?? null,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error('[AuditLogRepository] Error creating audit log entry:', error)
      // Don't throw - audit log failures shouldn't block main operations
      // Log to monitoring system (e.g., Sentry) in production
    }
  }
}

// Export singleton instance for use in services
import { db } from '@/db'
export const auditLogRepository = new AuditLogRepository(db)
