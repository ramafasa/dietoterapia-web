/**
 * Feature Flags Utility
 *
 * Centralized feature flag management for the application.
 * Feature flags are controlled via environment variables with FF_ prefix.
 */

import {env} from "std-env";

/**
 * Available feature flags in the application
 */
export type FeatureFlag = 'STREFA_PACJENTA'

/**
 * Checks if a feature flag is enabled
 *
 * @param flag - The feature flag name
 * @returns true if the feature is enabled, false otherwise
 *
 * @example
 * ```typescript
 * if (isFeatureEnabled('STREFA_PACJENTA')) {
 *   // Render patient zone features
 * }
 * ```
 */
export function isFeatureEnabled(flag: FeatureFlag): boolean {
  console.log("Flag: " + flag)
  const envKey = `FF_${flag}`
  console.log("Env key: " + envKey)
  const value = import.meta.env[envKey]
  console.log("FF value: " + value)

  // Only 'true' string enables the feature, everything else disables it
  return value === 'true'
}
