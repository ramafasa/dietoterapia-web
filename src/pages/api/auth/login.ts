import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from '@/lib/password'
import { checkRateLimit, recordLoginAttempt } from '@/lib/rate-limit'
import { lucia } from '@/lib/auth'
import { loginSchema } from '@/schemas/auth'
import type { LoginResponse, ApiError } from '@/types'
import { ZodError } from 'zod'

export const prerender = false

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json()

    // Validate input with Zod
    let email: string
    let password: string
    try {
      const validated = loginSchema.parse(body)
      email = validated.email
      password = validated.password
    } catch (error) {
      if (error instanceof ZodError) {
        const apiError: ApiError = {
          error: 'Validation error',
          message: error.errors.map(e => e.message).join(', '),
          statusCode: 422
        }
        return new Response(
          JSON.stringify(apiError),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        )
      }
      throw error
    }

    // Rate limiting
    const rateLimit = await checkRateLimit(email)
    if (!rateLimit.allowed) {
      const apiError: ApiError = {
        error: 'Too many requests',
        message: `Zbyt wiele nieudanych prób. Spróbuj ponownie po ${rateLimit.lockedUntil?.toLocaleTimeString('pl-PL')}`,
        statusCode: 429
      }
      return new Response(
        JSON.stringify(apiError),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    if (!user) {
      await recordLoginAttempt(email, false, clientAddress, request.headers.get('user-agent') || undefined)
      const apiError: ApiError = {
        error: 'Unauthorized',
        message: 'Nieprawidłowy email lub hasło',
        statusCode: 401
      }
      return new Response(
        JSON.stringify(apiError),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Verify password
    const validPassword = await verifyPassword(password, user.passwordHash)
    if (!validPassword) {
      await recordLoginAttempt(email, false, clientAddress, request.headers.get('user-agent') || undefined)

      // Event: login_failed
      await db.insert(events).values({
        userId: user.id,
        eventType: 'login_failed',
        properties: { reason: 'invalid_password' },
      })

      const apiError: ApiError = {
        error: 'Unauthorized',
        message: 'Nieprawidłowy email lub hasło',
        statusCode: 401
      }
      return new Response(
        JSON.stringify(apiError),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Check user status (ujednolicenie kodu na 401 zgodnie z planem)
    if (user.status !== 'active') {
      const apiError: ApiError = {
        error: 'Unauthorized',
        message: 'Nieprawidłowy email lub hasło',
        statusCode: 401
      }
      return new Response(
        JSON.stringify(apiError),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Success - create session
    await recordLoginAttempt(email, true, clientAddress, request.headers.get('user-agent') || undefined)

    const session = await lucia.createSession(user.id, {})
    const sessionCookie = lucia.createSessionCookie(session.id)

    cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

    // Event: login_success
    await db.insert(events).values({
      userId: user.id,
      eventType: 'login_success',
      properties: { ip: clientAddress },
    })

    // Prepare LoginResponse according to DTO
    const response: LoginResponse = {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString()
      }
    }

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Login error:', error)
    const apiError: ApiError = {
      error: 'Internal server error',
      message: 'Wystąpił błąd. Spróbuj ponownie.',
      statusCode: 500
    }
    return new Response(
      JSON.stringify(apiError),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
