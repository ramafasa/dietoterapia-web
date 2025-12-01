/**
 * Domain Error Classes
 *
 * Custom error classes for business logic errors.
 * These errors are mapped to HTTP status codes in API endpoints.
 */

import type { ApiError } from '../types'

/**
 * Base class for domain errors
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

/**
 * Invitation token is invalid, expired, or already used
 */
export class InvalidInvitationError extends DomainError {
  constructor(
    message: string = 'Token zaproszenia jest nieprawidłowy, wygasł lub został już użyty',
    public code: string = 'invalid_invitation_token'
  ) {
    super(message)
  }
}

/**
 * Email is already registered
 */
export class EmailConflictError extends DomainError {
  constructor(
    message: string = 'Adres email jest już zarejestrowany w systemie',
    public code: string = 'email_already_registered'
  ) {
    super(message)
  }
}

/**
 * Required consents are missing or not accepted
 */
export class MissingRequiredConsentsError extends DomainError {
  constructor(
    message: string = 'Wymagane prawnie zgody muszą być zaakceptowane',
    public code: string = 'required_consents_missing'
  ) {
    super(message)
  }
}

/**
 * Validation error (from Zod or custom validation)
 */
export class ValidationError extends DomainError {
  constructor(
    message: string = 'Dane wejściowe są nieprawidłowe',
    public code: string = 'validation_failed',
    public details?: unknown
  ) {
    super(message)
  }
}

/**
 * Authentication error (invalid credentials)
 */
export class AuthenticationError extends DomainError {
  constructor(
    message: string = 'Nieprawidłowy email lub hasło',
    public code: string = 'authentication_failed'
  ) {
    super(message)
  }
}

/**
 * Authorization error (insufficient permissions)
 */
export class AuthorizationError extends DomainError {
  constructor(
    message: string = 'Brak uprawnień do wykonania tej operacji',
    public code: string = 'authorization_failed'
  ) {
    super(message)
  }
}

/**
 * Resource not found error
 */
export class NotFoundError extends DomainError {
  constructor(
    message: string = 'Zasób nie został znaleziony',
    public code: string = 'resource_not_found'
  ) {
    super(message)
  }
}

/**
 * Maps domain errors to HTTP status codes and ApiError responses
 *
 * @param error - Error to map
 * @returns ApiError response object with appropriate status code
 */
export function mapErrorToApiError(error: unknown): {
  apiError: ApiError
  statusCode: number
} {
  // Validation errors (Zod)
  if (error instanceof ValidationError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 422,
      },
      statusCode: 422,
    }
  }

  // Invalid invitation
  if (error instanceof InvalidInvitationError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 400,
      },
      statusCode: 400,
    }
  }

  // Email conflict
  if (error instanceof EmailConflictError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 409,
      },
      statusCode: 409,
    }
  }

  // Missing required consents
  if (error instanceof MissingRequiredConsentsError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 400,
      },
      statusCode: 400,
    }
  }

  // Authentication error
  if (error instanceof AuthenticationError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 401,
      },
      statusCode: 401,
    }
  }

  // Authorization error
  if (error instanceof AuthorizationError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 403,
      },
      statusCode: 403,
    }
  }

  // Not found error
  if (error instanceof NotFoundError) {
    return {
      apiError: {
        error: error.code,
        message: error.message,
        statusCode: 404,
      },
      statusCode: 404,
    }
  }

  // Unknown/internal server error
  console.error('[mapErrorToApiError] Unexpected error:', error)
  return {
    apiError: {
      error: 'internal_server_error',
      message: 'Wystąpił nieoczekiwany błąd serwera',
      statusCode: 500,
    },
    statusCode: 500,
  }
}
