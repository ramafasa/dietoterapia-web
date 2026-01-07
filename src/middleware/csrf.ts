/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks by validating
 * that POST/PUT/PATCH/DELETE requests originate from the same site.
 *
 * Exceptions:
 * - Webhooks from external services (e.g., Tpay payment callbacks)
 * - These endpoints are secured by signature verification instead
 */

import { defineMiddleware } from 'astro:middleware'

// Paths that should skip CSRF validation (webhooks from external services)
const CSRF_EXEMPT_PATHS = [
  '/api/pzk/purchase/callback', // Tpay webhook (secured by signature)
]

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
  // Only check CSRF for state-changing methods
  const isStateMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(
    request.method
  )

  if (!isStateMutatingMethod) {
    return next()
  }

  // Skip CSRF check for whitelisted paths (webhooks)
  const isExemptPath = CSRF_EXEMPT_PATHS.some(path => url.pathname === path)

  if (isExemptPath) {
    console.log('[CSRF] Skipping CSRF check for webhook:', url.pathname)
    return next()
  }

  // Validate CSRF: check Origin header matches Host
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')

  // Allow requests without Origin header (e.g., same-origin form submissions)
  // Modern browsers always send Origin for cross-origin requests
  if (!origin) {
    return next()
  }

  // Extract hostname from origin (remove protocol)
  const originHost = new URL(origin).host

  // Block cross-origin requests
  if (originHost !== host) {
    console.error('[CSRF] Blocked cross-origin request:', {
      origin: originHost,
      host,
      path: url.pathname,
    })

    return new Response('Cross-site POST form submissions are forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  // Allow same-origin requests
  return next()
})
