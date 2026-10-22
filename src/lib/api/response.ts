/**
 * API Response Helpers (wspólne: PZK, sklep, …)
 *
 * Envelope `{ data, error }` used by JSON endpoints, plus a helper that builds the Response.
 * `@/lib/pzk/api` and `@/types/pzk-dto` re-export these for backwards compatibility.
 */

/**
 * Generic API response envelope
 * Used for consistent error handling across all endpoints
 */
export interface ApiResponse<T> {
  data: T | null
  error: ApiError | null
}

/**
 * API error structure
 * Maps domain errors to HTTP status codes with additional context
 */
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

/**
 * Create a successful API response
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
 * Standard (domain-neutral) error responses for common HTTP status codes
 */
export const ErrorResponses = {
  /**
   * 400 Bad Request - Invalid request parameters
   *
   * @example
   * ErrorResponses.BAD_REQUEST()
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
   * 404 Not Found - Resource does not exist or is not accessible
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

/**
 * JSON Response with `Content-Type: application/json` and `Cache-Control: no-store`.
 *
 * @example
 * return jsonResponse(ok(quote), 200)
 * return jsonResponse(fail('rate_limit_exceeded', '…'), 429, { 'Retry-After': '60' })
 */
export function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  })
}
