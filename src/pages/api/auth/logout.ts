import type { APIRoute } from 'astro'
import { lucia } from '@/lib/auth'

export const POST: APIRoute = async ({ cookies }) => {
  const sessionId = cookies.get(lucia.sessionCookieName)?.value

  if (sessionId) {
    await lucia.invalidateSession(sessionId)
  }

  const blankCookie = lucia.createBlankSessionCookie()
  cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes)

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200 }
  )
}
