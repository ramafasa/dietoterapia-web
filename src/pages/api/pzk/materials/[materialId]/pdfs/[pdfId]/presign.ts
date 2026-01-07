import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ok, ErrorResponses, fail } from '@/lib/pzk/api'
import type { ApiResponse, PzkPresignResponse } from '@/types/pzk-dto'
import { z } from 'zod'
import { checkPzkRateLimit, recordPzkRequest, getClientIp } from '@/lib/rate-limit-pzk'
import { checkCsrfForUnsafeRequest } from '@/lib/http/csrf'
import {
  PzkPdfPresignService,
  MaterialNotFoundError,
  MaterialForbiddenError,
  PdfNotFoundError,
  PresignStorageError,
} from '@/lib/services/pzkPdfPresignService'
import { checkPzkFeatureEnabled } from '@/lib/pzk/guards'

export const prerender = false

/**
 * POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign - Generate Presigned PDF URL
 *
 * Generates a time-limited presigned URL for downloading a specific PDF attachment
 * from PZK material storage (S3/R2). URL is generated on-demand with 60s TTL.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Rate limiting (per-user and per-IP) → 429 if exceeded
 * 4. Validate path params (materialId, pdfId as UUID) and body (ttlSeconds)
 * 5. Business logic (service):
 *    - Fetch material (only published/publish_soon, no draft/archived)
 *    - Check material visibility (draft/archived → 404, no metadata leak)
 *    - Evaluate access state (publish_soon → 403, no active access → 403)
 *    - Fetch PDF by (materialId, pdfId) → 404 if not found (IDOR protection)
 *    - Generate presigned URL for storage object
 * 6. Log event (best-effort): pzk_pdf_presign_success/forbidden/error
 * 7. Return 200 with ApiResponse<PzkPresignResponse>
 *
 * Material states:
 * - **published + has access**: Generate presigned URL
 * - **published + no access**: 403 forbidden (no_module_access)
 * - **publish_soon**: 403 forbidden (not actionable, coming soon)
 * - **draft/archived**: 404 not found (no metadata leak)
 *
 * Security notes:
 * - TTL hardcoded to 60s in MVP (ignore body override for security)
 * - objectKey never exposed to client (internal storage detail)
 * - IDOR protection: PDF must belong to materialId
 * - Rate limiting prevents URL farming/DoS
 * - No metadata leak for draft/archived materials
 * - Response includes Content-Disposition (attachment; filename sanitized)
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkPresignResponse, error: null }
 * - Error: 400/401/403/404/429/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific, time-limited URL)
 * - Retry-After: <seconds> (only on 429)
 *
 * Error codes:
 * - 400: validation_error - Invalid materialId/pdfId (not UUID) or invalid ttlSeconds
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR no module access OR material is publish_soon
 * - 404: not_found - Material/PDF does not exist OR material is draft/archived
 * - 429: rate_limited - Too many requests (per-user or per-IP limit exceeded)
 * - 500: internal_server_error - Presign generation failed or unexpected error
 *
 * @example Success response
 * {
 *   "data": {
 *     "url": "https://storage.example.com/path/to/file.pdf?signature=...",
 *     "expiresAt": "2025-12-30T14:01:00.000Z",
 *     "ttlSeconds": 60
 *   },
 *   "error": null
 * }
 *
 * @example Error response (403 - no access)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "forbidden",
 *     "message": "Brak dostępu do modułu materiału",
 *     "details": {
 *       "reason": "no_module_access"
 *     }
 *   }
 * }
 *
 * @example Error response (429 - rate limited)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "rate_limited",
 *     "message": "Za dużo prób. Spróbuj ponownie później.",
 *     "details": {
 *       "retryAfterSeconds": 45
 *     }
 *   }
 * }
 */

/**
 * Path parameter validation schema
 */
const pathParamsSchema = z.object({
  materialId: z.string().uuid('materialId must be a valid UUID'),
  pdfId: z.string().uuid('pdfId must be a valid UUID'),
})

/**
 * Request body validation schema
 *
 * MVP: Only ttlSeconds = 60 is allowed
 * Body is optional - defaults to 60s if not provided
 */
const bodySchema = z
  .object({
    ttlSeconds: z
      .number()
      .int('ttlSeconds must be an integer')
      .optional()
      .refine(
        (val) => val === undefined || val === 60,
        'ttlSeconds must be 60 (MVP restriction)'
      ),
  })
  .optional()

/**
 * Parsed and validated parameters
 */
type PathParams = z.infer<typeof pathParamsSchema>
type BodyParams = z.infer<typeof bodySchema>

export const POST: APIRoute = async (context) => {
  // Feature flag check
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    // 1. Authentication check (middleware fills locals.user)
    const { locals, params, request } = context
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
    if (!csrf.ok) {
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

    // 3. Rate limiting (per-user and per-IP)
    const clientIp = getClientIp(request)
    const rateLimitResult = checkPzkRateLimit(locals.user.id, clientIp)

    if (!rateLimitResult.allowed) {
      const retryAfterSeconds = rateLimitResult.retryAfterSeconds ?? 60

      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Retry-After': retryAfterSeconds.toString(),
      } as const

      return new Response(
        JSON.stringify(
          fail('rate_limited', 'Za dużo prób. Spróbuj ponownie później.', {
            retryAfterSeconds,
            limitType: rateLimitResult.limitType,
          })
        ),
        {
          status: 429,
          headers,
        }
      )
    }

    // 4. Validate path parameters (materialId, pdfId)
    let pathParams: PathParams
    try {
      pathParams = pathParamsSchema.parse({
        materialId: params.materialId,
        pdfId: params.pdfId,
      })
    } catch (validationError) {
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : 'Invalid path parameters'

      return new Response(
        JSON.stringify(ErrorResponses.BAD_REQUEST(errorMessage)),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // 5. Validate request body (ttlSeconds)
    let bodyParams: BodyParams
    try {
      const rawBody = await request.json().catch(() => ({}))
      bodyParams = bodySchema.parse(rawBody)
    } catch (validationError) {
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : 'Invalid request body'

      return new Response(
        JSON.stringify(ErrorResponses.BAD_REQUEST(errorMessage)),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      )
    }

    // Extract TTL (default to 60s if not provided)
    const ttlSeconds = bodyParams?.ttlSeconds ?? 60

    // Record successful rate limit check
    recordPzkRequest(locals.user.id, clientIp)

    // 6. Business logic - PzkPdfPresignService
    const pzkPdfPresignService = new PzkPdfPresignService(db)

    let presignResponse: PzkPresignResponse
    try {
      presignResponse = await pzkPdfPresignService.generatePresignUrl({
        userId: locals.user.id,
        materialId: pathParams.materialId,
        pdfId: pathParams.pdfId,
        ttlSeconds,
        ip: clientIp,
      })
    } catch (error) {
      // Handle domain errors
      if (error instanceof MaterialNotFoundError || error instanceof PdfNotFoundError) {
        // Material not found OR PDF not found → 404
        return new Response(JSON.stringify(ErrorResponses.NOT_FOUND()), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        })
      }

      if (error instanceof MaterialForbiddenError) {
        // Material forbidden (publish_soon or no access) → 403
        const message =
          error.reason === 'publish_soon'
            ? 'Materiał będzie dostępny wkrótce'
            : 'Brak dostępu do modułu materiału'

        return new Response(
          JSON.stringify(
            fail('forbidden', message, {
              reason: error.reason,
            })
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

      if (error instanceof PresignStorageError) {
        // Storage error → 500
        console.error('[POST presign] Storage error:', error.originalError)
        return new Response(
          JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
          }
        )
      }

      // Re-throw unexpected errors to outer catch block
      throw error
    }

    // 7. Success response
    const response: ApiResponse<PzkPresignResponse> = ok(presignResponse)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // 8. Error handling - unexpected server errors
    console.error('[POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
