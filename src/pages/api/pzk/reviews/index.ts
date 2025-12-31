import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkReviewService, NoActiveAccessError } from '@/lib/services/pzkReviewService'
import { ok, ErrorResponses } from '@/lib/pzk/api'
import { reviewListQuerySchema } from '@/lib/validation/pzkReviews'
import type { ApiResponse, PzkReviewsList } from '@/types/pzk-dto'

export const prerender = false

/**
 * GET /api/pzk/reviews - List All Reviews with Pagination
 *
 * Returns a paginated list of all PZK reviews (social proof for PZK zone).
 * Requires authenticated patient with active PZK access.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Validate query parameters (cursor, limit, sort) → 400 if invalid
 * 4. Business logic (PzkReviewService):
 *    - Check user has any active PZK access → 403 if not
 *    - Fetch reviews from DB with pagination
 *    - Generate next cursor if more results exist
 * 5. Return 200 with ApiResponse<PzkReviewsList>
 *
 * Business rules:
 * - User must have at least one active PZK module access
 * - Active = revokedAt IS NULL AND startAt <= now AND now < expiresAt
 * - Pagination: cursor-based (keyset) for stable results
 * - Sorting: createdAtDesc (default) or updatedAtDesc
 * - Limit: default 20, min 1, max 50
 *
 * Query parameters:
 * - cursor: optional opaque string (base64url encoded JSON)
 * - limit: optional integer string, default "20", min 1, max 50
 * - sort: optional enum, default "createdAtDesc"
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: { items: [...], nextCursor: '...' | null }, error: null }
 * - Error: 400/401/403/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 400: validation_error - Invalid query parameters (cursor/limit/sort)
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks active PZK access
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * {
 *   "data": {
 *     "items": [
 *       {
 *         "id": "uuid",
 *         "author": { "firstName": "Anna" },
 *         "rating": 6,
 *         "content": "Great program!",
 *         "createdAt": "2025-12-01T10:00:00Z",
 *         "updatedAt": "2025-12-02T10:00:00Z"
 *       }
 *     ],
 *     "nextCursor": "opaque-cursor-string" // or null
 *   },
 *   "error": null
 * }
 *
 * @example Error response (403 - no active access)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "forbidden",
 *     "message": "Active PZK access required",
 *     "details": { "reason": "no_active_access" }
 *   }
 * }
 */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    // 1. Authentication check (middleware fills locals.user)
    if (!locals.user) {
      return new Response(JSON.stringify(ErrorResponses.UNAUTHORIZED), {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

    // 2. Authorization check (role === 'patient')
    if (locals.user.role !== 'patient') {
      return new Response(
        JSON.stringify(ErrorResponses.FORBIDDEN_PATIENT_ROLE),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 3. Validate query parameters
    const queryParams = {
      cursor: url.searchParams.get('cursor') || undefined,
      limit: url.searchParams.get('limit') || undefined,
      sort: url.searchParams.get('sort') || undefined,
    }

    const queryResult = reviewListQuerySchema.safeParse(queryParams)
    if (!queryResult.success) {
      const firstError = queryResult.error.errors[0]
      return new Response(
        JSON.stringify(
          ErrorResponses.BAD_REQUEST(firstError.message, {
            field: firstError.path.join('.'),
          })
        ),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    const { cursor, limit, sort } = queryResult.data

    // 4. Business logic - list reviews with pagination
    const pzkReviewService = new PzkReviewService(db)
    const reviewsList = await pzkReviewService.listReviews(locals.user.id, {
      sort,
      limit,
      cursor: cursor || null,
    })

    // 5. Success response
    const response: ApiResponse<PzkReviewsList> = ok(reviewsList)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // Handle custom service errors
    if (error instanceof NoActiveAccessError) {
      return new Response(
        JSON.stringify(ErrorResponses.FORBIDDEN_NO_ACTIVE_ACCESS),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // Unexpected server errors
    console.error('[GET /api/pzk/reviews] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
