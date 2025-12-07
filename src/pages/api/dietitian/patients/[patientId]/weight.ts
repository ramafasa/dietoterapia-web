import type { APIRoute } from 'astro'
import { getPatientDetailsParamsSchema, getPatientWeightQuerySchema } from '../../../../../schemas/patient'
import { createWeightEntrySchema } from '../../../../../schemas/weight'
import { weightEntryService, DuplicateEntryError, BackfillLimitError } from '../../../../../lib/services/weightEntryService'
import { normalizeViewToDates } from '../../../../../utils/dates'
import { mapErrorToApiError, NotFoundError } from '../../../../../lib/errors'
import { userRepository } from '../../../../../lib/repositories/userRepository'
import { auditLogRepository } from '../../../../../lib/repositories/auditLogRepository'
import { eventRepository } from '../../../../../lib/repositories/eventRepository'
import type { GetPatientWeightEntriesResponse, ApiError, CreateWeightEntryCommand, CreateWeightEntryDietitianResponse } from '../../../../../types'

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
  } catch (error: unknown) {
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

/**
 * POST /api/dietitian/patients/:patientId/weight - Dodawanie wpisu wagi przez dietetyka
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Path param validation (Zod schema - patientId UUID) → 422 jeśli nieprawidłowy
 * 4. Request body validation (Zod schema - weight, measurementDate, note) → 422 jeśli nieprawidłowe
 * 5. Weryfikacja pacjenta (istnienie + role === 'patient') → 404 jeśli nie istnieje
 * 6. Business logic (WeightEntryService.createWeightEntry) → 400/409 jeśli błędy biznesowe
 * 7. Best-effort audyt + analityka (asynchronicznie, nie blokuje odpowiedzi)
 * 8. Response formatting (201 Created z entry)
 *
 * Path params:
 * - patientId: UUID v4 (wymagany)
 *
 * Request body:
 * - weight: number (30.0-250.0 kg, max 1 miejsce po przecinku)
 * - measurementDate: string (ISO 8601, nie w przyszłości, max 7 dni wstecz)
 * - note?: string (opcjonalnie, max 200 znaków)
 *
 * Response:
 * - entry: WeightEntry (id, userId, weight:number, measurementDate, source:'dietitian', isBackfill, isOutlier, outlierConfirmed, note, createdAt, createdBy)
 *
 * Error codes:
 * - 400: backfill_limit_exceeded (data > 7 dni wstecz)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 404: resource_not_found (pacjent nie istnieje lub nie ma roli 'patient')
 * - 409: duplicate_entry (wpis już istnieje dla tej daty)
 * - 422: validation_error (nieprawidłowy format body/path)
 * - 500: internal_server_error
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby dodać wpis wagi',
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
        message: 'Tylko dietetycy mogą dodawać wpisy wagi w imieniu pacjentów',
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

    // 4. Request body validation (Zod)
    const body = await request.json()
    const validatedData = createWeightEntrySchema.parse(body)

    // 5. Weryfikacja pacjenta (istnienie + role === 'patient')
    const patient = await userRepository.findById(validatedParams.patientId)

    if (!patient || patient.role !== 'patient') {
      const errorResponse: ApiError = {
        error: 'resource_not_found',
        message: 'Pacjent nie został znaleziony',
        statusCode: 404,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Convert ISO string to Date object
    const measurementDate = new Date(validatedData.measurementDate)

    // 6. Business logic (WeightEntryService)
    const command: CreateWeightEntryCommand = {
      userId: validatedParams.patientId,
      weight: validatedData.weight,
      measurementDate,
      source: 'dietitian',
      note: validatedData.note,
      createdBy: user.id,
    }

    const result = await weightEntryService.createWeightEntry(command)

    // 7. Best-effort audyt + analityka (asynchronicznie, nie blokuje odpowiedzi)
    // Audyt: rejestruje kto (dietitian), co (create weight_entry), kiedy i jakie dane
    void auditLogRepository.create({
      userId: user.id,
      action: 'create',
      tableName: 'weight_entries',
      recordId: result.entry.id,
      before: null,
      after: {
        weight: validatedData.weight,
        measurementDate: measurementDate.toISOString(),
        note: validatedData.note,
        source: 'dietitian',
        patientId: validatedParams.patientId,
      },
    })

    // Event: track 'add_weight_dietitian' event dla analytics
    void eventRepository.create({
      userId: user.id,
      eventType: 'add_weight_dietitian',
      properties: {
        patientId: validatedParams.patientId,
        entryId: result.entry.id,
        isBackfill: result.entry.isBackfill,
        isOutlier: result.entry.isOutlier,
      },
    })

    // 8. Response formatting (201 Created)
    const response: CreateWeightEntryDietitianResponse = {
      entry: {
        id: result.entry.id,
        userId: result.entry.userId,
        weight: parseFloat(result.entry.weight), // Convert string back to number for API response
        measurementDate: result.entry.measurementDate,
        source: 'dietitian',
        isBackfill: result.entry.isBackfill,
        isOutlier: result.entry.isOutlier,
        outlierConfirmed: result.entry.outlierConfirmed ?? null,
        note: result.entry.note,
        createdAt: result.entry.createdAt,
        createdBy: result.entry.createdBy,
      },
    }

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    console.error('[POST /api/dietitian/patients/:patientId/weight] Error:', error)

    // DuplicateEntryError → 409 Conflict
    if (error instanceof DuplicateEntryError) {
      const errorResponse: ApiError = {
        error: 'duplicate_entry',
        message: error.message,
        statusCode: 409,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // BackfillLimitError → 400 Bad Request
    if (error instanceof BackfillLimitError) {
      const errorResponse: ApiError = {
        error: 'backfill_limit_exceeded',
        message: error.message,
        statusCode: 400,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Zod validation error → 422 Unprocessable Entity
    if (error.errors && Array.isArray(error.errors)) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Nieprawidłowe dane wejściowe',
        statusCode: 422,
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
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Database unique constraint violation → 409 Conflict
    // Drizzle throws this if unique index fails
    if (error.code === '23505' || error.message?.includes('unique constraint')) {
      const errorResponse: ApiError = {
        error: 'duplicate_entry',
        message: 'Wpis wagi dla tej daty już istnieje',
        statusCode: 409,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 409,
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
