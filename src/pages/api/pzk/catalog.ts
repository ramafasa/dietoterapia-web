import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ok, ErrorResponses } from '@/lib/pzk/api'
import { PzkCatalogService } from '@/lib/services/pzkCatalogService'
import type { ApiResponse, PzkCatalog } from '@/types/pzk-dto'
import { z } from 'zod'
import { checkPzkFeatureEnabled } from '@/lib/pzk/guards'

export const prerender = false

/**
 * GET /api/pzk/catalog - PZK Catalog
 *
 * Returns hierarchical catalog of PZK materials grouped as modules → categories → materials.
 * Designed for patient UI with access control and purchase CTA generation.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Validate and parse query parameters (modules, includeStatuses, locale)
 * 4. Fetch user's active module access
 * 5. Fetch catalog data from repository (with filters)
 * 6. Group and map to hierarchical DTO structure
 * 7. Return 200 with ApiResponse<PzkCatalog>
 *
 * Query parameters:
 * - modules: Comma-separated list of module numbers (1,2,3) - default: all
 * - includeStatuses: Comma-separated list of statuses (published,publish_soon) - default: both
 * - locale: Locale string (e.g., 'pl') - default: 'pl' (MVP: informational only)
 *
 * Business rules:
 * - Visibility: Only materials with status 'published' or 'publish_soon' are returned
 * - 'published' materials:
 *   - isLocked: true if user has no active access to module
 *   - isActionable: true if user has active access
 *   - module: module number (1, 2, or 3) - used by UI to initiate purchase flow
 * - 'publish_soon' materials:
 *   - isLocked: always true
 *   - isActionable: always false
 * - Sorting: categories by displayOrder ASC, materials by order ASC
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkCatalog, error: null }
 * - Error: 400/401/403/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 400: validation_error - Invalid query parameters
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * {
 *   "data": {
 *     "modules": [
 *       {
 *         "module": 1,
 *         "isActive": true,
 *         "categories": [
 *           {
 *             "id": "cat-1",
 *             "slug": "podstawy",
 *             "label": "Podstawy",
 *             "description": "...",
 *             "displayOrder": 1,
 *             "materials": [
 *               {
 *                 "id": "mat-1",
 *                 "title": "Wprowadzenie",
 *                 "description": "...",
 *                 "status": "published",
 *                 "order": 1,
 *                 "module": 1,
 *                 "isLocked": false,
 *                 "isActionable": true,
 *                 "hasPdf": true,
 *                 "hasVideos": false
 *               }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   },
 *   "error": null
 * }
 *
 * @example Error response (400 - validation error)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "validation_error",
 *     "message": "Nieprawidłowe parametry zapytania",
 *     "details": {
 *       "field": "modules",
 *       "reason": "Module must be 1, 2, or 3"
 *     }
 *   }
 * }
 */

/**
 * Query parameter validation schema
 */
const queryParamsSchema = z.object({
  modules: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [1, 2, 3] as const // Default: all modules

      const parts = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      const numbers = parts.map((p) => parseInt(p, 10))

      // Validate: all parts must be integers 1, 2, or 3
      for (const num of numbers) {
        if (!Number.isInteger(num) || ![1, 2, 3].includes(num)) {
          throw new Error('Module must be 1, 2, or 3')
        }
      }

      // Deduplicate and sort
      const unique = Array.from(new Set(numbers)).sort() as (1 | 2 | 3)[]

      return unique.length > 0 ? unique : ([1, 2, 3] as const)
    }),

  includeStatuses: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return ['published', 'publish_soon'] as const // Default: both

      const parts = val
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

      // Validate: all parts must be 'published' or 'publish_soon'
      const allowed = ['published', 'publish_soon'] as const
      for (const part of parts) {
        if (!allowed.includes(part as any)) {
          throw new Error(
            "Status must be 'published' or 'publish_soon' (patient catalog)"
          )
        }
      }

      // Deduplicate
      const unique = Array.from(new Set(parts)) as (
        | 'published'
        | 'publish_soon'
      )[]

      // Must have at least one status
      if (unique.length === 0) {
        throw new Error('At least one status must be specified')
      }

      return unique
    }),

  locale: z
    .string()
    .max(10)
    .optional()
    .transform((val) => val || 'pl'), // Default: 'pl'
})

/**
 * Parsed and validated query parameters
 */
type CatalogQuery = z.infer<typeof queryParamsSchema>

export const GET: APIRoute = async (context) => {
  // Feature flag check
  const disabledResponse = checkPzkFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  try {
    // 1. Authentication check (middleware fills locals.user)
    const { locals, url } = context
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

    // 3. Validate and parse query parameters
    let query: CatalogQuery
    try {
      query = queryParamsSchema.parse({
        modules: url.searchParams.get('modules') || undefined,
        includeStatuses: url.searchParams.get('includeStatuses') || undefined,
        locale: url.searchParams.get('locale') || undefined,
      })
    } catch (validationError) {
      // Validation error - return 400
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

    // 4. Business logic - fetch catalog
    const pzkCatalogService = new PzkCatalogService(db)
    const catalog = await pzkCatalogService.getCatalog(locals.user.id, {
      modules: query.modules,
      includeStatuses: query.includeStatuses,
    })

    // 5. Success response
    const response: ApiResponse<PzkCatalog> = ok(catalog)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // 6. Error handling - unexpected server errors
    console.error('[GET /api/pzk/catalog] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
