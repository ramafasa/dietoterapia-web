import { describe, expect, it } from 'vitest'
import { ok, fail, ErrorResponses } from '@/lib/pzk/api'
import type { ApiResponse, PzkAccessSummary } from '@/types/pzk-dto'

describe('PZK API Helper - ok()', () => {
  it('should create successful response with data and null error', () => {
    const data: PzkAccessSummary = {
      hasAnyActiveAccess: true,
      activeModules: [1, 2],
      access: [
        {
          module: 1,
          startAt: '2025-01-01T00:00:00.000Z',
          expiresAt: '2026-01-01T00:00:00.000Z',
        },
        {
          module: 2,
          startAt: '2025-01-01T00:00:00.000Z',
          expiresAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      serverTime: '2025-12-30T12:00:00.000Z',
    }

    const response = ok(data)

    expect(response).toEqual({
      data,
      error: null,
    })
  })

  it('should work with null data', () => {
    const response = ok(null)

    expect(response).toEqual({
      data: null,
      error: null,
    })
  })

  it('should work with primitive data types', () => {
    const stringResponse = ok('test')
    expect(stringResponse.data).toBe('test')
    expect(stringResponse.error).toBeNull()

    const numberResponse = ok(42)
    expect(numberResponse.data).toBe(42)
    expect(numberResponse.error).toBeNull()

    const booleanResponse = ok(true)
    expect(booleanResponse.data).toBe(true)
    expect(booleanResponse.error).toBeNull()
  })
})

describe('PZK API Helper - fail()', () => {
  it('should create error response with null data and error object', () => {
    const response = fail('unauthorized', 'Authentication required')

    expect(response).toEqual({
      data: null,
      error: {
        code: 'unauthorized',
        message: 'Authentication required',
      },
    })
  })

  it('should include details when provided', () => {
    const details = { field: 'email', reason: 'invalid_format' }
    const response = fail('validation_error', 'Invalid input', details)

    expect(response).toEqual({
      data: null,
      error: {
        code: 'validation_error',
        message: 'Invalid input',
        details,
      },
    })
  })

  it('should not include details when not provided', () => {
    const response = fail('forbidden', 'Access denied')

    expect(response.error).toEqual({
      code: 'forbidden',
      message: 'Access denied',
    })
    expect(response.error?.details).toBeUndefined()
  })

  it('should handle empty details object', () => {
    const response = fail('error', 'Something went wrong', {})

    expect(response.error).toEqual({
      code: 'error',
      message: 'Something went wrong',
      details: {},
    })
  })

  it('should handle complex details object', () => {
    const details = {
      errors: [
        { field: 'email', message: 'Required' },
        { field: 'password', message: 'Too short' },
      ],
      timestamp: '2025-12-30T12:00:00.000Z',
    }
    const response = fail('validation_error', 'Multiple errors', details)

    expect(response.error?.details).toEqual(details)
  })
})

describe('PZK API Helper - ErrorResponses', () => {
  it('UNAUTHORIZED should have correct structure', () => {
    const response = ErrorResponses.UNAUTHORIZED

    expect(response).toEqual({
      data: null,
      error: {
        code: 'unauthorized',
        message: 'Authentication required',
      },
    })
  })

  it('FORBIDDEN_PATIENT_ROLE should have correct structure', () => {
    const response = ErrorResponses.FORBIDDEN_PATIENT_ROLE

    expect(response).toEqual({
      data: null,
      error: {
        code: 'forbidden',
        message: 'Patient role required',
      },
    })
  })

  it('INTERNAL_SERVER_ERROR should have correct structure', () => {
    const response = ErrorResponses.INTERNAL_SERVER_ERROR

    expect(response).toEqual({
      data: null,
      error: {
        code: 'internal_server_error',
        message: 'Wystąpił nieoczekiwany błąd serwera',
      },
    })
  })

  it('ErrorResponses should be immutable (read-only)', () => {
    // This test verifies that ErrorResponses is typed as const
    // TypeScript will catch if we try to mutate it
    const originalUnauthorized = ErrorResponses.UNAUTHORIZED

    // Verify we can read it
    expect(originalUnauthorized.error?.code).toBe('unauthorized')

    // Note: We can't test runtime immutability in TypeScript
    // as const only provides compile-time guarantees
  })
})

describe('PZK API Helper - Type Safety', () => {
  it('should infer correct types for ok()', () => {
    // This is a compile-time test - TypeScript will catch type errors
    const response: ApiResponse<{ value: number }> = ok({ value: 42 })

    expect(response.data?.value).toBe(42)
  })

  it('should infer correct types for fail()', () => {
    // This is a compile-time test - TypeScript will catch type errors
    const response: ApiResponse<{ value: number }> = fail(
      'error',
      'Test error'
    )

    expect(response.data).toBeNull()
    expect(response.error?.code).toBe('error')
  })
})
