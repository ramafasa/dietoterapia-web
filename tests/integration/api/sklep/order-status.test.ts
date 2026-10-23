import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { GET } from '@/pages/api/sklep/orders/[id]/status'
import { clearRateLimits, checkShopRateLimit, recordShopRequest } from '@/lib/rate-limit-public'
import { CHECKOUT_COOKIE } from '@/lib/shop/constants'
import { hashToken } from '@/lib/crypto'
import { createMockAPIContext, parseJSONResponse } from '../../../helpers/api-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createPaidOrder, createProduct } from '../../../fixtures/shop'
import { createPatient } from '../../../fixtures/users'

// Endpoint importuje `db` z '@/db' – podstawiamy bazę z Testcontainers.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

const SECRET = 'ab'.repeat(32)
const OTHER_SECRET = 'cd'.repeat(32)
const HOUR = 3600 * 1000

function cookiesWith(value?: string) {
  return {
    get: (name: string) => (name === CHECKOUT_COOKIE && value !== undefined ? { value } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
    has: (name: string) => name === CHECKOUT_COOKIE && value !== undefined,
  }
}

function statusRequest(id: string, cookie?: string, ip = '203.0.113.7') {
  const url = `http://localhost/api/sklep/orders/${id}/status`
  const request = new Request(url, { headers: { 'x-forwarded-for': ip } })
  return createMockAPIContext({ request, url, params: { id }, cookies: cookiesWith(cookie) })
}

const originalFlag = process.env.FF_SKLEP

describe('GET /api/sklep/orders/[id]/status (test DB)', () => {
  beforeAll(async () => {
    testDb.current = (await startTestDatabase()).db
  })

  afterAll(async () => {
    testDb.current = undefined
    await stopTestDatabase()
  })

  beforeEach(async () => {
    clearRateLimits()
    await cleanDatabase(getTestDatabase())
  })

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.FF_SKLEP
    else process.env.FF_SKLEP = originalFlag
    vi.restoreAllMocks()
  })

  async function pendingOrder(overrides: Record<string, unknown> = {}) {
    const db = getTestDatabase()
    const a = await createProduct(db, { slug: 'proteinowa-piekarnia', title: 'Proteinowa Piekarnia', price: '29.00' })
    const b = await createProduct(db, { slug: 'slodkie-sniadania', title: 'Słodkie Śniadania', price: '39.00' })
    return createPaidOrder(db, {
      email: 'anna@example.com',
      productIds: [a.id, b.id],
      status: 'pending',
      paidAt: null,
      confirmationSentAt: null,
      checkoutSecretHash: await hashToken(SECRET),
      ...overrides,
    })
  }

  async function expectNotFound(response: Response) {
    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await parseJSONResponse(response)).toEqual({
      data: null,
      error: { code: 'not_found', message: 'Nie znaleziono zasobu' },
    })
  }

  it('returns 404 for an invalid uuid', async () => {
    await expectNotFound(await GET(statusRequest('not-a-uuid', `not-a-uuid.${SECRET}`)))
  })

  it('returns 404 without the cookie', async () => {
    const { order } = await pendingOrder()
    await expectNotFound(await GET(statusRequest(order.id)))
  })

  it('returns 404 for a malformed cookie', async () => {
    const { order } = await pendingOrder()
    await expectNotFound(await GET(statusRequest(order.id, `${order.id}.short`)))
  })

  it('returns 404 for a wrong secret', async () => {
    const { order } = await pendingOrder()
    await expectNotFound(await GET(statusRequest(order.id, `${order.id}.${OTHER_SECRET}`)))
  })

  it('returns 404 when the order has no checkout secret', async () => {
    const { order } = await pendingOrder({ checkoutSecretHash: null })
    await expectNotFound(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))
  })

  it('returns 404 when the cookie expired (order created 25 h ago)', async () => {
    const { order } = await pendingOrder({ createdAt: new Date(Date.now() - 25 * HOUR) })
    await expectNotFound(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))
  })

  it('returns 404 not_found for a non-existent order with a matching-looking cookie', async () => {
    const id = '33333333-3333-4333-8333-333333333333'
    await expectNotFound(await GET(statusRequest(id, `${id}.${SECRET}`)))
  })

  it('returns 404 cookie_mismatch when the cookie belongs to another order', async () => {
    const { order } = await pendingOrder()
    const otherId = '44444444-4444-4444-8444-444444444444'

    const response = await GET(statusRequest(order.id, `${otherId}.${SECRET}`))
    const text = await response.text()

    expect(response.status).toBe(404)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(JSON.parse(text).data).toBeNull()
    expect(JSON.parse(text).error.code).toBe('cookie_mismatch')
    expect(text).not.toContain('anna@example.com')
    expect(text).not.toContain(order.orderNumber)
  })

  it('returns the pending status with confirmationSent: false (no internals in the body)', async () => {
    const { order, items } = await pendingOrder()

    const response = await GET(statusRequest(order.id, `${order.id}.${SECRET}`))
    const text = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const byTitle = (title: string) => items.find((i) => i.titleSnapshot === title)!.id
    expect(JSON.parse(text)).toEqual({
      data: {
        status: 'pending',
        confirmationSent: false,
        orderNumber: order.orderNumber,
        email: 'anna@example.com',
        items: [
          { id: byTitle('Proteinowa Piekarnia'), title: 'Proteinowa Piekarnia', slug: 'proteinowa-piekarnia' },
          { id: byTitle('Słodkie Śniadania'), title: 'Słodkie Śniadania', slug: 'slodkie-sniadania' },
        ],
        total: '68.00',
        accountState: 'link_sent',
      },
      error: null,
    })
    expect(text).not.toContain(order.checkoutSecretHash!)
    expect(text).not.toContain(SECRET)
    expect(text).not.toMatch(/checkoutSecretHash|userId|createdAt|productId|fileObjectKey|unitPrice/)
  })

  it("does not include another order's items", async () => {
    const db = getTestDatabase()
    const { order, items } = await pendingOrder()
    const other = await createProduct(db, { slug: 'inny-ebook', title: 'Inny E-book', price: '19.00' })
    const { items: otherItems } = await createPaidOrder(db, {
      email: 'ktos@example.com',
      productIds: [other.id],
      checkoutSecretHash: await hashToken(OTHER_SECRET),
    })

    const response = await GET(statusRequest(order.id, `${order.id}.${SECRET}`))
    const text = await response.text()
    const json = JSON.parse(text)

    expect(json.data.items.map((i: { id: string }) => i.id).sort()).toEqual(items.map((i) => i.id).sort())
    expect(text).not.toContain(otherItems[0].id)
    expect(text).not.toContain('Inny E-book')
  })

  it('returns paid + confirmationSent: true once the confirmation was sent', async () => {
    const now = new Date()
    const { order } = await pendingOrder({ status: 'paid', paidAt: now, confirmationSentAt: now })

    const json = await parseJSONResponse(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))

    expect(json.data).toMatchObject({ status: 'paid', confirmationSent: true })
  })

  it('returns paid + confirmationSent: false before the confirmation mail', async () => {
    const { order } = await pendingOrder({ status: 'paid', paidAt: new Date(), confirmationSentAt: null })

    const json = await parseJSONResponse(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))

    expect(json.data).toMatchObject({ status: 'paid', confirmationSent: false })
  })

  it('accountState: none when the order has a userId', async () => {
    const user = await createPatient(getTestDatabase(), { email: 'anna@example.com' })
    const { order } = await pendingOrder({ userId: user.id })

    const json = await parseJSONResponse(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))

    expect(json.data.accountState).toBe('none')
  })

  it('accountState: exists when an account with the e-mail exists (case-insensitive)', async () => {
    await createPatient(getTestDatabase(), { email: 'Anna@Example.COM' })
    const { order } = await pendingOrder()

    const json = await parseJSONResponse(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))

    expect(json.data.accountState).toBe('exists')
  })

  it('accountState: link_sent when no account exists', async () => {
    await createPatient(getTestDatabase(), { email: 'ktos-inny@example.com' })
    const { order } = await pendingOrder()

    const json = await parseJSONResponse(await GET(statusRequest(order.id, `${order.id}.${SECRET}`)))

    expect(json.data.accountState).toBe('link_sent')
  })

  it('works with FF_SKLEP=false (delivery path – paid customers must see the status)', async () => {
    process.env.FF_SKLEP = 'false'
    const { order } = await pendingOrder({ status: 'paid', paidAt: new Date(), confirmationSentAt: new Date() })

    const response = await GET(statusRequest(order.id, `${order.id}.${SECRET}`))

    expect(response.status).toBe(200)
  })

  it('own limit: 120 requests / 10 min / IP, then 429 with Retry-After', async () => {
    const { order } = await pendingOrder()
    const ctx = () => statusRequest(order.id, `${order.id}.${SECRET}`)

    for (let i = 0; i < 120; i++) expect((await GET(ctx())).status).toBe(200)

    const response = await GET(ctx())
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await parseJSONResponse(response)).error.code).toBe('rate_limit_exceeded')
  })

  it('does not share the counter with the cart quote limiter (checkShopRateLimit)', async () => {
    const { order } = await pendingOrder()
    const ip = '203.0.113.7'
    for (let i = 0; i < 60; i++) recordShopRequest(ip)
    expect(checkShopRateLimit(ip).allowed).toBe(false)

    expect((await GET(statusRequest(order.id, `${order.id}.${SECRET}`, ip))).status).toBe(200)

    clearRateLimits()
    for (let i = 0; i < 30; i++) await GET(statusRequest(order.id, `${order.id}.${SECRET}`, ip))
    expect(checkShopRateLimit(ip)).toEqual({ allowed: true, remaining: 59 })
  })

  it('returns 500 without leaking DB error messages', async () => {
    const { order } = await pendingOrder()
    const { ShopOrderRepository } = await import('@/lib/repositories/shopOrderRepository')
    vi.spyOn(ShopOrderRepository.prototype, 'findStatusView').mockRejectedValue(
      Object.assign(new Error('Failed query ... params: anna@example.com'), { cause: { code: '57P01' } })
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await GET(statusRequest(order.id, `${order.id}.${SECRET}`))

    expect(response.status).toBe(500)
    expect((await parseJSONResponse(response)).error.code).toBe('internal_server_error')
    const logged = JSON.stringify(errorSpy.mock.calls)
    expect(logged).not.toContain('anna@example.com')
    expect(logged).not.toContain(SECRET)
    expect(logged).toContain('57P01')
  })
})
