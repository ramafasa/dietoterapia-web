import type { APIRoute } from 'astro'
import { getPatientDetailsParamsSchema } from '../../../../schemas/patient'
import { patientService } from '../../../../lib/services/patientService'
import { mapErrorToApiError, NotFoundError } from '../../../../lib/errors'
import type { GetPatientDetailsResponse, ApiError } from '../../../../types'

export const prerender = false

/**
 * GET /api/dietitian/patients/:patientId - Pobieranie szczegółów pacjenta ze statystykami
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Path param validation (Zod schema) → 400 jeśli nieprawidłowy UUID
 * 4. Business logic (PatientService.getPatientDetails) → 404 jeśli pacjent nie istnieje
 * 5. Response formatting (200 OK z patient + statistics)
 *
 * Path params:
 * - patientId: UUID v4 (wymagany)
 *
 * Response includes:
 * - patient: Pick<User, 'id' | 'firstName' | 'lastName' | 'email' | 'age' | 'gender' | 'status' | 'createdAt' | 'updatedAt'>
 * - statistics: PatientStatistics
 *   - totalEntries: number
 *   - weeklyComplianceRate: number (0..1)
 *   - currentStreak: number (tygodnie)
 *   - longestStreak: number (tygodnie)
 *   - lastEntry: Date | null
 *
 * Error codes:
 * - 400: validation_error (nieprawidłowy patientId UUID)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 404: resource_not_found (pacjent nie istnieje lub nie ma roli 'patient')
 * - 500: internal_server_error
 */
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby zobaczyć szczegóły pacjenta',
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
        message: 'Tylko dietetycy mogą przeglądać szczegóły pacjentów',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Path param validation (Zod)
    const validatedParams = getPatientDetailsParamsSchema.parse({
      patientId: params.patientId,
    })

    // 4. Business logic (PatientService)
    const result: GetPatientDetailsResponse = await patientService.getPatientDetails(
      validatedParams.patientId,
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
  } catch (error: any) {
    console.error('[GET /api/dietitian/patients/:patientId] Error:', error)

    // Zod validation error → 400 Bad Request
    if (error.errors && Array.isArray(error.errors)) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Nieprawidłowe parametry zapytania',
        statusCode: 400,
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
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Domain errors (NotFoundError, AuthorizationError, etc.) → mapped to HTTP status
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
