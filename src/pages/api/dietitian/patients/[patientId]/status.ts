import type { APIRoute } from 'astro'
import { getPatientDetailsParamsSchema } from '../../../../../schemas/patient'
import { updatePatientStatusSchema } from '../../../../../utils/validation'
import { patientService } from '../../../../../lib/services/patientService'
import { mapErrorToApiError } from '../../../../../lib/errors'
import type { UpdatePatientStatusRequest, UpdatePatientStatusResponse, ApiError, UpdatePatientStatusCommand } from '../../../../../types'

export const prerender = false

/**
 * PATCH /api/dietitian/patients/:patientId/status - Aktualizacja statusu pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Path param validation (Zod schema) → 400 jeśli nieprawidłowy UUID
 * 4. Request body validation (Zod schema) → 400 jeśli nieprawidłowe dane
 * 5. Business logic (PatientService.updatePatientStatus) → 404 jeśli pacjent nie istnieje
 * 6. Response formatting (200 OK z patient + message)
 *
 * Path params:
 * - patientId: UUID v4 (wymagany)
 *
 * Request body:
 * - status: 'active' | 'paused' | 'ended' (wymagany)
 * - note: string (≤ 500 znaków, opcjonalny) - trafia tylko do audit log
 *
 * Response includes:
 * - patient: { id, firstName, lastName, status, updatedAt }
 * - message: string (zależny od nowego statusu)
 *
 * Komunikaty message:
 * - active: "Patient status updated. Reminders will resume."
 * - paused: "Patient status updated. Reminders will be paused."
 * - ended: "Patient status updated. Account scheduled for deletion in 24 months."
 *
 * Error codes:
 * - 400: validation_error (nieprawidłowy patientId UUID lub request body)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 404: resource_not_found (pacjent nie istnieje lub nie ma roli 'patient')
 * - 500: internal_server_error
 */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby zaktualizować status pacjenta',
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
        message: 'Tylko dietetycy mogą aktualizować status pacjentów',
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

    // 4. Request body validation (Zod)
    const requestBody = await request.json()
    const validatedBody = updatePatientStatusSchema.parse(requestBody) as UpdatePatientStatusRequest

    // 5. Business logic (PatientService)
    const command: UpdatePatientStatusCommand = {
      patientId: validatedParams.patientId,
      status: validatedBody.status,
      note: validatedBody.note,
      dietitianId: user.id,
    }

    const updatedPatient = await patientService.updatePatientStatus(command)

    // 6. Przygotuj message w zależności od nowego statusu
    let message: string
    switch (validatedBody.status) {
      case 'active':
        message = 'Patient status updated. Reminders will resume.'
        break
      case 'paused':
        message = 'Patient status updated. Reminders will be paused.'
        break
      case 'ended':
        message = 'Patient status updated. Account scheduled for deletion in 24 months.'
        break
      default:
        message = 'Patient status updated.'
    }

    // 7. Response formatting (200 OK)
    const response: UpdatePatientStatusResponse = {
      patient: updatedPatient,
      message,
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // Dane dynamiczne - nie cache'uj
      },
    })
  } catch (error: unknown) {
    console.error('[PATCH /api/dietitian/patients/:patientId/status] Error:', error)

    // Zod validation error → 400 Bad Request
    if (error.errors && Array.isArray(error.errors)) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Nieprawidłowe dane wejściowe',
        statusCode: 400,
      }
      return new Response(
        JSON.stringify({
          ...errorResponse,
          details: error.errors.map((err: any) => ({
            field: err.path.join('.'),
            message: err.message,
          })),
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Domain errors (NotFoundError, ValidationError, etc.)
    const { apiError, statusCode } = mapErrorToApiError(error)
    return new Response(JSON.stringify(apiError), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
