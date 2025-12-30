/**
 * PZK API Response Helpers
 *
 * This module provides utility functions for formatting API responses
 * in the PZK (Przestrzeń Zdrowej Kobiety) API.
 *
 * All PZK endpoints use the ApiResponse<T> envelope format with
 * consistent error handling.
 */

import type { ApiResponse, ApiError } from '@/types/pzk-dto'

/**
 * Create a successful API response
 *
 * @param data - The response data payload
 * @returns ApiResponse envelope with data and no error
 *
 * @example
 * return ok({ hasAnyActiveAccess: true, activeModules: [1, 2] })
 */
export function ok<T>(data: T): ApiResponse<T> {
  return {
    data,
    error: null,
  }
}

/**
 * Create an error API response
 *
 * @param code - Machine-readable error code (e.g., 'unauthorized', 'forbidden')
 * @param message - Human-readable error message (Polish)
 * @param details - Optional additional error context
 * @returns ApiResponse envelope with error and no data
 *
 * @example
 * return fail('unauthorized', 'Authentication required')
 * return fail('validation_error', 'Invalid input', { field: 'email' })
 */
export function fail<T = null>(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiResponse<T> {
  const error: ApiError = {
    code,
    message,
  }

  if (details) {
    error.details = details
  }

  return {
    data: null,
    error,
  }
}

/**
 * Standard error responses for common HTTP status codes
 *
 * These are pre-configured error responses that follow PZK API conventions.
 */
export const ErrorResponses = {
  /**
   * 400 Bad Request - Invalid request parameters
   *
   * @param message - Optional custom error message
   * @param details - Optional error details (e.g., field name, validation errors)
   * @returns ApiResponse with validation_error code
   *
   * @example
   * ErrorResponses.BAD_REQUEST()
   * ErrorResponses.BAD_REQUEST('Invalid module number')
   * ErrorResponses.BAD_REQUEST('Invalid input', { field: 'modules', reason: 'must be 1, 2, or 3' })
   */
  BAD_REQUEST: (
    message: string = 'Nieprawidłowe parametry zapytania',
    details?: Record<string, unknown>
  ) => fail('validation_error', message, details),

  /**
   * 401 Unauthorized - User is not authenticated
   */
  UNAUTHORIZED: fail('unauthorized', 'Authentication required'),

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
   * 404 Not Found - Resource does not exist or is not accessible
   *
   * @param message - Optional custom error message
   * @returns ApiResponse with not_found code
   *
   * @example
   * ErrorResponses.NOT_FOUND()
   * ErrorResponses.NOT_FOUND('Material not found')
   */
  NOT_FOUND: (message: string = 'Nie znaleziono zasobu') =>
    fail('not_found', message),

  /**
   * 500 Internal Server Error - Unexpected server error
   */
  INTERNAL_SERVER_ERROR: fail(
    'internal_server_error',
    'Wystąpił nieoczekiwany błąd serwera'
  ),
} as const
