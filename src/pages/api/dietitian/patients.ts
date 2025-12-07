import type { APIRoute } from 'astro'
import { getPatientsQuerySchema } from '../../../schemas/patient'
import { patientService } from '../../../lib/services/patientService'
import type { GetPatientsResponse, ApiError } from '../../../types'
import { isZodError } from '../../../utils/type-guards'

export const prerender = false

/**
 * GET /api/dietitian/patients - Pobieranie listy pacjentów dietetyka
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Query params validation (Zod schema) → 400 jeśli nieprawidłowe parametry
 * 4. Business logic (PatientService.getPatientsList)
 * 5. Response formatting (200 OK z patients + pagination)
 *
 * Query params:
 * - status: 'active' | 'paused' | 'ended' | 'all' (default: 'active')
 * - limit: 1-100 (default: 50)
 * - offset: ≥0 (default: 0)
 *
 * Response includes:
 * - patients: PatientListItemDTO[] (z lastWeightEntry i weeklyObligationMet)
 * - pagination: OffsetPagination (total, limit, offset, hasMore)
 *
 * Error codes:
 * - 400: validation_error (nieprawidłowe parametry query)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 500: internal_server_error
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby zobaczyć listę pacjentów',
        statusCode: 401,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Authorization check (role === 'dietitian')
    if (user.role !== 'dietitian') {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: 'Tylko dietetycy mogą przeglądać listę pacjentów',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Query params validation (Zod)
    const url = new URL(request.url)
    const queryParams = {
      status: url.searchParams.get('status') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    }

    const validatedQuery = getPatientsQuerySchema.parse(queryParams)

    // 4. Business logic (PatientService)
    const result: GetPatientsResponse = await patientService.getPatientsList(
      {
        status: validatedQuery.status,
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
      },
      user.id // dla analytics (best-effort)
    )

    // 5. Response formatting (200 OK)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // Dane dynamiczne - nie cache'uj
      },
    })
  } catch (error: unknown) {
    console.error('[GET /api/dietitian/patients] Error:', error)

    // Zod validation error → 400 Bad Request
    if (isZodError(error)) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Nieprawidłowe parametry zapytania',
        statusCode: 400,
      }
      return new Response(
        JSON.stringify({
          ...errorResponse,
          details: error.errors.map((err) => ({
            field: err.path?.join('.'),
            message: err.message,
          })),
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 500 Internal Server Error (unexpected errors)
    const errorResponse: ApiError = {
      error: 'internal_server_error',
      message: 'Wystąpił nieoczekiwany błąd serwera',
      statusCode: 500,
    }
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
