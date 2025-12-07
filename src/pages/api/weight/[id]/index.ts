import type { APIRoute } from 'astro'
import { z } from 'zod'
import { updateWeightEntrySchema } from '../../../../schemas/weight'
import { weightEntryService, EditWindowExpiredError, ForbiddenError, NotFoundError } from '../../../../lib/services/weightEntryService'
import type { UpdateWeightEntryCommand, UpdateWeightEntryResponse, ApiError } from '../../../../types'

export const prerender = false

// Schema walidacji parametru id (UUID)
const paramsSchema = z.object({ id: z.string().uuid('Invalid entry id') })

/**
 * PATCH /api/weight/:id - Edycja istniejącego wpisu wagi przez pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'patient') → 403 jeśli nie patient
 * 3. Request validation (Zod schema) → 422 jeśli nieprawidłowe dane
 * 4. Business logic (WeightEntryService.updatePatientEntry) → weryfikacja właścicielstwa, okna edycji, aktualizacja
 * 5. Response formatting (200 OK z zaktualizowanym entry)
 *
 * Business rules:
 * - Pacjent może edytować tylko własne wpisy
 * - Wpis musi być utworzony przez pacjenta (source='patient')
 * - Edycja możliwa tylko w oknie: do końca następnego dnia po measurementDate (Europe/Warsaw)
 * - Co najmniej jedno pole (weight lub note) musi być podane
 *
 * Error codes:
 * - 400: edit_window_expired, invalid_weight
 * - 401: unauthorized
 * - 403: forbidden (nie właściciel lub source != 'patient')
 * - 404: not_found (wpis nie istnieje lub nie należy do użytkownika)
 * - 422: validation_error
 * - 500: internal_server_error
 */
export const PATCH: APIRoute = async ({ request, locals, params }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby edytować wpis wagi',
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
        message: 'Tylko pacjenci mogą edytować wpisy wagi przez ten endpoint',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Extract entry ID from URL params
    const entryId = params.id
    if (!entryId) {
      const errorResponse: ApiError = {
        error: 'bad_request',
        message: 'Brak ID wpisu w URL',
        statusCode: 400,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Request validation (Zod)
    const body = await request.json()
    const validatedData = updateWeightEntrySchema.parse(body)

    // Ensure at least one field is provided (weight or note)
    if (validatedData.weight === undefined && validatedData.note === undefined) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Co najmniej jedno pole (weight lub note) musi być podane',
        statusCode: 422,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 422,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Business logic (WeightEntryService)
    const command: UpdateWeightEntryCommand = {
      id: entryId,
      weight: validatedData.weight,
      note: validatedData.note,
      updatedBy: user.id,
    }

    const updatedEntry = await weightEntryService.updatePatientEntry(command)

    // 5. Response formatting (200 OK)
    const response: UpdateWeightEntryResponse = {
      entry: updatedEntry,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    console.error('[PATCH /api/weight/:id] Error:', error)

    // EditWindowExpiredError → 400 Bad Request
    if (error instanceof EditWindowExpiredError) {
      const errorResponse: ApiError = {
        error: 'edit_window_expired',
        message: error.message,
        statusCode: 400,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // NotFoundError → 404 Not Found
    if (error instanceof NotFoundError) {
      const errorResponse: ApiError = {
        error: 'not_found',
        message: error.message,
        statusCode: 404,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ForbiddenError → 403 Forbidden
    if (error instanceof ForbiddenError) {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: error.message,
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
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
 * DELETE /api/weight/:id - Usuwanie wpisu wagi przez pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'patient') → 403 jeśli nie patient
 * 3. Validation (UUID) → 400 jeśli nieprawidłowy ID
 * 4. Business logic (WeightEntryService.deletePatientEntry) → weryfikacja właścicielstwa, okna edycji, usunięcie
 * 5. Response formatting (204 No Content)
 *
 * Business rules:
 * - Pacjent może usuwać tylko własne wpisy
 * - Wpis musi być utworzony przez pacjenta (source='patient')
 * - Usunięcie możliwe tylko w oknie: do końca następnego dnia po measurementDate (Europe/Warsaw)
 * - Audit log: action='delete' z before snapshot, after=null
 * - Jeśli isOutlier=true, logowanie eventu outlier_corrected
 *
 * Error codes:
 * - 400: edit_window_expired
 * - 401: unauthorized
 * - 403: forbidden (nie właściciel lub source != 'patient')
 * - 404: not_found (wpis nie istnieje lub nie należy do użytkownika)
 * - 500: internal_server_error
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
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

    // 3. Validation (UUID)
    const { id } = paramsSchema.parse(params)

    // 4. Business logic (WeightEntryService)
    await weightEntryService.deletePatientEntry({ id, sessionUserId: user.id })

    // 5. Response formatting (204 No Content)
    return new Response(null, {
      status: 204,
      headers: {
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    console.error('[DELETE /api/weight/:id] Error:', error)

    // NotFoundError → 404 Not Found
    if (error instanceof NotFoundError) {
      const errorResponse: ApiError = {
        error: 'not_found',
        message: error.message,
        statusCode: 404,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // ForbiddenError → 403 Forbidden
    if (error instanceof ForbiddenError) {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: error.message,
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // EditWindowExpiredError → 400 Bad Request
    if (error instanceof EditWindowExpiredError) {
      const errorResponse: ApiError = {
        error: 'edit_window_expired',
        message: error.message,
        statusCode: 400,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Zod validation error (UUID) → 400 Bad Request
    if (error.errors && Array.isArray(error.errors)) {
      const errorResponse: ApiError = {
        error: 'bad_request',
        message: 'Invalid path parameters',
        statusCode: 400,
      }
      return new Response(
        JSON.stringify({ ...errorResponse, details: error.errors }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 500 Internal Server Error (unexpected errors)
    const errorResponse: ApiError = {
      error: 'internal_server_error',
      message: 'Unexpected server error.',
      statusCode: 500,
    }
    return new Response(JSON.stringify(errorResponse), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
