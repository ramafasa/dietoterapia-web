import { describe, expect, it } from 'vitest'
import { checkCsrfForUnsafeRequest } from '@/lib/http/csrf'

function makeMockRequest(url: string, headers: Record<string, string> = {}) {
  const lower = new Map<string, string>()
  for (const [k, v] of Object.entries(headers)) {
    lower.set(k.toLowerCase(), v)
  }

  // NOTE: Node's WHATWG Request implementation may strip some forbidden headers
  // (e.g. Origin, Sec-Fetch-*). We use a lightweight mock instead.
  return {
    url,
    headers: {
      get(name: string) {
        return lower.get(name.toLowerCase()) ?? null
      },
    },
  } as unknown as Request
}

describe('CSRF helper - checkCsrfForUnsafeRequest()', () => {
  it('should reject cross-site requests via Sec-Fetch-Site', () => {
    const req = makeMockRequest('https://app.example.com/api/pzk/x', {
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.example.com',
    })

    const result = checkCsrfForUnsafeRequest(req)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.details.reason).toBe('cross_site')
      expect(result.details.expectedOrigin).toBe('https://app.example.com')
    }
  })

  it('should accept same-origin requests via Sec-Fetch-Site without Origin/Referer', () => {
    const req = makeMockRequest('https://app.example.com/api/pzk/x', {
      'sec-fetch-site': 'same-origin',
    })

    const result = checkCsrfForUnsafeRequest(req)
    expect(result).toEqual({ ok: true })
  })

  it('should accept matching Origin header', () => {
    const req = makeMockRequest('https://app.example.com/api/pzk/x', {
      origin: 'https://app.example.com',
    })

    const result = checkCsrfForUnsafeRequest(req)
    expect(result).toEqual({ ok: true })
  })

  it('should reject mismatching Origin header', () => {
    const req = makeMockRequest('https://app.example.com/api/pzk/x', {
      origin: 'https://evil.example.com',
    })

    const result = checkCsrfForUnsafeRequest(req)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.details.reason).toBe('origin_mismatch')
      expect(result.details.expectedOrigin).toBe('https://app.example.com')
      expect(result.details.origin).toBe('https://evil.example.com')
    }
  })

  it('should accept matching Referer origin when Origin is missing', () => {
    const req = makeMockRequest('https://app.example.com/api/pzk/x', {
      referer: 'https://app.example.com/pacjent/pzk',
    })

    const result = checkCsrfForUnsafeRequest(req)
    expect(result).toEqual({ ok: true })
  })
})


