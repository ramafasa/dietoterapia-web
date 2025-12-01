import type { APIRoute } from 'astro'
import { getPatientDetailsParamsSchema, getPatientChartQuerySchema } from '../../../../../schemas/patient'
import { patientService } from '../../../../../lib/services/patientService'
import { mapErrorToApiError } from '../../../../../lib/errors'
import type { GetPatientChartResponse, ApiError } from '../../../../../types'

export const prerender = false

/**
 * GET /api/dietitian/patients/:patientId/chart - Pobieranie danych do wykresu wagi pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Path param validation (Zod schema - patientId UUID) → 400 jeśli nieprawidłowy
 * 4. Query params validation (Zod schema - period: 30 lub 90) → 400
 * 5. Business logic (PatientService.getPatientChartData) → 404 jeśli pacjent nie istnieje
 * 6. Response formatting (200 OK z patient + chartData)
 *
 * Path params:
 * - patientId: UUID v4 (wymagany)
 *
 * Query params:
 * - period: '30' | '90' (domyślnie: '30') - liczba dni wstecz
 *
 * Response includes:
 * - patient: PatientSummaryDTO (id, firstName, lastName, status)
 * - chartData:
 *   - entries: ChartDataPoint[] (punkty wykresu z MA7)
 *   - statistics: WeightStatistics (startWeight, endWeight, change, trend)
 *   - goalWeight: number | null (MVP: null)
 *
 * Error codes:
 * - 400: validation_error (nieprawidłowy patientId lub period)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 404: resource_not_found (pacjent nie istnieje lub nie jest pacjentem)
 * - 500: internal_server_error
 */
export const GET: APIRoute = async ({ params, url, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby zobaczyć wykres wagi pacjenta',
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
        message: 'Tylko dietetycy mogą przeglądać wykresy wagi pacjentów',
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

    // 4. Query params validation (Zod - period)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const validatedQuery = getPatientChartQuerySchema.parse(queryParams)

    // Parse period to number (30 or 90)
    const periodDays = parseInt(validatedQuery.period, 10) as 30 | 90

    // 5. Business logic (PatientService)
    const result: GetPatientChartResponse = await patientService.getPatientChartData(
      validatedParams.patientId,
      periodDays,
      user.id // dietitianId for analytics
    )

    // 6. Response formatting (200 OK)
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[GET /api/dietitian/patients/:patientId/chart] Error:', error)

    // Map error to ApiError
    const apiError = mapErrorToApiError(error)

    return new Response(JSON.stringify(apiError), {
      status: apiError.statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
