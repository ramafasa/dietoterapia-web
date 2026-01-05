/**
 * GET /api/auth/session
 *
 * Returns current session information (client-side auth check).
 *
 * Response (Authenticated - 200):
 * {
 *   id: string,
 *   email: string,
 *   role: 'patient' | 'dietitian'
 * }
 *
 * Response (Not Authenticated - 401):
 * null (empty response)
 */

import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(null, {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    })
  }

  return new Response(
    JSON.stringify({
      id: locals.user.id,
      email: locals.user.email,
      role: locals.user.role,
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
    }
  )
}
