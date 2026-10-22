/**
 * PZK API Response Helpers
 *
 * Generic envelope helpers live in `@/lib/api/response` (shared with the shop).
 * This module re-exports them and adds PZK-specific error responses, so existing
 * PZK imports (`ok`, `fail`, `ErrorResponses`) keep working unchanged.
 */

import {
  ok,
  fail,
  jsonResponse,
  ErrorResponses as CommonErrorResponses,
} from '@/lib/api/response'

export { ok, fail, jsonResponse }
export type { ApiResponse, ApiError } from '@/lib/api/response'

/**
 * Standard error responses for PZK endpoints: the common ones
 * (BAD_REQUEST, UNAUTHORIZED, NOT_FOUND, INTERNAL_SERVER_ERROR) plus PZK-specific 403s.
 */
export const ErrorResponses = {
  ...CommonErrorResponses,

  /**
   * 403 Forbidden - User lacks required role or permissions
   */
  FORBIDDEN_PATIENT_ROLE: fail('forbidden', 'Patient role required'),

  /**
   * 403 Forbidden - User lacks active access to module
   *
   * Used when user is authenticated and has patient role,
   * but lacks active access to the module required for the resource.
   *
   * @param module - Optional module number (1, 2, or 3)
   * @returns ApiResponse with forbidden code and no_module_access reason
   *
   * @example
   * ErrorResponses.FORBIDDEN_NO_MODULE_ACCESS()
   * ErrorResponses.FORBIDDEN_NO_MODULE_ACCESS(2)
   */
  FORBIDDEN_NO_MODULE_ACCESS: (module?: number) =>
    fail('forbidden', 'Brak aktywnego dostępu do modułu', {
      reason: 'no_module_access',
      ...(module && { module }),
    }),

  /**
   * 403 Forbidden - User lacks any active PZK access
   *
   * Used when user is authenticated and has patient role,
   * but lacks ANY active access to PZK (no active modules at all).
   * This is used for features that require any active PZK access,
   * regardless of which module (e.g., reviews).
   *
   * @returns ApiResponse with forbidden code and no_active_access reason
   *
   * @example
   * ErrorResponses.FORBIDDEN_NO_ACTIVE_ACCESS
   */
  FORBIDDEN_NO_ACTIVE_ACCESS: fail('forbidden', 'Active PZK access required', {
    reason: 'no_active_access',
  }),
} as const
