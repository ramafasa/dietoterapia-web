import type { Database } from '@/db'
import type {
  PzkReviewDto,
  PzkMyReviewDto,
  PzkReviewsList,
} from '@/types/pzk-dto'
import { PzkReviewRepository } from '@/lib/repositories/pzkReviewRepository'
import type {
  ReviewSortOption,
  ReviewCursor,
} from '@/lib/repositories/pzkReviewRepository'
import { PzkAccessService } from '@/lib/services/pzkAccessService'

/**
 * PZK Review Service
 *
 * Responsibilities:
 * - List all reviews with cursor pagination (public list for social proof)
 * - Get user's own review
 * - Upsert (create/update) user's own review
 * - Delete user's own review
 * - Enforce access control: require active PZK access for all operations
 *
 * Business rules:
 * - Authentication: required (enforced in API route)
 * - Role: patient (enforced in API route)
 * - Active access: user must have at least one active PZK module access
 *   - active = revokedAt IS NULL AND startAt <= now AND now < expiresAt
 * - Review limit: 1 review per user (enforced by DB UNIQUE constraint)
 * - Pagination: cursor-based keyset pagination for stable results
 */

/**
 * Custom error for no active PZK access
 * Used for 403 responses when user lacks any active module access
 */
export class NoActiveAccessError extends Error {
  constructor(message: string = 'Active PZK access required') {
    super(message)
    this.name = 'NoActiveAccessError'
  }
}

/**
 * Custom error for review not found
 * Used for 404 responses when deleting non-existent review
 */
export class ReviewNotFoundError extends Error {
  constructor(message: string = 'Review not found') {
    super(message)
    this.name = 'ReviewNotFoundError'
  }
}

/**
 * Query parameters for review listing
 */
export type ReviewListParams = {
  sort: ReviewSortOption
  limit: number
  cursor?: string | null // Opaque cursor (base64url encoded JSON)
}

export class PzkReviewService {
  private reviewRepo: PzkReviewRepository
  private accessService: PzkAccessService

  constructor(private db: Database) {
    this.reviewRepo = new PzkReviewRepository(db)
    this.accessService = new PzkAccessService(db)
  }

  /**
   * List reviews with cursor pagination
   *
   * Public list for social proof (all reviews from all users).
   * User must have active PZK access to view the list.
   *
   * Flow:
   * 1. Assert user has any active PZK access (403 if not)
   * 2. Decode cursor (if provided)
   * 3. Fetch reviews from DB (limit+1 for next page detection)
   * 4. Map to DTOs
   * 5. Generate nextCursor (if more results exist)
   *
   * @param userId - Authenticated user ID (for access check)
   * @param params - Query parameters (sort, limit, cursor)
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns PzkReviewsList with items and nextCursor
   * @throws NoActiveAccessError if user lacks active PZK access
   *
   * @example
   * const list = await service.listReviews('user-123', {
   *   sort: 'createdAtDesc',
   *   limit: 20,
   *   cursor: 'eyJ0aW1lc3RhbXAiOiIyMDI1LTEyLTAxVDEwOjAwOjAwWiIsImlkIjoidXVpZCJ9'
   * })
   * // { items: [...], nextCursor: '...' or null }
   */
  async listReviews(
    userId: string,
    params: ReviewListParams,
    now: Date = new Date()
  ): Promise<PzkReviewsList> {
    // 1. Assert user has any active PZK access
    await this.assertHasAnyActiveAccess(userId, now)

    // 2. Decode cursor (if provided)
    let cursor: ReviewCursor | undefined
    if (params.cursor) {
      try {
        cursor = this.decodeCursor(params.cursor)
      } catch {
        // Invalid cursor → ignore and return from beginning
        cursor = undefined
      }
    }

    // 3. Fetch reviews from DB (limit+1 for next page detection)
    const records = await this.reviewRepo.listReviews({
      sort: params.sort,
      limit: params.limit,
      cursor,
    })

    // 4. Check if there are more results (if we got limit+1 items)
    const hasMore = records.length > params.limit
    const items = hasMore ? records.slice(0, params.limit) : records

    // 5. Map to DTOs
    const reviewDtos: PzkReviewDto[] = items.map((record) => ({
      id: record.id,
      author: {
        firstName: record.authorFirstName,
      },
      rating: record.rating,
      content: record.content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }))

    // 6. Generate nextCursor (if more results exist)
    let nextCursor: string | null = null
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]
      const cursorTimestamp =
        params.sort === 'createdAtDesc'
          ? lastItem.createdAt
          : lastItem.updatedAt

      nextCursor = this.encodeCursor({
        timestamp: cursorTimestamp.toISOString(),
        id: lastItem.id,
      })
    }

    return {
      items: reviewDtos,
      nextCursor,
    }
  }

  /**
   * List reviews for public display (no authentication required).
   *
   * Returns the same DTO shape as internal list, but with anonymized author
   * (author.firstName is always null).
   */
  async listPublicReviews(
    params: ReviewListParams
  ): Promise<PzkReviewsList> {
    // 1. Decode cursor (if provided)
    let cursor: ReviewCursor | undefined
    if (params.cursor) {
      try {
        cursor = this.decodeCursor(params.cursor)
      } catch {
        cursor = undefined
      }
    }

    // 2. Fetch reviews from DB (limit+1 for next page detection)
    const records = await this.reviewRepo.listReviewsPublic({
      sort: params.sort,
      limit: params.limit,
      cursor,
    })

    // 3. Check if there are more results (if we got limit+1 items)
    const hasMore = records.length > params.limit
    const items = hasMore ? records.slice(0, params.limit) : records

    // 4. Map to DTOs (author anonymized)
    const reviewDtos: PzkReviewDto[] = items.map((record) => ({
      id: record.id,
      author: {
        firstName: null,
      },
      rating: record.rating,
      content: record.content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }))

    // 5. Generate nextCursor (if more results exist)
    let nextCursor: string | null = null
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1]
      const cursorTimestamp =
        params.sort === 'createdAtDesc'
          ? lastItem.createdAt
          : lastItem.updatedAt

      nextCursor = this.encodeCursor({
        timestamp: cursorTimestamp.toISOString(),
        id: lastItem.id,
      })
    }

    return {
      items: reviewDtos,
      nextCursor,
    }
  }

  /**
   * Get user's own review
   *
   * Flow:
   * 1. Assert user has any active PZK access (403 if not)
   * 2. Fetch review from DB (or return null if doesn't exist)
   * 3. Map to DTO
   *
   * @param userId - Authenticated user ID
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns PzkMyReviewDto or null if review doesn't exist
   * @throws NoActiveAccessError if user lacks active PZK access
   *
   * @example
   * const review = await service.getMyReview('user-123')
   * if (review) {
   *   // User has a review
   * }
   */
  async getMyReview(
    userId: string,
    now: Date = new Date()
  ): Promise<PzkMyReviewDto | null> {
    // 1. Assert user has any active PZK access
    await this.assertHasAnyActiveAccess(userId, now)

    // 2. Fetch review from DB
    const record = await this.reviewRepo.getByUserId(userId)

    // 3. Return null if review doesn't exist
    if (!record) {
      return null
    }

    // 4. Map to DTO
    return {
      id: record.id,
      rating: record.rating,
      content: record.content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }
  }

  /**
   * Upsert (create or update) user's own review
   *
   * Idempotent operation: always returns 200 with the review data.
   * Uses ON CONFLICT to prevent race conditions.
   *
   * Flow:
   * 1. Assert user has any active PZK access (403 if not)
   * 2. Upsert review in DB (create or replace)
   * 3. Map to DTO
   *
   * @param userId - Authenticated user ID
   * @param rating - Rating value (1-6, validated before calling)
   * @param content - Review content (1-5000 chars, validated before calling)
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns PzkMyReviewDto with updated review data
   * @throws NoActiveAccessError if user lacks active PZK access
   *
   * @example
   * const review = await service.upsertMyReview('user-123', 5, 'Great program!')
   * // Review created or updated successfully
   */
  async upsertMyReview(
    userId: string,
    rating: number,
    content: string,
    now: Date = new Date()
  ): Promise<PzkMyReviewDto> {
    // 1. Assert user has any active PZK access
    await this.assertHasAnyActiveAccess(userId, now)

    // 2. Upsert review in DB
    const record = await this.reviewRepo.upsertByUserId(
      userId,
      rating,
      content,
      now
    )

    // 3. Map to DTO
    return {
      id: record.id,
      rating: record.rating,
      content: record.content,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    }
  }

  /**
   * Delete user's own review
   *
   * Returns 404 if review doesn't exist, otherwise succeeds.
   *
   * Flow:
   * 1. Assert user has any active PZK access (403 if not)
   * 2. Delete review from DB
   * 3. Throw ReviewNotFoundError if rowCount === 0 (404)
   *
   * @param userId - Authenticated user ID
   * @param now - Current timestamp (optional, defaults to new Date())
   * @returns void (or throws if review doesn't exist)
   * @throws NoActiveAccessError if user lacks active PZK access
   * @throws ReviewNotFoundError if review doesn't exist
   *
   * @example
   * await service.deleteMyReview('user-123')
   * // Review deleted successfully
   */
  async deleteMyReview(userId: string, now: Date = new Date()): Promise<void> {
    // 1. Assert user has any active PZK access
    await this.assertHasAnyActiveAccess(userId, now)

    // 2. Delete review from DB
    const rowCount = await this.reviewRepo.deleteByUserId(userId)

    // 3. Throw ReviewNotFoundError if review didn't exist
    if (rowCount === 0) {
      throw new ReviewNotFoundError()
    }

    // Review deleted successfully
  }

  /**
   * Assert that user has any active PZK access
   *
   * Business rule: user must have at least one active module access to use PZK features.
   * Active = revokedAt IS NULL AND startAt <= now AND now < expiresAt
   *
   * @param userId - Authenticated user ID
   * @param now - Current timestamp
   * @throws NoActiveAccessError if user lacks active PZK access
   *
   * @example
   * await this.assertHasAnyActiveAccess('user-123', new Date())
   * // Throws if user cannot access PZK
   */
  private async assertHasAnyActiveAccess(
    userId: string,
    now: Date
  ): Promise<void> {
    const accessSummary = await this.accessService.getAccessSummary(userId, now)

    if (!accessSummary.hasAnyActiveAccess) {
      throw new NoActiveAccessError()
    }

    // User has active access - continue
  }

  /**
   * Encode cursor for pagination
   *
   * Converts cursor object to opaque base64url-encoded JSON string.
   *
   * @param cursor - Cursor object with timestamp and id
   * @returns Opaque cursor string
   *
   * @example
   * const encoded = this.encodeCursor({ timestamp: '2025-12-01T10:00:00Z', id: 'uuid' })
   * // 'eyJ0aW1lc3RhbXAiOiIyMDI1LTEyLTAxVDEwOjAwOjAwWiIsImlkIjoidXVpZCJ9'
   */
  private encodeCursor(cursor: ReviewCursor): string {
    const json = JSON.stringify(cursor)
    return Buffer.from(json, 'utf-8').toString('base64url')
  }

  /**
   * Decode cursor for pagination
   *
   * Converts opaque base64url-encoded JSON string to cursor object.
   * Throws if cursor is invalid.
   *
   * @param cursorString - Opaque cursor string
   * @returns Cursor object with timestamp and id
   * @throws Error if cursor is invalid
   *
   * @example
   * const cursor = this.decodeCursor('eyJ0aW1lc3RhbXAiOiIyMDI1LTEyLTAxVDEwOjAwOjAwWiIsImlkIjoidXVpZCJ9')
   * // { timestamp: '2025-12-01T10:00:00Z', id: 'uuid' }
   */
  private decodeCursor(cursorString: string): ReviewCursor {
    try {
      const json = Buffer.from(cursorString, 'base64url').toString('utf-8')
      const cursor = JSON.parse(json) as ReviewCursor

      // Validate cursor structure
      if (!cursor.timestamp || !cursor.id) {
        throw new Error('Invalid cursor structure')
      }

      return cursor
    } catch {
      throw new Error('Invalid cursor')
    }
  }
}
