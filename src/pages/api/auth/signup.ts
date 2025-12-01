/**
 * POST /api/auth/signup
 *
 * Rejestracja nowego pacjenta na podstawie zaproszenia od dietetyka.
 *
 * Request Body (JSON):
 * - invitationToken: string (wymagany)
 * - email: string (wymagany, format email)
 * - password: string (wymagany, min. 8 znaków)
 * - firstName: string (wymagany)
 * - lastName: string (wymagany)
 * - age: number (opcjonalny)
 * - gender: 'male' | 'female' | 'other' (opcjonalny)
 * - consents: Array<{type, text, accepted}> (wymagany, zgody data_processing i health_data muszą być zaakceptowane)
 *
 * Responses:
 * - 201 Created: Rejestracja udana, zwraca user + session
 * - 400 Bad Request: Nieprawidłowy/wygasły/użyty token zaproszenia, brak wymaganych zgód
 * - 409 Conflict: Email już zarejestrowany
 * - 422 Unprocessable Entity: Błąd walidacji danych wejściowych
 * - 500 Internal Server Error: Błąd serwera
 */

import type { APIRoute } from 'astro'
import { signupSchema } from '@/schemas/auth'
import { signup } from '@/lib/services/authService'
import { createSession, setSessionCookie } from '@/lib/auth'
import { mapErrorToApiError, ValidationError } from '@/lib/errors'
import type { SignupRequest, SignupResponse, ApiError } from '@/types'
import { ZodError } from 'zod'

export const prerender = false

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    // 1. Parse JSON body
    const body = await request.json()

    // 2. Validate input with Zod
    let validatedInput: SignupRequest
    try {
      validatedInput = signupSchema.parse(body) as SignupRequest
    } catch (error) {
      if (error instanceof ZodError) {
        // Map Zod errors to ValidationError
        const validationError = new ValidationError(
          'Dane wejściowe są nieprawidłowe',
          'validation_failed',
          error.errors
        )
        const { apiError, statusCode } = mapErrorToApiError(validationError)
        return new Response(JSON.stringify(apiError), {
          status: statusCode,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw error
    }

    // 3. Call authService.signup (business logic + DB transaction)
    const { user, userId } = await signup(validatedInput)

    // 4. Create Lucia session
    const session = await createSession(userId)

    // 5. Set session cookie
    setSessionCookie(session.id, cookies)

    // 6. Prepare SignupResponse according to DTO
    const response: SignupResponse = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        age: user.age,
        gender: user.gender,
        status: user.status,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
      },
    }

    // 7. Return 201 Created
    return new Response(JSON.stringify(response), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    // Map domain errors to API errors
    const { apiError, statusCode } = mapErrorToApiError(error)

    console.error('[POST /api/auth/signup] Error:', error)

    return new Response(JSON.stringify(apiError), {
      status: statusCode,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
