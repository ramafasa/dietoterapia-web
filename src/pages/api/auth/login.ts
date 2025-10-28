import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { verifyPassword } from '@/lib/password'
import { checkRateLimit, recordLoginAttempt } from '@/lib/rate-limit'
import { lucia } from '@/lib/auth'
import { loginSchema } from '@/schemas/auth'

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  try {
    const body = await request.json()
    const { email, password } = loginSchema.parse(body)

    // Rate limiting
    const rateLimit = await checkRateLimit(email)
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({
          error: `Zbyt wiele nieudanych prób. Spróbuj ponownie po ${rateLimit.lockedUntil?.toLocaleTimeString('pl-PL')}`,
        }),
        { status: 429 }
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
      return new Response(
        JSON.stringify({ error: 'Nieprawidłowy email lub hasło' }),
        { status: 401 }
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

      return new Response(
        JSON.stringify({ error: 'Nieprawidłowy email lub hasło' }),
        { status: 401 }
      )
    }

    // Check user status
    if (user.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'Konto nieaktywne. Skontaktuj się z dietetykiem.' }),
        { status: 403 }
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

    // Redirect based on role
    const redirectUrl = user.role === 'dietitian' ? '/dietetyk/pacjenci' : '/pacjent/waga'

    return new Response(
      JSON.stringify({ success: true, redirectUrl }),
      { status: 200 }
    )
  } catch (error) {
    console.error('Login error:', error)
    return new Response(
      JSON.stringify({ error: 'Wystąpił błąd. Spróbuj ponownie.' }),
      { status: 500 }
    )
  }
}
