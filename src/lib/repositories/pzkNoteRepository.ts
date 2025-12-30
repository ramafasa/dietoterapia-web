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

  /**
   * Upsert user's note for a material (create or replace)
   *
   * Uses ON CONFLICT to ensure idempotent behavior and prevent race conditions.
   * The UNIQUE constraint (user_id, material_id) ensures max 1 note per user per material.
   *
   * IDOR protection: always binds note to authenticated userId
   *
   * @param userId - User ID (must match authenticated user)
   * @param materialId - Material ID
   * @param content - Note content (1-10,000 chars, validated before calling)
   * @param now - Current timestamp for updatedAt (single source of truth)
   * @returns Updated note record with content and updatedAt
   *
   * @example
   * const note = await repo.upsertByUserAndMaterial(
   *   'user-123',
   *   'mat-456',
   *   'My updated note',
   *   new Date()
   * )
   * // Note created or updated successfully
   */
  async upsertByUserAndMaterial(
    userId: string,
    materialId: string,
    content: string,
    now: Date
  ): Promise<NoteRecord> {
    try {
      const records = await this.db
        .insert(pzkNotes)
        .values({
          userId,
          materialId,
          content,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [pzkNotes.userId, pzkNotes.materialId],
          set: {
            content,
            updatedAt: now,
          },
        })
        .returning({
          content: pzkNotes.content,
          updatedAt: pzkNotes.updatedAt,
        })

      return records[0]
    } catch (error) {
      console.error('[PzkNoteRepository] Error upserting note:', error)
      throw error
    }
  }

  /**
   * Delete user's note for a material
   *
   * Idempotent operation: returns successfully even if note doesn't exist.
   *
   * IDOR protection: always filters by (userId, materialId) pair
   *
   * @param userId - User ID (must match authenticated user)
   * @param materialId - Material ID
   * @returns void (idempotent - no error if note doesn't exist)
   *
   * @example
   * await repo.deleteByUserAndMaterial('user-123', 'mat-456')
   * // Note deleted (or already didn't exist)
   */
  async deleteByUserAndMaterial(
    userId: string,
    materialId: string
  ): Promise<void> {
    try {
      await this.db
        .delete(pzkNotes)
        .where(
          and(
            eq(pzkNotes.userId, userId),
            eq(pzkNotes.materialId, materialId)
          )
        )

      // Idempotent: no error if note didn't exist
    } catch (error) {
      console.error('[PzkNoteRepository] Error deleting note:', error)
      throw error
    }
  }
}
