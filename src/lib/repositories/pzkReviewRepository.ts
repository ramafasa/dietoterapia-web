import type { Database } from '@/db'
import { pzkReviews, users } from '@/db/schema'
import { eq, and, or, lt, sql } from 'drizzle-orm'

/**
 * PZK Review Repository
 *
 * Responsibilities:
 * - Fetch reviews with pagination (cursor-based keyset pagination)
 * - Join with users table to get author firstName
 * - CRUD operations for user's review (one review per user)
 * - Return fields needed for DTO mapping
 */

/**
 * Review record for list (with author firstName)
 */
export type ReviewListRecord = {
  id: string
  authorFirstName: string | null
  rating: number
  content: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Review record for "my review" (without author)
 */
export type MyReviewRecord = {
  id: string
  rating: number
  content: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Sort options for review listing
 */
export type ReviewSortOption = 'createdAtDesc' | 'updatedAtDesc'

/**
 * Cursor for keyset pagination
 * Contains timestamp and id for deterministic ordering
 */
export type ReviewCursor = {
  timestamp: string // ISO 8601 timestamp
  id: string // UUID
}

/**
 * Query parameters for review listing
 */
export type ReviewListQuery = {
  sort: ReviewSortOption
  limit: number // Max items per page (already validated: 1-50)
  cursor?: ReviewCursor // Optional cursor for next page
}

export class PzkReviewRepository {
  constructor(private db: Database) {}

  /**
   * List reviews with pagination (keyset pagination)
   *
   * Business logic:
   * - Joins with users table to get author firstName (anonymized)
   * - Supports sorting by createdAt DESC or updatedAt DESC
   * - Uses keyset (cursor) pagination for stable results
   * - Returns limit+1 items to detect if there's a next page
   *
   * Performance:
   * - Uses index: idx_pzk_reviews_created_at (created_at DESC)
   * - Uses index: idx_pzk_reviews_updated_at (updated_at DESC) - added in migration 0006
   * - Single query with INNER JOIN (all reviews must have a valid user)
   *
   * @param query - Query parameters (sort, limit, cursor)
   * @returns Array of review records (may include limit+1 for next page detection)
   *
   * @example
   * const reviews = await repo.listReviews({
   *   sort: 'createdAtDesc',
   *   limit: 20,
   *   cursor: { timestamp: '2025-12-01T10:00:00Z', id: 'uuid' }
   * })
   */
  async listReviews(query: ReviewListQuery): Promise<ReviewListRecord[]> {
    try {
      const { sort, limit, cursor } = query

      // Determine timestamp field based on sort option
      const timestampField =
        sort === 'createdAtDesc' ? pzkReviews.createdAt : pzkReviews.updatedAt

      // Build WHERE clause for keyset pagination
      // If cursor is provided: WHERE (timestamp < cursor.timestamp) OR (timestamp = cursor.timestamp AND id < cursor.id)
      const whereClauses = []

      if (cursor) {
        const cursorTimestamp = new Date(cursor.timestamp)
        whereClauses.push(
          or(
            lt(timestampField, cursorTimestamp),
            and(
              eq(timestampField, cursorTimestamp),
              sql`${pzkReviews.id} < ${cursor.id}`
            )
          )!
        )
      }

      // Main query: reviews + users.firstName
      const records = await this.db
        .select({
          id: pzkReviews.id,
          authorFirstName: users.firstName,
          rating: pzkReviews.rating,
          content: pzkReviews.content,
          createdAt: pzkReviews.createdAt,
          updatedAt: pzkReviews.updatedAt,
        })
        .from(pzkReviews)
        .innerJoin(users, eq(pzkReviews.userId, users.id))
        .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
        .orderBy(
          sort === 'createdAtDesc'
            ? sql`${pzkReviews.createdAt} DESC`
            : sql`${pzkReviews.updatedAt} DESC`,
          sql`${pzkReviews.id} DESC`
        )
        .limit(limit + 1) // Fetch limit+1 to detect next page

      return records as ReviewListRecord[]
    } catch (error) {
      console.error('[PzkReviewRepository] Error listing reviews:', error)
      throw error
    }
  }

  /**
   * List reviews for public display (no author data)
   *
   * Differences vs listReviews():
   * - Does NOT join with users table (no author name processing)
   * - authorFirstName is always null (UI can render "Anonim")
   *
   * @param query - Query parameters (sort, limit, cursor)
   */
  async listReviewsPublic(query: ReviewListQuery): Promise<ReviewListRecord[]> {
    try {
      const { sort, limit, cursor } = query

      const timestampField =
        sort === 'createdAtDesc' ? pzkReviews.createdAt : pzkReviews.updatedAt

      const whereClauses = []

      if (cursor) {
        const cursorTimestamp = new Date(cursor.timestamp)
        whereClauses.push(
          or(
            lt(timestampField, cursorTimestamp),
            and(
              eq(timestampField, cursorTimestamp),
              sql`${pzkReviews.id} < ${cursor.id}`
            )
          )!
        )
      }

      const records = await this.db
        .select({
          id: pzkReviews.id,
          authorFirstName: sql<string | null>`null`,
          rating: pzkReviews.rating,
          content: pzkReviews.content,
          createdAt: pzkReviews.createdAt,
          updatedAt: pzkReviews.updatedAt,
        })
        .from(pzkReviews)
        .where(whereClauses.length > 0 ? and(...whereClauses) : undefined)
        .orderBy(
          sort === 'createdAtDesc'
            ? sql`${pzkReviews.createdAt} DESC`
            : sql`${pzkReviews.updatedAt} DESC`,
          sql`${pzkReviews.id} DESC`
        )
        .limit(limit + 1)

      return records as ReviewListRecord[]
    } catch (error) {
      console.error('[PzkReviewRepository] Error listing public reviews:', error)
      throw error
    }
  }

  /**
   * Get user's review by userId
   *
   * IDOR protection: always queries by userId (authenticated user)
   *
   * @param userId - User ID (must match authenticated user)
   * @returns Review record or null if not found
   *
   * @example
   * const review = await repo.getByUserId('user-123')
   * if (review) {
   *   // User has a review
   * }
   */
  async getByUserId(userId: string): Promise<MyReviewRecord | null> {
    try {
      const records = await this.db
        .select({
          id: pzkReviews.id,
          rating: pzkReviews.rating,
          content: pzkReviews.content,
          createdAt: pzkReviews.createdAt,
          updatedAt: pzkReviews.updatedAt,
        })
        .from(pzkReviews)
        .where(eq(pzkReviews.userId, userId))
        .limit(1)

      return records[0] || null
    } catch (error) {
      console.error('[PzkReviewRepository] Error fetching review:', error)
      throw error
    }
  }

  /**
   * Upsert user's review (create or replace)
   *
   * Uses ON CONFLICT to ensure idempotent behavior and prevent race conditions.
   * The UNIQUE constraint (user_id) ensures max 1 review per user.
   *
   * IDOR protection: always binds review to authenticated userId
   *
   * @param userId - User ID (must match authenticated user)
   * @param rating - Rating value (1-6, validated before calling)
   * @param content - Review content (1-5000 chars, validated before calling)
   * @param now - Current timestamp for updatedAt (single source of truth)
   * @returns Updated review record with all fields
   *
   * @example
   * const review = await repo.upsertByUserId(
   *   'user-123',
   *   5,
   *   'Great program!',
   *   new Date()
   * )
   * // Review created or updated successfully
   */
  async upsertByUserId(
    userId: string,
    rating: number,
    content: string,
    now: Date
  ): Promise<MyReviewRecord> {
    try {
      const records = await this.db
        .insert(pzkReviews)
        .values({
          userId,
          rating,
          content,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: pzkReviews.userId,
          set: {
            rating,
            content,
            updatedAt: now,
          },
        })
        .returning({
          id: pzkReviews.id,
          rating: pzkReviews.rating,
          content: pzkReviews.content,
          createdAt: pzkReviews.createdAt,
          updatedAt: pzkReviews.updatedAt,
        })

      return records[0]
    } catch (error) {
      console.error('[PzkReviewRepository] Error upserting review:', error)
      throw error
    }
  }

  /**
   * Delete user's review
   *
   * Returns the number of deleted rows (0 or 1).
   * Used to determine if review existed (404 if rowCount === 0).
   *
   * IDOR protection: always filters by userId
   *
   * @param userId - User ID (must match authenticated user)
   * @returns Number of deleted rows (0 or 1)
   *
   * @example
   * const rowCount = await repo.deleteByUserId('user-123')
   * if (rowCount === 0) {
   *   // Review didn't exist → 404
   * }
   */
  async deleteByUserId(userId: string): Promise<number> {
    try {
      const deleted = await this.db
        .delete(pzkReviews)
        .where(eq(pzkReviews.userId, userId))

      // IMPORTANT:
      // With drizzle-orm/postgres-js the delete() result does not reliably expose rowCount.
      // Use RETURNING to deterministically know whether something was deleted.
      // NOTE: We only return an id (minimal payload) for performance.
      .returning({ id: pzkReviews.id })

      return deleted.length
    } catch (error) {
      console.error('[PzkReviewRepository] Error deleting review:', error)
      throw error
    }
  }
}
