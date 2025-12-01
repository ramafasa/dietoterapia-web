import type { APIRoute, APIContext } from 'astro'
import { lucia } from '@/lib/auth'
import type { ApiError } from '@/types'

const JSON_HEADERS = {
  'Content-Type': 'application/json'
} as const

const clearSessionCookie = (cookieStore: APIContext['cookies']) => {
  const blankCookie = lucia.createBlankSessionCookie()
  cookieStore.set(blankCookie.name, blankCookie.value, blankCookie.attributes)
}

const buildErrorResponse = (error: ApiError) =>
  new Response(JSON.stringify(error), {
    status: error.statusCode,
    headers: JSON_HEADERS
  })

export const POST: APIRoute = async ({ cookies }) => {
  try {
    const sessionId = cookies.get(lucia.sessionCookieName)?.value ?? null

    if (!sessionId) {
      clearSessionCookie(cookies)
      return buildErrorResponse({
        error: 'Unauthorized',
        message: 'Brak ważnej sesji',
        statusCode: 401
      })
    }

    const { session } = await lucia.validateSession(sessionId)
    if (!session) {
      clearSessionCookie(cookies)
      return buildErrorResponse({
        error: 'Unauthorized',
        message: 'Brak ważnej sesji',
        statusCode: 401
      })
    }

    await lucia.invalidateSession(sessionId)
    clearSessionCookie(cookies)

    // TODO: Integrate analytics/audit logging (logout event) when the pipeline is available.
    return new Response(null, { status: 204 })
  } catch (error) {
    console.error('Logout error', error)
    clearSessionCookie(cookies)
    return buildErrorResponse({
      error: 'Internal Server Error',
      message: 'Wewnętrzny błąd serwera',
      statusCode: 500
    })
  }
}
