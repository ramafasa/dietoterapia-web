import type { Database } from '@/db'
import { pzkModuleAccess } from '@/db/schema'
import { eq, and, isNull, lte, gt } from 'drizzle-orm'

/**
 * PZK Access Repository
 *
 * Responsibilities:
 * - Query active module access records for a user
 * - Enforce business rule: active = revokedAt IS NULL AND startAt <= now AND now < expiresAt
 */

/**
 * Minimal active access record (only fields needed for DTO mapping)
 */
export type ActiveAccessRecord = {
  module: number
  startAt: Date
  expiresAt: Date
}

export class PzkAccessRepository {
  constructor(private db: Database) {}

  /**
   * List all active module access records for a user
   *
   * Business rule for "active":
   * - revokedAt IS NULL (not revoked)
   * - startAt <= now (already started)
   * - expiresAt > now (not expired yet)
   *
   * @param userId - User ID to query access for
   * @param now - Current timestamp (single source of truth for request)
   * @returns Array of active access records, sorted by module ASC, startAt ASC
   *
   * @example
   * const records = await repo.listActiveAccessByUserId('user-123', new Date())
   * // [{ module: 1, startAt: Date, expiresAt: Date }, ...]
   */
  async listActiveAccessByUserId(
    userId: string,
    now: Date
  ): Promise<ActiveAccessRecord[]> {
    try {
      const records = await this.db
        .select({
          module: pzkModuleAccess.module,
          startAt: pzkModuleAccess.startAt,
          expiresAt: pzkModuleAccess.expiresAt,
        })
        .from(pzkModuleAccess)
        .where(
          and(
            eq(pzkModuleAccess.userId, userId),
            isNull(pzkModuleAccess.revokedAt),
            lte(pzkModuleAccess.startAt, now),
            gt(pzkModuleAccess.expiresAt, now)
          )
        )
        .orderBy(pzkModuleAccess.module, pzkModuleAccess.startAt)

      return records
    } catch (error) {
      console.error(
        '[PzkAccessRepository] Error listing active access:',
        error
      )
      throw error
    }
  }

  /**
   * Check if user has active access to a specific module
   *
   * Business rule for "active":
   * - revokedAt IS NULL (not revoked)
   * - startAt <= now (already started)
   * - expiresAt > now (not expired yet)
   *
   * @param userId - User ID to check access for
   * @param module - Module number (1, 2, or 3)
   * @param now - Current timestamp (single source of truth for request)
   * @returns True if user has active access to the module, false otherwise
   *
   * @example
   * const hasAccess = await repo.hasActiveAccessToModule('user-123', 2, new Date())
   * if (!hasAccess) {
   *   // User lacks access to module 2 → locked state
   * }
   */
  async hasActiveAccessToModule(
    userId: string,
    module: number,
    now: Date
  ): Promise<boolean> {
    try {
      const records = await this.db
        .select({
          module: pzkModuleAccess.module,
        })
        .from(pzkModuleAccess)
        .where(
          and(
            eq(pzkModuleAccess.userId, userId),
            eq(pzkModuleAccess.module, module),
            isNull(pzkModuleAccess.revokedAt),
            lte(pzkModuleAccess.startAt, now),
            gt(pzkModuleAccess.expiresAt, now)
          )
        )
        .limit(1)

      return records.length > 0
    } catch (error) {
      console.error(
        '[PzkAccessRepository] Error checking module access:',
        error
      )
      throw error
    }
  }
}