import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { onRequest as csrfMiddleware } from '@/middleware/csrf'

/**
 * Lekki mock żądania: WHATWG Request w Node może wycinać nagłówki „forbidden” (Origin, Sec-Fetch-*).
 */
async function run(
  method: string,
  headers: Record<string, string>,
  pathname = '/api/sklep/pobierz/abc/account-link'
): Promise<Response> {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  const context = {
    url: new URL(`http://localhost:4321${pathname}`),
    request: { method, headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null } },
  }
  const next = async () => new Response('passed', { status: 200 })
  return (await (csrfMiddleware as any)(context, next)) as Response
}

describe('CSRF middleware', () => {
  beforeAll(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  it('passes GET requests without checks', async () => {
    expect((await run('GET', { origin: 'https://evil.example.com', host: 'localhost:4321' })).status).toBe(200)
  })

  it('allows a same-origin POST (Origin host == Host)', async () => {
    expect((await run('POST', { origin: 'http://localhost:4321', host: 'localhost:4321' })).status).toBe(200)
  })

  it('allows a POST without Origin (legacy same-origin form)', async () => {
    expect((await run('POST', { host: 'localhost:4321' })).status).toBe(200)
  })

  it('blocks a cross-origin POST with 403', async () => {
    const response = await run('POST', { origin: 'https://evil.example.com', host: 'localhost:4321' })
    expect(response.status).toBe(403)
  })

  it('blocks Origin: null with 403 (does not throw)', async () => {
    const response = await run('POST', { origin: 'null', host: 'localhost:4321' })
    expect(response.status).toBe(403)
  })

  it('blocks Origin: null with Sec-Fetch-Site: cross-site', async () => {
    const response = await run('POST', { origin: 'null', host: 'localhost:4321', 'sec-fetch-site': 'cross-site' })
    expect(response.status).toBe(403)
  })

  it('allows Origin: null when the browser reports Sec-Fetch-Site: same-origin', async () => {
    const response = await run('POST', { origin: 'null', host: 'localhost:4321', 'sec-fetch-site': 'same-origin' })
    expect(response.status).toBe(200)
  })

  it.each(['garbage', 'http//', 'file:///etc/passwd', 'data:text/html,x'])(
    'blocks unparseable / non-http Origin %j with 403',
    async (origin) => {
      const response = await run('POST', { origin, host: 'localhost:4321' })
      expect(response.status).toBe(403)
    }
  )

  it('blocks a mismatched real Origin even with Sec-Fetch-Site: same-origin', async () => {
    const response = await run('POST', {
      origin: 'https://evil.example.com',
      host: 'localhost:4321',
      'sec-fetch-site': 'same-origin',
    })
    expect(response.status).toBe(403)
  })

  it('blocks a POST without Origin when Sec-Fetch-Site: cross-site', async () => {
    const response = await run('POST', { host: 'localhost:4321', 'sec-fetch-site': 'cross-site' })
    expect(response.status).toBe(403)
  })

  it.each(['same-origin', 'same-site', 'none'])(
    'allows a POST without Origin when Sec-Fetch-Site: %s',
    async (site) => {
      const response = await run('POST', { host: 'localhost:4321', 'sec-fetch-site': site })
      expect(response.status).toBe(200)
    }
  )

  it('skips the check for the Tpay webhooks', async () => {
    const response = await run(
      'POST',
      { origin: 'null', host: 'localhost:4321' },
      '/api/sklep/platnosc/callback'
    )
    expect(response.status).toBe(200)
  })

  it('webhook exemption also covers a cross-site request without Origin', async () => {
    const response = await run(
      'POST',
      { host: 'localhost:4321', 'sec-fetch-site': 'cross-site' },
      '/api/pzk/purchase/callback'
    )
    expect(response.status).toBe(200)
  })
})
