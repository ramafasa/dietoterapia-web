import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { POST } from '@/pages/api/sklep/cart/quote'
import { ShopCheckoutService, type CartQuote } from '@/lib/services/shopCheckoutService'
import { clearRateLimits } from '@/lib/rate-limit-public'
import { createMockAPIContext, parseJSONResponse } from '../../../helpers/api-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createProduct } from '../../../fixtures/shop'

// Endpoint importuje `db` z '@/db' – blok "real service + DB" podstawia tu bazę z Testcontainers
// (getter czyta wartość przy każdym żądaniu). Blok z mockiem serwisu jej nie potrzebuje.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

const QUOTE: CartQuote = {
  items: [{ productId: 'prod-1', slug: 'proteinowa-piekarnia', title: 'Proteinowa Piekarnia', price: '29.00' }],
  removedSlugs: ['stary-ebook'],
  total: '29.00',
}

function quoteRequest(body: unknown, ip = '203.0.113.7') {
  const request = new Request('http://localhost/api/sklep/cart/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return createMockAPIContext({ request, url: request.url })
}

const originalFlag = process.env.FF_SKLEP

function restoreFlag() {
  if (originalFlag === undefined) delete process.env.FF_SKLEP
  else process.env.FF_SKLEP = originalFlag
}

describe('POST /api/sklep/cart/quote (service mocked)', () => {
  let quoteSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.FF_SKLEP = 'true'
    clearRateLimits()
    quoteSpy = vi.spyOn(ShopCheckoutService.prototype, 'quoteCart').mockResolvedValue(QUOTE)
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    restoreFlag()
    vi.restoreAllMocks()
  })

  it('returns 200 with { data: CartQuote, error: null }', async () => {
    const response = await POST(quoteRequest({ slugs: ['proteinowa-piekarnia', 'stary-ebook'] }))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await parseJSONResponse(response)).toEqual({ data: QUOTE, error: null })
    expect(quoteSpy).toHaveBeenCalledWith(['proteinowa-piekarnia', 'stary-ebook'])
  })

  it('accepts an empty cart', async () => {
    const response = await POST(quoteRequest({ slugs: [] }))
    expect(response.status).toBe(200)
    expect(quoteSpy).toHaveBeenCalledWith([])
  })

  it.each([
    ['slug with uppercase', { slugs: ['Proteinowa'] }],
    ['slug with slash', { slugs: ['../etc'] }],
    ['empty slug', { slugs: [''] }],
    ['slug longer than 100 chars', { slugs: ['a'.repeat(101)] }],
    ['more than 20 slugs', { slugs: Array.from({ length: 21 }, (_, i) => `p-${i}`) }],
    ['missing slugs', {}],
    ['slugs not an array', { slugs: 'proteinowa-piekarnia' }],
  ])('returns 400 validation_error for %s', async (_label, body) => {
    const response = await POST(quoteRequest(body))
    const json = await parseJSONResponse(response)

    expect(response.status).toBe(400)
    expect(json.data).toBeNull()
    expect(json.error.code).toBe('validation_error')
    expect(quoteSpy).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-JSON body', async () => {
    const response = await POST(quoteRequest('not json'))
    expect(response.status).toBe(400)
    expect((await parseJSONResponse(response)).error.code).toBe('validation_error')
  })

  it('returns 429 with Retry-After after 60 requests from one IP', async () => {
    for (let i = 0; i < 60; i++) {
      expect((await POST(quoteRequest({ slugs: [] }))).status).toBe(200)
    }

    const response = await POST(quoteRequest({ slugs: [] }))
    const json = await parseJSONResponse(response)

    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(json.data).toBeNull()
    expect(json.error.code).toBe('rate_limit_exceeded')

    // inny IP nadal przechodzi
    expect((await POST(quoteRequest({ slugs: [] }, '203.0.113.8'))).status).toBe(200)
  })

  it('returns 500 when the service throws', async () => {
    quoteSpy.mockRejectedValue(new Error('db down'))

    const response = await POST(quoteRequest({ slugs: ['a'] }))

    expect(response.status).toBe(500)
    expect((await parseJSONResponse(response)).error.code).toBe('internal_server_error')
  })

  it('returns enveloped 404 when FF_SKLEP is off', async () => {
    process.env.FF_SKLEP = 'false'

    const response = await POST(quoteRequest({ slugs: ['a'] }))

    expect(response.status).toBe(404)
    expect(await parseJSONResponse(response)).toEqual({
      data: null,
      error: { code: 'not_found', message: 'Nie znaleziono zasobu' },
    })
    expect(quoteSpy).not.toHaveBeenCalled()
  })
})

describe('POST /api/sklep/cart/quote (real service + test DB)', () => {
  beforeAll(async () => {
    testDb.current = (await startTestDatabase()).db
  })

  afterAll(async () => {
    testDb.current = undefined
    await stopTestDatabase()
  })

  beforeEach(async () => {
    process.env.FF_SKLEP = 'true'
    clearRateLimits()
    await cleanDatabase(getTestDatabase())
  })

  afterEach(() => {
    restoreFlag()
  })

  it('quotes active products and reports draft/unknown slugs as removed', async () => {
    const db = getTestDatabase()
    const active = await createProduct(db, { slug: 'proteinowa-piekarnia', title: 'Proteinowa Piekarnia', price: '29.00' })
    await createProduct(db, { slug: 'szkic', title: 'Szkic', price: '19.99', status: 'draft' })

    const response = await POST(
      quoteRequest({ slugs: ['szkic', 'proteinowa-piekarnia', 'nie-ma', 'proteinowa-piekarnia'] })
    )

    expect(response.status).toBe(200)
    expect(await parseJSONResponse(response)).toEqual({
      data: {
        items: [{ productId: active.id, slug: 'proteinowa-piekarnia', title: 'Proteinowa Piekarnia', price: '29.00' }],
        removedSlugs: ['szkic', 'nie-ma'],
        total: '29.00',
      },
      error: null,
    })
  })
})
