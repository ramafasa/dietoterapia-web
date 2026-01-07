import type { Database } from '@/db'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import type {
  PzkAccessSummary,
  PzkAccessRecord,
  PzkModuleNumber,
} from '@/types/pzk-dto'

/**
 * PZK Access Service
 *
 * Responsibilities:
 * - Business logic for access summary generation
 * - Mapping from DB records to DTOs
 * - Single source of truth for "now" timestamp
 */
export class PzkAccessService {
  private repository: PzkAccessRepository

  constructor(db: Database) {
    this.repository = new PzkAccessRepository(db)
  }

  /**
   * Get access summary for a user
   *
   * Returns a summary of all active module access for the user, including:
   * - hasAnyActiveAccess: boolean flag for UI gating
   * - activeModules: unique list of module numbers (1, 2, 3)
   * - access: detailed list of access records with ISO timestamps
   * - serverTime: ISO timestamp for client sync
   *
   * Business logic:
   * - Uses single "now" timestamp for consistency
   * - activeModules derived from unique module values in access
   * - Dates converted to ISO 8601 strings for JSON transport
   *
   * @param userId - User ID to get access summary for
   * @param now - Optional timestamp (defaults to new Date())
   * @returns PzkAccessSummary DTO
   *
   * @example
   * const summary = await service.getAccessSummary('user-123')
   * // {
   * //   hasAnyActiveAccess: true,
   * //   activeModules: [1, 2],
   * //   access: [{ module: 1, startAt: '2025-01-01T...', expiresAt: '2026-01-01T...' }, ...],
   * //   serverTime: '2025-12-30T12:00:00.000Z'
   * // }
   */
  async getAccessSummary(
    userId: string,
    now: Date = new Date()
  ): Promise<PzkAccessSummary> {
    try {
      // Fetch active access records from repository
      const activeRecords = await this.repository.listActiveAccessByUserId(
        userId,
        now
      )

      // Map DB records to DTO (Date → ISO string)
      const access: PzkAccessRecord[] = activeRecords.map((record) => ({
        module: this.validateModuleNumber(record.module),
        startAt: record.startAt.toISOString(),
        expiresAt: record.expiresAt.toISOString(),
      }))

      // Compute activeModules (unique, sorted)
      const activeModules = Array.from(
        new Set(access.map((a) => a.module))
      ).sort((a, b) => a - b) as PzkModuleNumber[]

      // Compute hasAnyActiveAccess flag
      const hasAnyActiveAccess = activeModules.length > 0

      // Return DTO
      return {
        hasAnyActiveAccess,
        activeModules,
        access,
        serverTime: now.toISOString(),
      }
    } catch (error) {
      console.error('[PzkAccessService] Error getting access summary:', error)
      throw error
    }
  }

  /**
   * Validate and cast module number to PzkModuleNumber type
   *
   * Database CHECK constraint ensures module is 1, 2, or 3,
   * but we validate at runtime to satisfy TypeScript.
   *
   * @param module - Module number from database
   * @returns PzkModuleNumber (1 | 2 | 3)
   * @throws Error if module is not 1, 2, or 3 (data integrity issue)
   */
  private validateModuleNumber(module: number): PzkModuleNumber {
    if (module !== 1 && module !== 2 && module !== 3) {
      // This should never happen due to DB CHECK constraint
      // If it does, it indicates data integrity issue
      throw new Error(
        `Invalid module number in database: ${module}. Expected 1, 2, or 3.`
      )
    }
    return module as PzkModuleNumber
  }
}
