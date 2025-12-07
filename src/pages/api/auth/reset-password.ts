import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { validatePasswordResetToken, markTokenAsUsed } from '@/lib/tokens'
import { hashPasswordV2 } from '@/lib/password'
import { lucia } from '@/lib/auth'
import { resetPasswordSchema } from '@/schemas/auth'
import { ZodError } from 'zod'

export const prerender = false

/**
 * POST /api/auth/reset-password
 *
 * Resets user password based on one-time token sent in password reset email.
 * After successful password update, invalidates all existing user sessions.
 *
 * Request body:
 * - token (string): one-time password reset token (valid for 60 minutes)
 * - newPassword (string): new user password (min 8 chars, must contain uppercase, lowercase, digit)
 *
 * Responses:
 * - 200 OK: Password reset successfully
 * - 400 Bad Request: Invalid/expired token or weak password
 * - 422 Unprocessable Entity: Validation error (missing fields, wrong type)
 * - 500 Internal Server Error: Unexpected server error
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Parse and validate request body
    const body = await request.json()
    const { token, newPassword } = resetPasswordSchema.parse(body)

    // 2. Validate token (check existence, expiration, not used)
    const validation = await validatePasswordResetToken(token)
    if (!validation.valid || !validation.userId) {
      return new Response(
        JSON.stringify({
          error: 'invalid_token',
          message: 'Invalid or expired token',
          statusCode: 400,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // 3. Hash new password (v2: double hashing - bcrypt on SHA-256 hash)
    // newPassword is already SHA-256 hash (64 chars) from frontend
    const passwordHash = await hashPasswordV2(newPassword)

    // 4. Transaction: Update password + Mark token as used
    await db.transaction(async (tx) => {
      // Update user password and updatedAt timestamp
      await tx
        .update(users)
        .set({
          passwordHash,
          updatedAt: new Date(),
        })
        .where(eq(users.id, validation.userId!))

      // Mark token as used (prevent reuse) - pass transaction context
      await markTokenAsUsed(token, tx)
    })

    // 5. Invalidate all user sessions (security: force re-login with new password)
    await lucia.invalidateUserSessions(validation.userId)

    // 6. (Optional) Track analytics event
    await db.insert(events).values({
      userId: validation.userId,
      eventType: 'password_reset_completed',
      properties: { method: 'email_token' },
    })

    // 7. Return success response
    return new Response(
      JSON.stringify({
        message: 'Password reset successfully. Please log in with your new password.',
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    )

  } catch (error) {
    // Handle Zod validation errors (422 Unprocessable Entity)
    if (error instanceof ZodError) {
      const firstError = error.errors[0]
      return new Response(
        JSON.stringify({
          error: 'validation_error',
          message: firstError?.message || 'Invalid request body',
          statusCode: 422,
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    // Log unexpected errors (without PII)
    console.error('Password reset error:', {
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    // Return generic 500 error (don't leak implementation details)
    return new Response(
      JSON.stringify({
        error: 'server_error',
        message: 'Unexpected server error',
        statusCode: 500,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}
