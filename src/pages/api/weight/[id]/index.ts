import type { APIRoute } from 'astro'
import { updateWeightEntrySchema } from '../../../schemas/weight'
import { weightEntryService, EditWindowExpiredError } from '../../../lib/services/weightEntryService'
import type { UpdateWeightEntryCommand, UpdateWeightEntryResponse, ApiError } from '../../../types'

export const prerender = false

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
  } catch (error: any) {
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
    if (error.name === 'NotFoundError') {
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
    if (error.name === 'ForbiddenError') {
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
