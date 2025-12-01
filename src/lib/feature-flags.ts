/**
 * Feature Flags Utility
 *
 * Centralized feature flag management for the application.
 * Feature flags are controlled via environment variables with FF_ prefix.
 */

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
  const envKey = `FF_${flag}`
  const value = import.meta.env[envKey]

  // Only 'true' string enables the feature, everything else disables it
  return value === 'true'
}
