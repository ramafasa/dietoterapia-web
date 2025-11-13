import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generatePasswordResetToken } from '@/lib/tokens'
import { sendPasswordResetEmail } from '@/lib/email'
import { passwordResetRequestSchema } from '@/schemas/auth'
import { ZodError } from 'zod'
import type { ForgotPasswordResponse, ApiError } from '@/types'
import type { CreateEventCommand } from '@/types'

const SUCCESS_MESSAGE = 'If an account exists with this email, a password reset link has been sent.'
const GENERIC_ERROR_MESSAGE = 'Internal server error'
const DEFAULT_USER_FALLBACK_NAME = 'Użytkowniku'

function jsonResponse<T>(body: T, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

async function recordEvent(event: CreateEventCommand) {
  try {
    await db.insert(events).values(event)
  } catch (eventError) {
    console.error('Password reset request event logging error:', eventError)
  }
}

/**
 * Handles password reset link requests.
 *
 * The response is neutral to avoid email enumeration and always returns 200 for valid payloads,
 * regardless of whether the account exists or the email dispatch succeeds.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type')
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      return jsonResponse<ApiError>(
        { error: 'Invalid Content-Type', message: 'Content-Type must be application/json', statusCode: 400 },
        400
      )
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse<ApiError>(
        { error: 'Invalid JSON', message: 'Invalid JSON payload', statusCode: 400 },
        400
      )
    }

    const { email } = passwordResetRequestSchema.parse(body)
    const normalizedEmail = email.trim().toLowerCase()

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1)

    // Always return success (security - don't reveal if email exists)
    if (!user) {
      return jsonResponse<ForgotPasswordResponse>({ message: SUCCESS_MESSAGE }, 200)
    }

    const siteUrl = process.env.SITE_URL
    if (!siteUrl) {
      console.error('Password reset request error: SITE_URL environment variable is not set')
      return jsonResponse<ApiError>(
        { error: GENERIC_ERROR_MESSAGE, message: 'Config variable SITE_URL is missing', statusCode: 500 },
        500
      )
    }

    const token = await generatePasswordResetToken(user.id)
    const resetLink = `${siteUrl.replace(/\/$/, '')}/reset-hasla/${token}`

    let emailSent = true
    try {
      const recipientName = user.firstName?.trim() || DEFAULT_USER_FALLBACK_NAME
      await sendPasswordResetEmail(user.email, resetLink, recipientName)
    } catch (emailError) {
      emailSent = false
      console.error('Password reset email error:', emailError)
      await recordEvent({
        userId: user.id,
        eventType: 'password_reset_email_failed',
      })
    }

    await recordEvent({
      userId: user.id,
      eventType: 'password_reset_requested',
      properties: emailSent ? undefined : { emailSent: false },
    })

    return jsonResponse<ForgotPasswordResponse>({ message: SUCCESS_MESSAGE }, 200)
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonResponse<ApiError>(
        { error: 'Invalid email format', message: 'Invalid email format', statusCode: 400 },
        400
      )
    }

    console.error('Password reset request error:', error)
    return jsonResponse<ApiError>({ error: GENERIC_ERROR_MESSAGE, message: GENERIC_ERROR_MESSAGE, statusCode: 500 }, 500)
  }
}
