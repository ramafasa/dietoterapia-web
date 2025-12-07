import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { validatePasswordResetToken, markTokenAsUsed } from '@/lib/tokens'
import { hashPasswordV2 } from '@/lib/password'
import { lucia } from '@/lib/auth'
import { passwordResetConfirmSchemaServer } from '@/schemas/auth'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()
    const { token, password } = passwordResetConfirmSchemaServer.parse(body)

    // Validate token
    const validation = await validatePasswordResetToken(token)
    if (!validation.valid || !validation.userId) {
      return new Response(
        JSON.stringify({ error: 'Link wygasł lub jest nieprawidłowy' }),
        { status: 400 }
      )
    }

    // Hash new password (v2: double hashing - bcrypt on SHA-256 hash)
    // password is already SHA-256 hash (64 chars) from frontend
    const passwordHash = await hashPasswordV2(password)

    // Transaction: Update password + Mark token as used + Log event
    await db.transaction(async (tx) => {
      // Update user password
      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, validation.userId))

      // Mark token as used (prevent reuse) - pass transaction context
      await markTokenAsUsed(token, tx)

      // Event: password_reset_completed
      await tx.insert(events).values({
        userId: validation.userId,
        eventType: 'password_reset_completed',
      })
    })

    // Invalidate all sessions (security) - outside transaction
    await lucia.invalidateUserSessions(validation.userId)

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
