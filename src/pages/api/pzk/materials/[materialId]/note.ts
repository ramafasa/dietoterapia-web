import type { APIRoute } from 'astro'
import { db } from '@/db'
import { PzkNotesService, MaterialNotFoundError, MaterialForbiddenError } from '@/lib/services/pzkNotesService'
import { ok, ErrorResponses } from '@/lib/pzk/api'
import { notePathParamsSchema, noteUpsertBodySchema } from '@/lib/validation/pzkNotes'
import type { ApiResponse, PzkNoteDto } from '@/types/pzk-dto'

export const prerender = false

/**
 * GET /api/pzk/materials/:materialId/note - Get User's Note for Material
 *
 * Returns the authenticated patient's private note for a specific material,
 * or null if no note exists.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Validate materialId parameter → 400 if invalid UUID
 * 4. Business logic (PzkNotesService):
 *    - Check material exists and status === 'published' → 404 if not
 *    - Check user has active module access → 403 if not
 *    - Fetch note from DB → return note or null
 * 5. Return 200 with ApiResponse<PzkNoteDto | null>
 *
 * Business rules:
 * - Only 'published' materials are actionable (draft/archived/publish_soon → 404)
 * - User must have active access to material's module
 * - Note is private per user per material (IDOR protection)
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkNoteDto | null, error: null }
 * - Error: 400/401/403/404/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 400: validation_error - Invalid materialId (not UUID)
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks module access
 * - 404: not_found - Material not found or not published
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response (note exists)
 * {
 *   "data": {
 *     "materialId": "uuid",
 *     "content": "My note",
 *     "updatedAt": "2025-12-19T10:00:00Z"
 *   },
 *   "error": null
 * }
 *
 * @example Success response (note doesn't exist)
 * {
 *   "data": null,
 *   "error": null
 * }
 *
 * @example Error response (403 - no module access)
 * {
 *   "data": null,
 *   "error": {
 *     "code": "forbidden",
 *     "message": "Brak aktywnego dostępu do modułu",
 *     "details": { "reason": "no_module_access" }
 *   }
 * }
 */
export const GET: APIRoute = async ({ locals, params }) => {
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

    // 3. Validate materialId parameter
    const pathParamsResult = notePathParamsSchema.safeParse(params)
    if (!pathParamsResult.success) {
      const firstError = pathParamsResult.error.errors[0]
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

    const { materialId } = pathParamsResult.data

    // 4. Business logic - fetch note
    const pzkNotesService = new PzkNotesService(db)
    const note = await pzkNotesService.getNote(locals.user.id, materialId)

    // 5. Success response (note or null)
    const response: ApiResponse<PzkNoteDto | null> = ok(note)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // Handle custom service errors
    if (error instanceof MaterialNotFoundError) {
      return new Response(JSON.stringify(ErrorResponses.NOT_FOUND()), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (error instanceof MaterialForbiddenError) {
      return new Response(
        JSON.stringify(ErrorResponses.FORBIDDEN_NO_MODULE_ACCESS()),
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
    console.error('[GET /api/pzk/materials/:materialId/note] Error:', error)

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
 * PUT /api/pzk/materials/:materialId/note - Upsert User's Note for Material
 *
 * Creates or updates (replaces) the authenticated patient's private note for a material.
 * Idempotent operation: always returns 200 with the updated note data.
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Validate materialId parameter → 400 if invalid UUID
 * 4. Parse and validate request body → 400 if invalid JSON or content validation fails
 * 5. Business logic (PzkNotesService):
 *    - Check material exists and status === 'published' → 404 if not
 *    - Check user has active module access → 403 if not
 *    - Upsert note in DB (ON CONFLICT → UPDATE)
 * 6. Return 200 with ApiResponse<PzkNoteDto>
 *
 * Business rules:
 * - Only 'published' materials are actionable (draft/archived/publish_soon → 404)
 * - User must have active access to material's module
 * - Content: 1-10,000 characters (after trim)
 * - Idempotent: always returns 200 (no 409 conflicts due to ON CONFLICT)
 *
 * Request body:
 * {
 *   "content": "string" // Required, 1-10,000 chars after trim
 * }
 *
 * Response format (PZK envelope):
 * - Success: 200 with { data: PzkNoteDto, error: null }
 * - Error: 400/401/403/404/500 with { data: null, error: { code, message, details? } }
 *
 * Headers:
 * - Content-Type: application/json
 * - Cache-Control: no-store (user-specific data, no caching)
 *
 * Error codes:
 * - 400: validation_error - Invalid materialId OR invalid request body
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks module access
 * - 404: not_found - Material not found or not published
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * {
 *   "data": {
 *     "materialId": "uuid",
 *     "content": "My updated note",
 *     "updatedAt": "2025-12-19T10:00:00Z"
 *   },
 *   "error": null
 * }
 */
export const PUT: APIRoute = async ({ locals, params, request }) => {
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

    // 3. Validate materialId parameter
    const pathParamsResult = notePathParamsSchema.safeParse(params)
    if (!pathParamsResult.success) {
      const firstError = pathParamsResult.error.errors[0]
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

    const { materialId } = pathParamsResult.data

    // 4. Parse and validate request body
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

    const bodyResult = noteUpsertBodySchema.safeParse(requestBody)
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

    const { content } = bodyResult.data

    // 5. Business logic - upsert note
    const pzkNotesService = new PzkNotesService(db)
    const note = await pzkNotesService.upsertNote(
      locals.user.id,
      materialId,
      content
    )

    // 6. Success response
    const response: ApiResponse<PzkNoteDto> = ok(note)

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // Handle custom service errors
    if (error instanceof MaterialNotFoundError) {
      return new Response(JSON.stringify(ErrorResponses.NOT_FOUND()), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (error instanceof MaterialForbiddenError) {
      return new Response(
        JSON.stringify(ErrorResponses.FORBIDDEN_NO_MODULE_ACCESS()),
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
    console.error('[PUT /api/pzk/materials/:materialId/note] Error:', error)

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
 * DELETE /api/pzk/materials/:materialId/note - Delete User's Note for Material
 *
 * Deletes the authenticated patient's private note for a material.
 * Idempotent operation: always returns 204 (even if note doesn't exist).
 *
 * Flow:
 * 1. Authentication check (Lucia session via middleware) → 401 if not logged in
 * 2. Authorization check (role === 'patient') → 403 if not patient
 * 3. Validate materialId parameter → 400 if invalid UUID
 * 4. Business logic (PzkNotesService):
 *    - Check material exists and status === 'published' → 404 if not
 *    - Check user has active module access → 403 if not
 *    - Delete note from DB (idempotent)
 * 5. Return 204 No Content (empty body)
 *
 * Business rules:
 * - Only 'published' materials are actionable (draft/archived/publish_soon → 404)
 * - User must have active access to material's module
 * - Idempotent: returns 204 even if note didn't exist
 *
 * Response:
 * - Success: 204 No Content (empty body)
 * - Error: 400/401/403/404/500 with PZK envelope { data: null, error: {...} }
 *
 * Headers:
 * - Cache-Control: no-store (user-specific operation, no caching)
 * - Content-Type: application/json (only for error responses)
 *
 * Error codes:
 * - 400: validation_error - Invalid materialId (not UUID)
 * - 401: unauthorized - User not logged in
 * - 403: forbidden - User is not a patient OR lacks module access
 * - 404: not_found - Material not found or not published
 * - 500: internal_server_error - Unexpected server error
 *
 * @example Success response
 * HTTP 204 No Content
 * (empty body)
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
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

    // 3. Validate materialId parameter
    const pathParamsResult = notePathParamsSchema.safeParse(params)
    if (!pathParamsResult.success) {
      const firstError = pathParamsResult.error.errors[0]
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

    const { materialId } = pathParamsResult.data

    // 4. Business logic - delete note (idempotent)
    const pzkNotesService = new PzkNotesService(db)
    await pzkNotesService.deleteNote(locals.user.id, materialId)

    // 5. Success response - 204 No Content (empty body)
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    // Handle custom service errors
    if (error instanceof MaterialNotFoundError) {
      return new Response(JSON.stringify(ErrorResponses.NOT_FOUND()), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (error instanceof MaterialForbiddenError) {
      return new Response(
        JSON.stringify(ErrorResponses.FORBIDDEN_NO_MODULE_ACCESS()),
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
    console.error('[DELETE /api/pzk/materials/:materialId/note] Error:', error)

    return new Response(JSON.stringify(ErrorResponses.INTERNAL_SERVER_ERROR), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }
}
