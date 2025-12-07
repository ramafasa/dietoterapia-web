import type { APIRoute } from 'astro'
import { createInvitationSchema } from '../../../schemas/invitation'
import { invitationService, EmailAlreadyExistsError } from '../../../lib/services/invitationService'
import { invitationRepository } from '../../../lib/repositories/invitationRepository'
import { sendInvitationEmail, type SMTPConfig } from '../../../lib/email'
import type { CreateInvitationResponse, GetInvitationsResponse, ApiError } from '../../../types'
import { z } from 'zod'
import { isZodError } from '../../../utils/type-guards'

export const prerender = false

/**
 * GET /api/dietitian/invitations - Lista zaproszeń dietetyka
 *
 * Query params:
 * - limit (1..100, default 50)
 * - offset (>=0, default 0)
 * - status (all|pending|used|expired, default all)
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Query validation (Zod schema) → 400 jeśli nieprawidłowe parametry
 * 4. Repository call (InvitationRepository.getList)
 * 5. Response formatting (200 OK z invitations + pagination)
 */
export const GET: APIRoute = async ({ request, locals, url }) => {
  try {
    // 1. Authentication check
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany',
        statusCode: 401,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 2. Authorization check
    if (user.role !== 'dietitian') {
      const errorResponse: ApiError = {
        error: 'forbidden',
        message: 'Tylko dietetycy mogą przeglądać zaproszenia',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Query validation
    const querySchema = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
      status: z.enum(['all', 'pending', 'used', 'expired']).optional().default('all'),
    })

    const params = querySchema.parse({
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
      status: url.searchParams.get('status') ?? undefined,
    })

    // 4. Repository call
    const { items, total } = await invitationRepository.getList(user.id, {
      limit: params.limit,
      offset: params.offset,
      status: params.status,
    })

    // 5. Response formatting
    const response: GetInvitationsResponse = {
      invitations: items,
      pagination: {
        total,
        limit: params.limit,
        offset: params.offset,
        hasMore: params.offset + params.limit < total,
      },
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    console.error('[GET /api/dietitian/invitations] Error:', error)

    // Zod validation error → 400 Bad Request
    if (isZodError(error)) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Nieprawidłowe parametry zapytania',
        statusCode: 400,
      }
      return new Response(
        JSON.stringify({
          ...errorResponse,
          details: error.errors.map((err) => ({
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

    // 500 Internal Server Error
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
 * POST /api/dietitian/invitations - Tworzenie zaproszenia dla nowego pacjenta
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Request validation (Zod schema) → 400 jeśli nieprawidłowy email
 * 4. Business logic (InvitationService) → 409 jeśli email już istnieje
 * 5. Budowa linku rejestracyjnego
 * 6. Wysyłka emaila z zaproszeniem
 * 7. Response formatting (201 Created z invitation + message)
 *
 * Error codes:
 * - 400: validation_error (nieprawidłowy email)
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 409: email_already_exists (użytkownik już istnieje)
 * - 500: internal_server_error / email_send_failed
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // 1. Authentication check (Lucia middleware fills locals.user)
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby wysłać zaproszenie',
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
        message: 'Tylko dietetycy mogą wysyłać zaproszenia',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Request validation (Zod)
    const body = await request.json()
    const validatedData = createInvitationSchema.parse(body)

    // 4. Business logic (InvitationService)
    // Service returns both invitation (with tokenHash) and raw token for email
    const { invitation, token } = await invitationService.createInvitation({
      email: validatedData.email,
      createdBy: user.id,
    })

    // 5. Budowa linku rejestracyjnego
    // Use PUBLIC_APP_URL from env or fallback to Astro.site
    const appOrigin = import.meta.env.PUBLIC_APP_URL || 'https://paulinamaciak.pl'
    const inviteLink = `${appOrigin}/auth/signup?token=${token}` // Use raw token (NOT hash)

    // 6. Wysyłka emaila
    // Pobierz imię i nazwisko dietetyka do emaila
    const dietitian = await invitationRepository.findUserById(user.id)
    const dietitianName = dietitian?.firstName && dietitian?.lastName
      ? `${dietitian.firstName} ${dietitian.lastName}`
      : undefined

    // Konfiguracja SMTP (OVH)
    const smtpConfig: SMTPConfig = {
      host: import.meta.env.SMTP_HOST || 'ssl0.ovh.net',
      port: parseInt(import.meta.env.SMTP_PORT || '465'),
      user: import.meta.env.SMTP_USER || '',
      pass: import.meta.env.SMTP_PASS || '',
    }

    // Tryb dev - log do konsoli zamiast wysyłać email
    const isDev = import.meta.env.DEV || false

    try {
      await sendInvitationEmail(
        invitation.email,
        inviteLink,
        dietitianName,
        smtpConfig,
        isDev
      )
    } catch (emailError) {
      console.error('[POST /api/dietitian/invitations] Email send error:', emailError)

      // Email się nie powiódł, ale zaproszenie zostało utworzone
      // Zwróć 500 z informacją o błędzie wysyłki
      const errorResponse: ApiError = {
        error: 'email_send_failed',
        message: 'Zaproszenie zostało utworzone, ale nie udało się wysłać emaila',
        statusCode: 500,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 7. Response formatting (201 Created)
    // SECURITY: Do NOT return raw token or tokenHash in response
    const response: CreateInvitationResponse = {
      invitation: {
        id: invitation.id,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
        createdBy: invitation.createdBy,
      },
      message: 'Zaproszenie zostało wysłane pomyślnie',
    }

    return new Response(JSON.stringify(response), {
      status: 201,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store', // Dane operacyjne - nie cache'uj
      },
    })
  } catch (error: unknown) {
    console.error('[POST /api/dietitian/invitations] Error:', error)

    // EmailAlreadyExistsError → 409 Conflict
    if (error instanceof EmailAlreadyExistsError) {
      const errorResponse: ApiError = {
        error: 'email_already_exists',
        message: error.message,
        statusCode: 409,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Zod validation error → 400 Bad Request
    if (isZodError(error)) {
      const errorResponse: ApiError = {
        error: 'validation_error',
        message: 'Nieprawidłowe dane wejściowe',
        statusCode: 400,
      }
      return new Response(
        JSON.stringify({
          ...errorResponse,
          details: error.errors.map((err) => ({
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
