import type { LoginResponse, ApiError } from '@/types'
import type { LoginInput } from '@/schemas/auth'

/**
 * Custom error wrapper for login requests to expose status + body
 */
export class LoginRequestError extends Error {
  status: number
  body: ApiError

  constructor(status: number, body: ApiError) {
    super(body?.message || 'Nie udało się zalogować')
    this.status = status
    this.body = body
  }
}

/**
 * Calls the login API endpoint with the provided credentials.
 * Throws LoginRequestError on non-2xx responses.
 */
export async function login(payload: LoginInput): Promise<LoginResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  let data: LoginResponse | ApiError
  try {
    data = await res.json()
  } catch {
    data = { error: 'unknown_error', message: 'Nieoczekiwana odpowiedź serwera', statusCode: res.status }
  }

  if (!res.ok) {
    throw new LoginRequestError(res.status, data as ApiError)
  }

  return data as LoginResponse
}

