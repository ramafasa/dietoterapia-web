import type { APIRoute } from 'astro'
import { db } from '@/db'
import {
  PzkReviewService,
  NoActiveAccessError,
  ReviewNotFoundError,
} from '@/lib/services/pzkReviewService'
import { ok, ErrorResponses, fail } from '@/lib/pzk/api'
import { reviewUpsertBodySchema } from '@/lib/validation/pzkReviews'
import type { ApiResponse, PzkMyReviewDto } from '@/types/pzk-dto'
import { checkCsrfForUnsafeRequest } from '@/lib/http/csrf'
import { checkPzkFeatureEnabled } from '@/lib/pzk/guards'

export const prerender = false

/**
 * GET /api/pzk/reviews/me - Get My Review
 *
 * Returns the authenticated patient's own review, or null if no review exists.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Business logic (PzkReviewService):
 *    - Check user has any active PZK access → 403 if not
 *    - Fetch review from DB → return review or null
 * 4. Return 200 with ApiResponse<PzkMyReviewDto | null>
 *
 * Business rules:
 * - User must have at least one active PZK module access
 * - Active = revokedAt IS NULL AND startAt <= now AND now < expiresAt
 * - User can only see their own review (IDOR protection)
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkMyReviewDto | null, error: null }
 * - Error: 401/403/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks active PZK access
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response (review exists)
 * {
 *   "data": {
 *     "id": "uuid",
 *     "rating": 5,
 *     "content": "Great program!",
 *     "createdAt": "2025-12-01T10:00:00Z",
 *     "updatedAt": "2025-12-02T10:00:00Z"
 *   },
 *   "error": null
 * }
 *
 * @example Success response (review doesn't exist)
 * {
 *   "data": null,
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
export const GET: APIRoute = async (context) => {
  // Feature flag check
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    // 1. Authentication check (middleware fills locals.user)
    const { locals } = context
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

    // 3. Business logic - get my review
    const pzkReviewService = new PzkReviewService(db)
    const review = await pzkReviewService.getMyReview(locals.user.id)

    // 4. Success response (review or null)
    const response: ApiResponse<PzkMyReviewDto | null> = ok(review)

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
    console.error('[GET /api/pzk/reviews/me] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}

/**
 * PUT /api/pzk/reviews/me - Upsert My Review
 *
 * Creates or updates (replaces) the authenticated patient's own review.
 * Idempotent operation: always returns 200 with the updated review data.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Parse and validate request body → 400 if invalid JSON or validation fails
 * 4. Business logic (PzkReviewService):
 *    - Check user has any active PZK access → 403 if not
 *    - Upsert review in DB (ON CONFLICT → UPDATE)
 * 5. Return 200 with ApiResponse<PzkMyReviewDto>
 *
 * Business rules:
 * - User must have at least one active PZK module access
 * - Rating: integer 1-6 (6-point scale)
 * - Content: 1-5000 characters (after trim)
 * - Idempotent: always returns 200 (no 409 conflicts due to ON CONFLICT)
 * - Max 1 review per user (enforced by DB UNIQUE constraint)
 *
 * Request body:
 * {
 *   "rating": 5,        // Required, integer 1-6
 *   "content": "string" // Required, 1-5000 chars after trim
 * }
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkMyReviewDto, error: null }
 * - Error: 400/401/403/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 400: validation_error - Invalid request body (rating/content validation)
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks active PZK access
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * {
 *   "data": {
 *     "id": "uuid",
 *     "rating": 5,
 *     "content": "Updated review content",
 *     "createdAt": "2025-12-01T10:00:00Z",
 *     "updatedAt": "2025-12-30T12:00:00Z"
 *   },
 *   "error": null
 * }
 *
 * @example Error response (400 - validation error)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "validation_error",
 *     "message": "rating must be at least 1",
 *     "details": { "field": "rating" }
 *   }
 * }
 */
export const PUT: APIRoute = async (context) => {
  // Feature flag check
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    // 1. Authentication check (middleware fills locals.user)
    const { locals, request } = context
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

    // CSRF protection (cookie-auth + unsafe method)
    const csrf = checkCsrfForUnsafeRequest(request)
    if (csrf.ok === false) {
      return new Response(
        JSON.stringify(
          fail('forbidden', 'CSRF protection: invalid request origin', csrf.details)
        ),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 3. Parse and validate request body
    let requestBody: unknown
    try {
      requestBody = await request.json()
    } catch {
      return new Response(
        JSON.stringify(
          ErrorResponses.BAD_REQUEST('Invalid JSON in request body')
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

    const bodyResult = reviewUpsertBodySchema.safeParse(requestBody)
    if (!bodyResult.success) {
      const firstError = bodyResult.error.errors[0]
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

    const { rating, content } = bodyResult.data

    // 4. Business logic - upsert review
    const pzkReviewService = new PzkReviewService(db)
    const review = await pzkReviewService.upsertMyReview(
      locals.user.id,
      rating,
      content
    )

    // 5. Success response
    const response: ApiResponse<PzkMyReviewDto> = ok(review)

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
    console.error('[PUT /api/pzk/reviews/me] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}

/**
 * DELETE /api/pzk/reviews/me - Delete My Review
 *
 * Deletes the authenticated patient's own review.
 * Returns 404 if review doesn't exist.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Business logic (PzkReviewService):
 *    - Check user has any active PZK access → 403 if not
 *    - Delete review from DB → 404 if doesn't exist
 * 4. Return 204 No Content (empty body)
 *
 * Business rules:
 * - User must have at least one active PZK module access
 * - Returns 404 if review doesn't exist (not idempotent)
 * - User can only delete their own review (IDOR protection)
 *
 * Response:
 * - Success: 204 No Content (empty body)
 * - Error: 401/403/404/500 with PZK envelope { data: null, error: {...} }
 *
 * Headers:
 * - Cache-Control: no-store (user-specific operation, no caching)
 * - Content-Type: application/json (only for error responses)
 *
 * Error codes:
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks active PZK access
 * - 404: not_found - Review doesn't exist
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * HTTP 204 No Content
 * (empty body)
 *
 * @example Error response (404 - review not found)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "not_found",
 *     "message": "Nie znaleziono zasobu"
 *   }
 * }
 */
export const DELETE: APIRoute = async (context) => {
  // Feature flag check
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    // 1. Authentication check (middleware fills locals.user)
    const { locals, request } = context
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

    // CSRF protection (cookie-auth + unsafe method)
    const csrf = checkCsrfForUnsafeRequest(request)
    if (csrf.ok === false) {
      return new Response(
        JSON.stringify(
          fail('forbidden', 'CSRF protection: invalid request origin', csrf.details)
        ),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 3. Business logic - delete review (throws ReviewNotFoundError if doesn't exist)
    const pzkReviewService = new PzkReviewService(db)
    await pzkReviewService.deleteMyReview(locals.user.id)

    // 4. Success response - 204 No Content (empty body)
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // Handle custom service errors
    if (error instanceof ReviewNotFoundError) {
      return new Response(JSON.stringify(ErrorResponses.NOT_FOUND()), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

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
    console.error('[DELETE /api/pzk/reviews/me] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
