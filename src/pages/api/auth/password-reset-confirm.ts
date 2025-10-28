import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { validatePasswordResetToken, markTokenAsUsed } from '@/lib/tokens'
import { hashPassword } from '@/lib/password'
import { lucia } from '@/lib/auth'
import { passwordResetConfirmSchema } from '@/schemas/auth'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()
    const { password } = passwordResetConfirmSchema.parse(body)
    const { token } = body

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Brak tokenu' }),
        { status: 400 }
      )
    }

    // Validate token
    const validation = await validatePasswordResetToken(token)
    if (!validation.valid || !validation.userId) {
      return new Response(
        JSON.stringify({ error: 'Link wygasł lub jest nieprawidłowy' }),
        { status: 400 }
      )
    }

    // Hash new password
    const passwordHash = await hashPassword(password)

    // Update user
    await db
      .update(users)
      .set({
        passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, validation.userId))

    // Mark token as used
    await markTokenAsUsed(token)

    // Invalidate all sessions (security)
    await lucia.invalidateUserSessions(validation.userId)

    // Event: password_reset_completed
    await db.insert(events).values({
      userId: validation.userId,
      eventType: 'password_reset_completed',
    })

    return new Response(
      JSON.stringify({ success: true, message: 'Hasło zostało zmienione' }),
      { status: 200 }
    )
  } catch (error) {
    console.error('Password reset confirm error:', error)
    return new Response(
      JSON.stringify({ error: 'Wystąpił błąd. Spróbuj ponownie.' }),
      { status: 500 }
    )
  }
}
