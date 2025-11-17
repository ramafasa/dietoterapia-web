import type { APIRoute } from 'astro'
import { getPatientDetailsParamsSchema, getPatientWeightQuerySchema } from '../../../../../schemas/patient'
import { weightEntryService } from '../../../../../lib/services/weightEntryService'
import { normalizeViewToDates } from '../../../../../utils/dates'
import { mapErrorToApiError, NotFoundError } from '../../../../../lib/errors'
import type { GetPatientWeightEntriesResponse, ApiError } from '../../../../../types'

export const prerender = false

/**
 * GET /api/dietitian/patients/:patientId/weight - Pobieranie historii pomiarów wagi pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Path param validation (Zod schema - patientId UUID) → 400 jeśli nieprawidłowy
 * 4. Query params validation (Zod schema - view, dates, limit, cursor) → 400/422
 * 5. Normalizacja widoku (today/week/range → startDate, endDate)
 * 6. Business logic (WeightEntryService.listEntriesForDietitian) → 404 jeśli pacjent nie istnieje
 * 7. Response formatting (200 OK z patient + entries + weeklyObligationMet + pagination)
 *
 * Path params:
 * - patientId: UUID v4 (wymagany)
 *
 * Query params:
 * - view: 'today' | 'week' | 'range' (domyślnie: 'week')
 * - startDate: YYYY-MM-DD (wymagane gdy view=range)
 * - endDate: YYYY-MM-DD (wymagane gdy view=range)
 * - limit: 1..100 (domyślnie: 30)
 * - cursor: ISO 8601 timestamp (dla keyset pagination)
 *
 * Response includes:
 * - patient: PatientSummaryDTO (id, firstName, lastName, status)
 * - entries: WeightEntryDTO[] (weight records)
 * - weeklyObligationMet: boolean (czy pacjent dodał wpis w bieżącym tygodniu)
 * - pagination: CursorPagination (hasMore, nextCursor)
 *
 * Error codes:
 * - 400: validation_error (nieprawidłowa kombinacja parametrów, limit poza zakresem, startDate > endDate)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 404: resource_not_found (pacjent nie istnieje)
 * - 422: unprocessable_entity (nieprawidłowy format daty/cursora)
 * - 500: internal_server_error
 */
export const GET: APIRoute = async ({ params, url, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby zobaczyć historię wagi pacjenta',
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
        message: 'Tylko dietetycy mogą przeglądać historię wagi pacjentów',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Path param validation (Zod - patientId)
    const validatedParams = getPatientDetailsParamsSchema.parse({
      patientId: params.patientId,
    })

    // 4. Query params validation (Zod)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const validatedQuery = getPatientWeightQuerySchema.parse(queryParams)

    // 5. Normalizacja widoku (today/week/range → startDate, endDate)
    const { startDate, endDate } = normalizeViewToDates(
      validatedQuery.view,
      validatedQuery.startDate,
      validatedQuery.endDate
    )

    // 6. Business logic (WeightEntryService)
    const result: GetPatientWeightEntriesResponse = await weightEntryService.listEntriesForDietitian({
      patientId: validatedParams.patientId,
      startDate,
      endDate,
      limit: validatedQuery.limit,
      cursor: validatedQuery.cursor,
    })

    // 7. Response formatting (200 OK)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // Dane dynamiczne - nie cache'uj
      },
    })
  } catch (error: any) {
    console.error('[GET /api/dietitian/patients/:patientId/weight] Error:', error)

    // Zod validation error
    if (error.errors && Array.isArray(error.errors)) {
      // Determine if it's a format error (422) or logic error (400)
      const hasFormatError = error.errors.some((err: any) => {
        const path = err.path?.join('.')
        // Format errors: date/cursor format issues
        return path === 'startDate' || path === 'endDate' || path === 'cursor'
      })

      const statusCode = hasFormatError ? 422 : 400
      const errorType = hasFormatError ? 'unprocessable_entity' : 'validation_error'

      const errorResponse: ApiError = {
        error: errorType,
        message: hasFormatError
          ? 'Nieprawidłowy format danych wejściowych'
          : 'Nieprawidłowe parametry zapytania',
        statusCode,
      }

      return new Response(
        JSON.stringify({
          ...errorResponse,
          details: error.errors.map((err: any) => ({
            field: err.path?.join('.'),
            message: err.message,
          })),
        }),
        {
          status: statusCode,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Domain errors (NotFoundError, etc.) → mapped to HTTP status
    if (error instanceof NotFoundError) {
      const { apiError, statusCode } = mapErrorToApiError(error)
      return new Response(JSON.stringify(apiError), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json' },
      })
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
