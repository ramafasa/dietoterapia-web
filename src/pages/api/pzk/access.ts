import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkAccessService } from '@/lib/services/pzkAccessService'
import { ok, ErrorResponses } from '@/lib/pzk/api'
import type { ApiResponse, PzkAccessSummary } from '@/types/pzk-dto'

export const prerender = false

/**
 * GET /api/pzk/access - PZK Access Summary
 *
 * Returns a summary of the authenticated patient's active access to PZK modules (1, 2, 3).
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Fetch active access records from database
 * 4. Map to DTO and return 200 with ApiResponse<PzkAccessSummary>
 *
 * Business rule for "active access":
 * - revokedAt IS NULL (not revoked)
 * - startAt <= now() (already started)
 * - now() < expiresAt (not expired yet)
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkAccessSummary, error: null }
 * - Error: 401/403/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * {
 *   "data": {
 *     "hasAnyActiveAccess": true,
 *     "activeModules": [1, 2],
 *     "access": [
 *       { "module": 1, "startAt": "2025-01-01T00:00:00.000Z", "expiresAt": "2026-01-01T00:00:00.000Z" },
 *       { "module": 2, "startAt": "2025-01-01T00:00:00.000Z", "expiresAt": "2026-01-01T00:00:00.000Z" }
 *     ],
 *     "serverTime": "2025-12-30T12:00:00.000Z"
 *   },
 *   "error": null
 * }
 *
 * @example Error response (401)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "unauthorized",
 *     "message": "Authentication required"
 *   }
 * }
 */
export const GET: APIRoute = async ({ locals }) => {
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

    // 3. Business logic - fetch access summary
    const pzkAccessService = new PzkAccessService(db)
    const summary = await pzkAccessService.getAccessSummary(locals.user.id)

    // 4. Success response
    const response: ApiResponse<PzkAccessSummary> = ok(summary)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // 5. Error handling - unexpected server errors
    console.error('[GET /api/pzk/access] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}