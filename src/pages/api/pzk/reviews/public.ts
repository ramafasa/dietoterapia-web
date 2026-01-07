import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkReviewService } from '@/lib/services/pzkReviewService'
import { ok, ErrorResponses } from '@/lib/pzk/api'
import { reviewListQuerySchema } from '@/lib/validation/pzkReviews'
import type { ApiResponse, PzkReviewsList } from '@/types/pzk-dto'
import { checkPzkFeatureEnabled } from '@/lib/pzk/guards'

export const prerender = false

/**
 * GET /api/pzk/reviews/public - Public list of PZK reviews (anonymized)
 *
 * - No authentication required
 * - Author is anonymized (no name returned)
 * - Cursor pagination: cursor/limit/sort (same as internal endpoint)
 */
export const GET: APIRoute = async (context) => {
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    const { url } = context

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

    const pzkReviewService = new PzkReviewService(db)
    const reviewsList = await pzkReviewService.listPublicReviews({
      sort,
      limit,
      cursor: cursor || null,
    })

    const response: ApiResponse<PzkReviewsList> = ok(reviewsList)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Public endpoint: allow short caching
        'Cache-Control': 'public, max-age=300',
      },
    })
  } catch (error) {
    console.error('[GET /api/pzk/reviews/public] Error:', error)
    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}


