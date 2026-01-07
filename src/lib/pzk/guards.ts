import { isFeatureEnabled } from '@/lib/feature-flags'
import type { APIContext } from 'astro'

/**
 * Guard function to check if PZK feature is enabled
 * Returns 404 response if feature is disabled
 *
 * Usage in API endpoints:
 * ```typescript
 * const disabledResponse = checkPzkFeatureEnabled(Astro)
 * if (disabledResponse) return disabledResponse
 * ```
 *
 * @param context - Astro API context
 * @returns Response object with 404 status if feature is disabled, null otherwise
 */
export function checkPzkFeatureEnabled(_context: APIContext): Response | null {
  const isPzkEnabled = isFeatureEnabled('PZK')

  if (!isPzkEnabled) {
    return new Response(
      JSON.stringify({ error: 'Not Found' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  return null
}
