import type { APIRoute } from 'astro'
import { confirmOutlierSchema } from '../../../../schemas/weight'
import { weightEntryService, NotFoundError, ForbiddenError } from '../../../../lib/services/weightEntryService'
import type { ConfirmOutlierResponse, ApiError } from '../../../../types'

export const prerender = false

/**
 * POST /api/weight/:id/confirm - Potwierdzenie lub odrzucenie anomalii wagi
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Request validation:
 *    - Walidacja ID (UUID format)
 *    - Walidacja body (Zod schema) → 422 jeśli nieprawidłowe dane
 * 3. Business logic (WeightEntryService.confirmOutlier):
 *    - Weryfikacja istnienia wpisu → 404 jeśli nie istnieje
 *    - Autoryzacja RBAC (patient/dietitian) → 403 jeśli brak uprawnień
 *    - Walidacja isOutlier=true → 400 jeśli nie jest anomalią
 *    - Idempotencja (jeśli już ustawione)
 *    - Aktualizacja + audit log + event tracking
 * 4. Response formatting (200 OK z zaktualizowanym entry)
 *
 * Business rules:
 * - Pacjent może potwierdzać tylko własne wpisy
 * - Dietetyk może potwierdzać wpisy pacjentów (zgodnie z relacją RBAC)
 * - Wpis musi mieć isOutlier=true
 * - Operacja jest idempotentna (powtórne wywołanie z tą samą wartością zwraca 200)
 *
 * Error codes:
 * - 400: not_outlier (wpis nie jest oznaczony jako anomalia)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (brak uprawnień do wpisu)
 * - 404: not_found (wpis nie istnieje)
 * - 422: validation_error (nieprawidłowe dane wejściowe)
 * - 500: internal_server_error
 */
export const POST: APIRoute = async ({ request, locals, params }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby potwierdzić anomalię',
        statusCode: 401,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Extract and validate entry ID from URL params
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

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(entryId)) {
      const errorResponse: ApiError = {
        error: 'bad_request',
        message: 'ID wpisu musi być w formacie UUID',
        statusCode: 400,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Request body validation (Zod)
    const body = await request.json()
    const validatedData = confirmOutlierSchema.parse(body)

    // 4. Business logic (WeightEntryService)
    const result = await weightEntryService.confirmOutlier({
      id: entryId,
      confirmed: validatedData.confirmed,
      sessionUserId: user.id,
      sessionUserRole: user.role,
    })

    // 5. Response formatting (200 OK)
    const response: ConfirmOutlierResponse = {
      entry: result,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error: unknown) {
    console.error('[POST /api/weight/:id/confirm] Error:', error)

    // NotFoundError → 404 Not Found
    if (error instanceof NotFoundError || error.name === 'NotFoundError') {
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
    if (error instanceof ForbiddenError || error.name === 'ForbiddenError') {
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

    // Generic Error with "nie jest oznaczony jako anomalia" → 400 Bad Request
    if (error.message && error.message.includes('nie jest oznaczony jako anomalia')) {
      const errorResponse: ApiError = {
        error: 'not_outlier',
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
