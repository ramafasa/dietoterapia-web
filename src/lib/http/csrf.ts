/**
 * CSRF protection helpers (Option B from api-plan.md)
 *
 * For cookie-based auth, unsafe HTTP methods must be protected against CSRF.
 * This helper enforces that requests originate from the same origin as the current request URL,
 * using a combination of modern browser headers (Sec-Fetch-Site) and Origin/Referer checks.
 *
 * Design goals:
 * - Block cross-site POST/PUT/PATCH/DELETE requests in browsers.
 * - Avoid breaking same-origin API calls.
 * - Be explicit and easy to use in API routes.
 *
 * Notes:
 * - In DEV we allow requests without Origin/Referer to keep curl/Postman ergonomic.
 * - In production, missing Origin/Referer AND missing Sec-Fetch-Site results in rejection.
 */

export type CsrfCheckResult =
  | { ok: true }
  | {
      ok: false
      details: {
        reason:
          | 'cross_site'
          | 'origin_mismatch'
          | 'referer_mismatch'
          | 'missing_headers'
        expectedOrigin: string
        origin?: string | null
        referer?: string | null
        secFetchSite?: string | null
      }
    }

/**
 * Check whether an unsafe request passes CSRF protection.
 *
 * Intended usage: call for POST/PUT/PATCH/DELETE endpoints after auth checks.
 */
export function checkCsrfForUnsafeRequest(request: Request): CsrfCheckResult {
  const expectedOrigin = new URL(request.url).origin

  const secFetchSite = request.headers.get('sec-fetch-site')
  if (secFetchSite) {
    // Most modern browsers set this. "cross-site" is the one we want to block.
    if (secFetchSite.toLowerCase() === 'cross-site') {
      return {
        ok: false,
        details: {
          reason: 'cross_site',
          expectedOrigin,
          secFetchSite,
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer'),
        },
      }
    }
    // "same-origin", "same-site", "none" → accept and don't require Origin/Referer.
    return { ok: true }
  }

  const origin = request.headers.get('origin')
  if (origin) {
    if (origin === expectedOrigin) return { ok: true }
    return {
      ok: false,
      details: {
        reason: 'origin_mismatch',
        expectedOrigin,
        origin,
        referer: request.headers.get('referer'),
        secFetchSite,
      },
    }
  }

  const referer = request.headers.get('referer')
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin
      if (refererOrigin === expectedOrigin) return { ok: true }
      return {
        ok: false,
        details: {
          reason: 'referer_mismatch',
          expectedOrigin,
          origin,
          referer,
          secFetchSite,
        },
      }
    } catch {
      // Malformed referer → treat as missing
    }
  }

  // No Sec-Fetch-Site and no Origin/Referer.
  // In production, we treat this as a failed CSRF check.
  if (import.meta.env.DEV) {
    return { ok: true }
  }

  return {
    ok: false,
    details: {
      reason: 'missing_headers',
      expectedOrigin,
      origin,
      referer,
      secFetchSite,
    },
  }
}


