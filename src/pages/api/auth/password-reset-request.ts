import type { APIRoute } from 'astro'
import { db } from '@/db'
import { users, events } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { generatePasswordResetToken } from '@/lib/tokens'
import { sendPasswordResetEmail } from '@/lib/email'
import { passwordResetRequestSchema } from '@/schemas/auth'

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json()
    const { email } = passwordResetRequestSchema.parse(body)

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1)

    // Always return success (security - don't reveal if email exists)
    if (!user) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Jeśli konto istnieje, wysłaliśmy link do resetu hasła.',
        }),
        { status: 200 }
      )
    }

    // Generate token
    const token = await generatePasswordResetToken(user.id)
    const resetLink = `${process.env.SITE_URL}/reset-hasla/${token}`

    // Send email
    await sendPasswordResetEmail(user.email, resetLink, user.firstName || 'Użytkowniku')

    // Event: password_reset_requested
    await db.insert(events).values({
      userId: user.id,
      eventType: 'password_reset_requested',
    })

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Jeśli konto istnieje, wysłaliśmy link do resetu hasła.',
      }),
      { status: 200 }
    )
  } catch (error) {
    console.error('Password reset request error:', error)
    return new Response(
      JSON.stringify({ error: 'Wystąpił błąd. Spróbuj ponownie.' }),
      { status: 500 }
    )
  }
}
