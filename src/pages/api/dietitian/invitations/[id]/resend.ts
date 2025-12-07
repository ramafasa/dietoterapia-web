import type { APIRoute } from 'astro'
import { invitationRepository } from '../../../../../lib/repositories/invitationRepository'
import { eventRepository } from '../../../../../lib/repositories/eventRepository'
import { sendInvitationEmail, type SMTPConfig } from '../../../../../lib/email'
import type { ResendInvitationResponse, ApiError } from '../../../../../types'

export const prerender = false

/**
 * POST /api/dietitian/invitations/:id/resend - Ponowne wysłanie zaproszenia
 *
 * Flow:
 * 1. Authentication check (Lucia session) → 401 jeśli brak
 * 2. Authorization check (role === 'dietitian') → 403 jeśli nie dietetyk
 * 3. Repository call (resendInvitation) - unieważnia stare, tworzy nowe
 * 4. Budowa linku rejestracyjnego (z nowym tokenem)
 * 5. Wysyłka emaila
 * 6. Event tracking (signup_invite_sent)
 * 7. Response formatting (200 OK z invitation + message)
 *
 * Error codes:
 * - 400: invalid_invitation_id
 * - 401: unauthorized (brak sesji)
 * - 403: forbidden (rola inna niż dietitian)
 * - 404: not_found (zaproszenie nie istnieje)
 * - 500: internal_server_error / email_send_failed
 */
export const POST: APIRoute = async ({ params, locals }) => {
  try {
    // 1. Authentication check
    const user = locals.user

    if (!user) {
      const errorResponse: ApiError = {
        error: 'unauthorized',
        message: 'Musisz być zalogowany, aby wysłać ponownie zaproszenie',
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
        message: 'Tylko dietetycy mogą wysyłać ponownie zaproszenia',
        statusCode: 403,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 3. Walidacja ID zaproszenia
    const invitationId = params.id

    if (!invitationId) {
      const errorResponse: ApiError = {
        error: 'invalid_invitation_id',
        message: 'Nieprawidłowe ID zaproszenia',
        statusCode: 400,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 4. Repository call - unieważnia stare, tworzy nowe zaproszenie
    let newInvitation
    try {
      newInvitation = await invitationRepository.resendInvitation(invitationId, user.id)
    } catch (error: unknown) {
      if (error.message === 'Invitation not found') {
        const errorResponse: ApiError = {
          error: 'not_found',
          message: 'Zaproszenie nie zostało znalezione',
          statusCode: 404,
        }
        return new Response(JSON.stringify(errorResponse), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      if (error.message?.includes('Unauthorized')) {
        const errorResponse: ApiError = {
          error: 'forbidden',
          message: 'Nie masz uprawnień do tego zaproszenia',
          statusCode: 403,
        }
        return new Response(JSON.stringify(errorResponse), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      throw error // Rethrow dla obsługi 500
    }

    // 5. Budowa linku rejestracyjnego
    const appOrigin = import.meta.env.PUBLIC_APP_URL || 'https://paulinamaciak.pl'
    const inviteLink = `${appOrigin}/auth/signup?token=${newInvitation.token}`

    // 6. Pobierz dane dietetyka do emaila
    const dietitian = await invitationRepository.findUserById(user.id)
    const dietitianName = dietitian?.firstName && dietitian?.lastName
      ? `${dietitian.firstName} ${dietitian.lastName}`
      : undefined

    // 7. Konfiguracja SMTP (OVH)
    const smtpConfig: SMTPConfig = {
      host: import.meta.env.SMTP_HOST || 'ssl0.ovh.net',
      port: parseInt(import.meta.env.SMTP_PORT || '465'),
      user: import.meta.env.SMTP_USER || '',
      pass: import.meta.env.SMTP_PASS || '',
    }

    const isDev = import.meta.env.DEV || false

    // 8. Wysyłka emaila
    try {
      await sendInvitationEmail(
        newInvitation.email,
        inviteLink,
        dietitianName,
        smtpConfig,
        isDev
      )
    } catch (emailError) {
      console.error('[POST /api/dietitian/invitations/:id/resend] Email send error:', emailError)

      const errorResponse: ApiError = {
        error: 'email_send_failed',
        message: 'Nowe zaproszenie zostało utworzone, ale nie udało się wysłać emaila',
        statusCode: 500,
      }
      return new Response(JSON.stringify(errorResponse), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // 9. Event tracking (nieblokujące)
    eventRepository.create({
      userId: user.id,
      eventType: 'signup_invite_sent',
      properties: {
        method: 'resend',
        invitationId: newInvitation.id,
        email: newInvitation.email,
      },
    }).catch((error) => {
      console.error('[POST /api/dietitian/invitations/:id/resend] Event tracking error:', error)
      // Nie blokuj głównego flow
    })

    // 10. Response formatting
    const now = new Date()
    let status: 'pending' | 'used' | 'expired'

    if (newInvitation.usedAt !== null) {
      status = 'used'
    } else if (newInvitation.expiresAt < now) {
      status = 'expired'
    } else {
      status = 'pending'
    }

    const response: ResendInvitationResponse = {
      invitation: {
        id: newInvitation.id,
        email: newInvitation.email,
        status,
        createdAt: newInvitation.createdAt,
        expiresAt: newInvitation.expiresAt,
        createdBy: newInvitation.createdBy,
      },
      message: 'Zaproszenie zostało wysłane ponownie',
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: unknown) {
    console.error('[POST /api/dietitian/invitations/:id/resend] Error:', error)

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
