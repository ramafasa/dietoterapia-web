/**
 * Type guard utilities for TypeScript narrowing
 */

/**
 * Check if error is a Zod validation error with errors array
 */
export function isZodError(error: unknown): error is { errors: Array<{ path: (string | number)[]; message: string }> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray((error as any).errors)
  )
}

/**
 * Check if error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as any).message === 'string'
  )
}

/**
 * Check if error has a name property
 */
export function hasName(error: unknown): error is { name: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof (error as any).name === 'string'
  )
}

/**
 * Check if error has a code property
 */
export function hasCode(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as any).code === 'string'
  )
}
