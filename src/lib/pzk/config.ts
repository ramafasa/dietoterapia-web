/**
 * PZK Configuration
 *
 * Centralized configuration for PZK (Przestrzeń Zdrowej Kobiety) features.
 * Uses environment variables with safe defaults for development.
 */

import type { PzkPurchaseCta, PzkModuleNumber } from '@/types/pzk-dto'

/**
 * Get PZK purchase CTA configuration
 *
 * Reads from environment variables:
 * - PUBLIC_PZK_PURCHASE_CTA_BASE_URL: Base URL for purchase landing page
 * - PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME: Query parameter name (default: 'module')
 *
 * @returns PzkPurchaseCta configuration object
 *
 * @example
 * const cta = getPurchaseCtaConfig()
 * // { baseUrl: 'https://example.com/pzk', paramName: 'module' }
 */
export function getPurchaseCtaConfig(): PzkPurchaseCta {
  const baseUrl =
    import.meta.env.PUBLIC_PZK_PURCHASE_CTA_BASE_URL ||
    'https://example.com/pzk' // Fallback for dev/test

  const paramName =
    import.meta.env.PUBLIC_PZK_PURCHASE_CTA_PARAM_NAME || 'module'

  return {
    baseUrl,
    paramName,
  }
}

/**
 * Build purchase CTA URL for a specific module
 *
 * Constructs URL by appending module number as query parameter to base URL.
 * Handles existing query parameters in base URL correctly.
 *
 * @param module - Module number (1, 2, or 3)
 * @param config - Optional PzkPurchaseCta config (defaults to env config)
 * @returns Complete purchase URL with module parameter
 *
 * @example
 * buildPurchaseUrl(1)
 * // 'https://example.com/pzk?module=1'
 *
 * buildPurchaseUrl(2, { baseUrl: 'https://example.com/buy?source=app', paramName: 'module' })
 * // 'https://example.com/buy?source=app&module=2'
 */
export function buildPurchaseUrl(
  module: PzkModuleNumber,
  config: PzkPurchaseCta = getPurchaseCtaConfig()
): string {
  try {
    const url = new URL(config.baseUrl)
    url.searchParams.set(config.paramName, String(module))
    return url.toString()
  } catch (error) {
    // Fallback if baseUrl is invalid (should never happen in production)
    console.error('[PZK Config] Invalid base URL:', config.baseUrl, error)
    return `${config.baseUrl}?${config.paramName}=${module}`
  }
}
