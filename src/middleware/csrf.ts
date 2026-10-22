/**
 * CSRF Protection Middleware
 *
 * Protects against Cross-Site Request Forgery attacks by validating
 * that POST/PUT/PATCH/DELETE requests originate from the same site.
 *
 * Opaque / invalid Origin (`null`, garbage): 403, unless `Sec-Fetch-Site: same-origin` (see below).
 *
 * Exceptions:
 * - Webhooks from external services (e.g., Tpay payment callbacks)
 * - These endpoints are secured by signature verification instead
 */

import { defineMiddleware } from 'astro:middleware'

// Paths that should skip CSRF validation (webhooks from external services)
const CSRF_EXEMPT_PATHS = [
  '/api/pzk/purchase/callback', // Tpay webhook (secured by signature)
  '/api/sklep/platnosc/callback', // Tpay webhook sklepu (secured by signature)
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

  // Extract host from origin. `Origin: null` (opaque origin – e.g. Referrer-Policy: no-referrer on the
  // submitting page, sandboxed iframe, privacy settings) or a garbage value must never throw (→ 500).
  // Such a request is allowed only when the browser itself vouches for it with
  // `Sec-Fetch-Site: same-origin` (forbidden header – page JS cannot set it; non-browser clients
  // are not a CSRF vector). Otherwise → 403.
  const originHost = parseOriginHost(origin)

  if (originHost === null) {
    if (request.headers.get('sec-fetch-site') === 'same-origin') {
      return next()
    }

    console.error('[CSRF] Blocked request with opaque/invalid Origin:', {
      origin: origin.slice(0, 64),
      path: url.pathname,
    })
    return forbidden()
  }

  // Block cross-origin requests
  if (originHost !== host) {
    console.error('[CSRF] Blocked cross-origin request:', {
      origin: originHost,
      host,
      path: url.pathname,
    })

    return forbidden()
  }

  // Allow same-origin requests
  return next()
})

/** Host of an Origin header value; null for `null` / unparseable / non-http(s) origins. */
function parseOriginHost(origin: string): string | null {
  if (origin === 'null') return null
  try {
    const parsed = new URL(origin)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.host || null
  } catch {
    return null
  }
}

function forbidden(): Response {
  return new Response('Cross-site POST form submissions are forbidden', {
    status: 403,
    headers: { 'Content-Type': 'text/plain' },
  })
}
