import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ok, ErrorResponses } from '@/lib/pzk/api'
import type { ApiResponse, PzkMaterialDetails } from '@/types/pzk-dto'
import {
  PzkMaterialService,
  MaterialNotFoundError,
} from '@/lib/services/pzkMaterialService'
import { z } from 'zod'

export const prerender = false

/**
 * GET /api/pzk/materials/:materialId - PZK Material Details
 *
 * Returns detailed view of a single PZK material with access control.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Validate path param (materialId as UUID) and query param (include)
 * 4. Fetch material from database
 * 5. Check visibility rules (draft/archived → 404, no metadata leak)
 * 6. Evaluate access state (status + module access)
 * 7. Fetch related data (category, pdfs, videos, note) if unlocked and included
 * 8. Map to DTO and return 200 with ApiResponse<PzkMaterialDetails>
 *
 * Material states:
 * - **unlocked**: status = 'published' AND user has active access to module
 *   → full content, pdfs, videos, note (based on include)
 * - **locked (no_module_access)**: status = 'published' BUT user lacks module access
 *   → title/description/status only, no content, CTA URL generated
 * - **locked (publish_soon)**: status = 'publish_soon'
 *   → title/description/status only, no content, no CTA (coming soon)
 * - **not found (404)**: material does not exist OR status = 'draft'/'archived'
 *   → no metadata leak, always 404
 *
 * Query parameters:
 * - include: Comma-separated list of optional fields to include (default: 'pdfs,videos,note')
 *   - Allowed values: 'pdfs', 'videos', 'note'
 *   - Enables selective fetching to reduce response size
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkMaterialDetails, error: null }
 * - Error: 400/401/403/404/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, private notes)
 *
 * Error codes:
 * - 400: validation_error - Invalid materialId (not UUID) or invalid include parameter
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient
 * - 404: not_found - Material does not exist OR status is draft/archived
 * - 500: internal_server_error - Unexpected server error
 *
 * Security notes:
 * - No metadata leak for draft/archived materials (always 404)
 * - IDOR protection: notes fetched by (userId, materialId) pair only
 * - No storage secrets exposed (objectKey hidden, use presign endpoint)
 * - No cache to prevent data leakage between users
 *
 * @example Success response (unlocked)
 * {
 *   "data": {
 *     "id": "mat-123",
 *     "module": 1,
 *     "category": { "id": "cat-1", "slug": "podstawy", "label": "Podstawy", "displayOrder": 1 },
 *     "status": "published",
 *     "order": 1,
 *     "title": "Wprowadzenie do PZK",
 *     "description": "Materiał wprowadzający...",
 *     "contentMd": "# Witaj w PZK\n\nTo jest treść...",
 *     "pdfs": [{ "id": "pdf-1", "fileName": "intro.pdf", "displayOrder": 1 }],
 *     "videos": [{ "id": "vid-1", "youtubeVideoId": "abc123", "title": "Film 1", "displayOrder": 1 }],
 *     "note": { "content": "Moja notatka...", "updatedAt": "2025-12-30T12:00:00.000Z" },
 *     "access": { "isLocked": false, "ctaUrl": null }
 *   },
 *   "error": null
 * }
 *
 * @example Success response (locked - no module access)
 * {
 *   "data": {
 *     "id": "mat-123",
 *     "module": 2,
 *     "category": null,
 *     "status": "published",
 *     "order": 1,
 *     "title": "Zaawansowane techniki",
 *     "description": "Dostępne po zakupie modułu 2...",
 *     "contentMd": null,
 *     "pdfs": [],
 *     "videos": [],
 *     "note": null,
 *     "access": {
 *       "isLocked": true,
 *       "ctaUrl": "https://example.com/pzk?module=2",
 *       "reason": "no_module_access"
 *     }
 *   },
 *   "error": null
 * }
 *
 * @example Error response (404 - draft material)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "not_found",
 *     "message": "Nie znaleziono zasobu"
 *   }
 * }
 */

/**
 * Path parameter validation schema
 */
const pathParamsSchema = z.object({
  materialId: z.string().uuid('materialId must be a valid UUID'),
})

/**
 * Query parameter validation schema
 */
const queryParamsSchema = z.object({
  include: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return { pdfs: true, videos: true, note: true } // Default: all

      const parts = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      // Validate: all parts must be 'pdfs', 'videos', or 'note'
      const allowed = ['pdfs', 'videos', 'note'] as const
      for (const part of parts) {
        if (!allowed.includes(part as any)) {
          throw new Error(
            "include parameter must contain only: 'pdfs', 'videos', 'note'"
          )
        }
      }

      // Build include object
      const unique = Array.from(new Set(parts))
      return {
        pdfs: unique.includes('pdfs'),
        videos: unique.includes('videos'),
        note: unique.includes('note'),
      }
    }),
})

/**
 * Parsed and validated parameters
 */
type PathParams = z.infer<typeof pathParamsSchema>
type QueryParams = z.infer<typeof queryParamsSchema>

export const GET: APIRoute = async ({ locals, params, url }) => {
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

    // 3. Validate path parameters (materialId)
    let pathParams: PathParams
    try {
      pathParams = pathParamsSchema.parse({
        materialId: params.materialId,
      })
    } catch (validationError) {
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : 'Invalid materialId'

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

    // 4. Validate query parameters (include)
    let queryParams: QueryParams
    try {
      queryParams = queryParamsSchema.parse({
        include: url.searchParams.get('include') || undefined,
      })
    } catch (validationError) {
      const errorMessage =
        validationError instanceof Error
          ? validationError.message
          : 'Invalid query parameters'

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

    // 5. Business logic - fetch material details
    const pzkMaterialService = new PzkMaterialService(db)

    let materialDetails: PzkMaterialDetails
    try {
      materialDetails = await pzkMaterialService.getMaterialDetails({
        userId: locals.user.id,
        materialId: pathParams.materialId,
        include: queryParams.include,
      })
    } catch (error) {
      // MaterialNotFoundError → 404 (material not found or draft/archived)
      if (error instanceof MaterialNotFoundError) {
        return new Response(JSON.stringify(ErrorResponses.NOT_FOUND()), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        })
      }
      // Re-throw unexpected errors to outer catch block
      throw error
    }

    // 6. Success response
    const response: ApiResponse<PzkMaterialDetails> = ok(materialDetails)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // 7. Error handling - unexpected server errors
    console.error('[GET /api/pzk/materials/:materialId] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
