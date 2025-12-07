import type { APIRoute } from 'astro'
import { createWeightEntrySchema, getWeightHistoryQuerySchema } from '../../schemas/weight'
import { weightEntryService, DuplicateEntryError, BackfillLimitError } from '../../lib/services/weightEntryService'
import type { CreateWeightEntryCommand, CreateWeightEntryResponse, ApiError, GetWeightEntriesResponse } from '../../types'

export const prerender = false

/**
 * POST /api/weight - Dodawanie wpisu wagi przez pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'patient') → 403 jeśli nie patient
 * 3. Request validation (Zod schema) → 422 jeśli nieprawidłowe dane
 * 4. Business logic (WeightEntryService) → 400/409 jeśli błędy biznesowe
 * 5. Response formatting (201 Created z entry + warnings)
 *
 * Error codes:
 * - 400: invalid_weight, backfill_limit_exceeded
 * - 401: unauthorized
 * - 403: forbidden
 * - 409: duplicate_entry
 * - 422: validation_error
 * - 500: internal_server_error
 */
export const POST: APIRoute = async ({ request, locals }) => {
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

    // 2. Authorization check (role === 'patient')
    if (user.role !== 'patient') {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: 'Tylko pacjenci mogą dodawać wpisy wagi przez ten endpoint',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Request validation (Zod)
    const body = await request.json()
    const validatedData = createWeightEntrySchema.parse(body)

    // Convert ISO string to Date object
    const measurementDate = new Date(validatedData.measurementDate)

    // 4. Business logic (WeightEntryService)
    const command: CreateWeightEntryCommand = {
      userId: user.id,
      weight: validatedData.weight,
      measurementDate,
      source: 'patient',
      note: validatedData.note,
      createdBy: user.id,
    }

    const result = await weightEntryService.createWeightEntry(command)

    // 5. Response formatting (201 Created)
    const response: CreateWeightEntryResponse = {
      entry: {
        id: result.entry.id,
        userId: result.entry.userId,
        weight: parseFloat(result.entry.weight), // Convert string back to number for API response
        measurementDate: result.entry.measurementDate,
        source: result.entry.source as 'patient' | 'dietitian',
        isBackfill: result.entry.isBackfill,
        isOutlier: result.entry.isOutlier,
        outlierConfirmed: result.entry.outlierConfirmed ?? false,
        note: result.entry.note,
        createdAt: result.entry.createdAt,
        createdBy: result.entry.createdBy,
      },
      warnings: result.warnings,
    }

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    console.error('[POST /api/weight] Error:', error)

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

/**
 * GET /api/weight - Historia pomiarów wagi pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'patient') → 403 jeśli nie patient
 * 3. Query validation (Zod schema) → 422 jeśli nieprawidłowy format dat, 400 dla innych błędów
 * 4. Business logic (WeightEntryService.listPatientEntries) → zwraca entries + pagination
 * 5. Response formatting (200 OK z entries + pagination)
 *
 * Query params:
 * - startDate (opcjonalne): ISO 8601 data (np. "2025-10-01")
 * - endDate (opcjonalne): ISO 8601 data (np. "2025-10-30")
 * - limit (opcjonalne): 1-100, domyślnie 30
 * - cursor (opcjonalne): ISO 8601 timestamp dla keyset pagination
 *
 * Error codes:
 * - 400: bad_request (limit poza zakresem, startDate > endDate)
 * - 401: unauthorized
 * - 403: forbidden
 * - 422: unprocessable_entity (nieprawidłowy format daty)
 * - 500: internal_server_error
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Authentication required.',
        statusCode: 401,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Authorization check (role === 'patient')
    if (user.role !== 'patient') {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: 'Patient role required.',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Query validation (Zod)
    const url = new URL(request.url)
    const queryParams = {
      startDate: url.searchParams.get('startDate') ?? undefined,
      endDate: url.searchParams.get('endDate') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    }

    // Walidacja query params przez Zod schema
    const validatedQuery = getWeightHistoryQuerySchema.parse(queryParams)

    // 4. Business logic (WeightEntryService)
    const result = await weightEntryService.listPatientEntries({
      userId: user.id,
      startDate: validatedQuery.startDate,
      endDate: validatedQuery.endDate,
      limit: validatedQuery.limit,
      cursor: validatedQuery.cursor,
    })

    // 5. Response formatting (200 OK)
    const response: GetWeightEntriesResponse = {
      entries: result.entries,
      pagination: result.pagination,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // Dane wrażliwe - nie cache'uj
      },
    })
  } catch (error: unknown) {
    console.error('[GET /api/weight] Error:', error)

    // Zod validation error → rozróżnienie 422 vs 400
    if (error.errors && Array.isArray(error.errors)) {
      // Sprawdź czy błąd dotyczy formatu daty (422) czy logiki biznesowej (400)
      const isDateFormatError = error.errors.some((err: any) => {
        const field = err.path?.[0]
        return (
          (field === 'startDate' || field === 'endDate' || field === 'cursor') &&
          err.message?.includes('formacie ISO')
        )
      })

      const statusCode = isDateFormatError ? 422 : 400
      const errorCode = isDateFormatError ? 'unprocessable_entity' : 'bad_request'
      const message = isDateFormatError
        ? 'Invalid date format.'
        : 'Invalid query parameters.'

      const errorResponse: ApiError = {
        error: errorCode,
        message,
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

    // 500 Internal Server Error (unexpected errors)
    const errorResponse: ApiError = {
      error: 'internal_error',
      message: 'Unexpected server error.',
      statusCode: 500,
    }
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
