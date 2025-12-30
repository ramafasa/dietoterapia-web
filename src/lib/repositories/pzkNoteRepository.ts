import type { Database } from '@/db'
import { pzkNotes } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

/**
 * PZK Note Repository
 *
 * Responsibilities:
 * - Fetch user's private note for a material
 * - IDOR protection: always query by (userId, materialId) pair
 * - Return fields needed for DTO mapping
 */

/**
 * Note record for DTO mapping
 */
export type NoteRecord = {
  content: string
  updatedAt: Date
}

export class PzkNoteRepository {
  constructor(private db: Database) {}

  /**
   * Get user's note for a material
   *
   * IDOR protection: queries by (userId, materialId) pair, never by materialId alone
   *
   * @param userId - User ID (must match authenticated user)
   * @param materialId - Material ID
   * @returns Note record or null if not found
   *
   * @example
   * const note = await repo.getByUserAndMaterial('user-123', 'mat-456')
   * if (note) {
   *   // User has a note for this material
   * }
   */
  async getByUserAndMaterial(
    userId: string,
    materialId: string
  ): Promise<NoteRecord | null> {
    try {
      const records = await this.db
        .select({
          content: pzkNotes.content,
          updatedAt: pzkNotes.updatedAt,
        })
        .from(pzkNotes)
        .where(
          and(
            eq(pzkNotes.userId, userId),
            eq(pzkNotes.materialId, materialId)
          )
        )
        .limit(1)

      return records[0] || null
    } catch (error) {
      console.error('[PzkNoteRepository] Error fetching note:', error)
      throw error
    }
  }
}
