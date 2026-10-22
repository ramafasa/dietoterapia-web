import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/pages/api/sklep/orders'
import { ShopCheckoutService, type CreateOrderResult } from '@/lib/services/shopCheckoutService'
import { clearRateLimits } from '@/lib/rate-limit-public'
import { CHECKOUT_COOKIE, CHECKOUT_SECRET_TTL_HOURS, SHOP_TRANSACTION_ITEM } from '@/lib/shop/constants'
import { hashToken } from '@/lib/crypto'
import { shopOrderItems, shopOrders, transactions } from '@/db/schema'
import { createMockAPIContext, parseJSONResponse } from '../../../helpers/api-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createProduct } from '../../../fixtures/shop'

// Endpoint importuje `db` z '@/db' – blok "real service + DB" podstawia tu bazę z Testcontainers.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

// Serwis tworzony w endpoincie bez klienta Tpay → leniwie woła getTpayService(); podmieniamy go na mock.
const tpayMock = vi.hoisted(() => ({ createTransaction: vi.fn() }))
vi.mock('@/lib/services/tpayService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/tpayService')>()),
  getTpayService: () => tpayMock,
}))

const SECRET = 'a'.repeat(64)
const SUCCESS: CreateOrderResult = {
  ok: true,
  orderId: '11111111-1111-4111-8111-111111111111',
  redirectUrl: 'https://secure.sandbox.tpay.com/?title=TR-1',
  checkoutSecret: SECRET,
}

const VALID_BODY = {
  slugs: ['proteinowa-piekarnia'],
  email: 'anna@example.com',
  acceptTerms: true,
  acceptDigitalContent: true,
}

function createCookies() {
  const set = vi.fn()
  return { set, get: vi.fn(), delete: vi.fn(), has: vi.fn() }
}

function orderRequest(
  body: unknown,
  { ip = '203.0.113.7', user = null as any, cookies = createCookies() } = {}
) {
  const request = new Request('http://localhost/api/sklep/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return createMockAPIContext({ request, url: request.url, locals: { user }, cookies })
}

const originalFlag = process.env.FF_SKLEP

function restoreFlag() {
  if (originalFlag === undefined) delete process.env.FF_SKLEP
  else process.env.FF_SKLEP = originalFlag
}

describe('POST /api/sklep/orders (service mocked)', () => {
  let createSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    process.env.FF_SKLEP = 'true'
    clearRateLimits()
    createSpy = vi.spyOn(ShopCheckoutService.prototype, 'createOrder').mockResolvedValue(SUCCESS)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    restoreFlag()
    vi.restoreAllMocks()
  })

  it('returns 201 with orderId + redirectUrl and never the checkout secret', async () => {
    const response = await POST(orderRequest(VALID_BODY))
    const text = await response.text()

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(JSON.parse(text)).toEqual({
      data: { orderId: SUCCESS.orderId, redirectUrl: (SUCCESS as { redirectUrl: string }).redirectUrl },
      error: null,
    })
    expect(text).not.toContain(SECRET)
  })

  it('sets the checkout cookie `${orderId}.${secret}` (httpOnly, lax, path /, TTL)', async () => {
    const cookies = createCookies()

    await POST(orderRequest(VALID_BODY, { cookies }))

    expect(cookies.set).toHaveBeenCalledTimes(1)
    expect(cookies.set).toHaveBeenCalledWith(CHECKOUT_COOKIE, `${SUCCESS.orderId}.${SECRET}`, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: 'lax',
      path: '/',
      maxAge: CHECKOUT_SECRET_TTL_HOURS * 3600,
    })
  })

  it('passes normalized data and sessionUser: null for guests', async () => {
    await POST(
      orderRequest({
        ...VALID_BODY,
        email: '  Anna@Example.COM ',
        firstName: '',
        invoice: { companyName: 'Firma', nip: '827-224-72-79', address: 'ul. Zdrowa 1, Warszawa' },
      })
    )

    expect(createSpy).toHaveBeenCalledWith({
      slugs: ['proteinowa-piekarnia'],
      email: 'anna@example.com',
      firstName: undefined,
      acceptTerms: true,
      acceptDigitalContent: true,
      invoice: { companyName: 'Firma', nip: '8272247279', address: 'ul. Zdrowa 1, Warszawa' },
      sessionUser: null,
    })
  })

  it('passes sessionUser { id, email } from locals.user', async () => {
    const user = { id: 'user-1', email: 'sesja@example.com', role: 'customer', firstName: null, lastName: null, status: 'active' }

    await POST(orderRequest(VALID_BODY, { user }))

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ sessionUser: { id: 'user-1', email: 'sesja@example.com' } })
    )
  })

  it.each([
    ['missing terms consent', { ...VALID_BODY, acceptTerms: false }, 'Zaakceptuj regulamin', 'acceptTerms'],
    [
      'missing digital content consent',
      { ...VALID_BODY, acceptDigitalContent: undefined },
      'Ta zgoda jest wymagana do natychmiastowej wysyłki e-booka',
      'acceptDigitalContent',
    ],
    ['bad e-mail', { ...VALID_BODY, email: 'nie-email' }, 'Podaj poprawny adres e-mail', 'email'],
    [
      'bad NIP',
      { ...VALID_BODY, invoice: { companyName: 'Firma', nip: '8272247278', address: 'ul. Zdrowa 1' } },
      'Nieprawidłowy NIP',
      'invoice.nip',
    ],
    ['empty cart', { ...VALID_BODY, slugs: [] }, 'Koszyk jest pusty', 'slugs'],
  ])('returns 400 validation_error for %s', async (_label, body, message, path) => {
    const response = await POST(orderRequest(body))
    const json = await parseJSONResponse(response)

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(json.data).toBeNull()
    expect(json.error.code).toBe('validation_error')
    expect(json.error.message).toBe(message)
    expect(json.error.details.issues).toContainEqual({ path, message })
    expect(createSpy).not.toHaveBeenCalled()
  })

  it('returns 400 for a non-JSON body', async () => {
    const response = await POST(orderRequest('not json'))
    expect(response.status).toBe(400)
    expect((await parseJSONResponse(response)).error.code).toBe('validation_error')
  })

  it.each([
    ['EMPTY_CART', 'empty_cart'],
    ['ACCOUNT_EXISTS', 'account_exists'],
    ['ALREADY_OWNED', 'already_owned'],
  ] as const)('maps %s to 409 %s', async (code, expected) => {
    createSpy.mockResolvedValue({ ok: false, code, message: 'Komunikat' })
    const cookies = createCookies()

    const response = await POST(orderRequest(VALID_BODY, { cookies }))

    expect(response.status).toBe(409)
    expect(await parseJSONResponse(response)).toEqual({
      data: null,
      error: { code: expected, message: 'Komunikat' },
    })
    expect(cookies.set).not.toHaveBeenCalled()
  })

  it('maps CART_CHANGED to 409 cart_changed with details.removedSlugs', async () => {
    createSpy.mockResolvedValue({
      ok: false,
      code: 'CART_CHANGED',
      message: 'Część produktów jest niedostępna',
      removedSlugs: ['stary-ebook'],
    })

    const response = await POST(orderRequest(VALID_BODY))

    expect(response.status).toBe(409)
    expect(await parseJSONResponse(response)).toEqual({
      data: null,
      error: {
        code: 'cart_changed',
        message: 'Część produktów jest niedostępna',
        details: { removedSlugs: ['stary-ebook'] },
      },
    })
  })

  it('maps PAYMENT_INIT_FAILED to 502', async () => {
    createSpy.mockResolvedValue({ ok: false, code: 'PAYMENT_INIT_FAILED', message: 'Tpay nie działa' })
    const cookies = createCookies()

    const response = await POST(orderRequest(VALID_BODY, { cookies }))

    expect(response.status).toBe(502)
    expect((await parseJSONResponse(response)).error).toEqual({
      code: 'payment_init_failed',
      message: 'Tpay nie działa',
    })
    expect(cookies.set).not.toHaveBeenCalled()
  })

  it('returns 500 when the service throws (no-store)', async () => {
    createSpy.mockRejectedValue(new Error('db down'))

    const response = await POST(orderRequest(VALID_BODY))

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect((await parseJSONResponse(response)).error.code).toBe('internal_server_error')
  })

  it('returns 429 with Retry-After after 10 attempts from one IP (invalid ones count too)', async () => {
    for (let i = 0; i < 9; i++) {
      expect((await POST(orderRequest(VALID_BODY))).status).toBe(201)
    }
    expect((await POST(orderRequest({}))).status).toBe(400)

    const response = await POST(orderRequest(VALID_BODY))
    const json = await parseJSONResponse(response)

    expect(response.status).toBe(429)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(json.error.code).toBe('rate_limit_exceeded')
    expect(createSpy).toHaveBeenCalledTimes(9)

    // inny IP nadal przechodzi
    expect((await POST(orderRequest(VALID_BODY, { ip: '203.0.113.8' }))).status).toBe(201)
  })

  it('returns enveloped 404 when FF_SKLEP is off', async () => {
    process.env.FF_SKLEP = 'false'

    const response = await POST(orderRequest(VALID_BODY))

    expect(response.status).toBe(404)
    expect(await parseJSONResponse(response)).toEqual({
      data: null,
      error: { code: 'not_found', message: 'Nie znaleziono zasobu' },
    })
    expect(createSpy).not.toHaveBeenCalled()
  })
})

describe('POST /api/sklep/orders (real service + test DB, Tpay mocked)', () => {
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
    tpayMock.createTransaction.mockReset()
    tpayMock.createTransaction.mockResolvedValue({
      transactionId: 'TR-TEST-1',
      paymentUrl: 'https://secure.sandbox.tpay.com/?title=TR-TEST-1',
    })
    await cleanDatabase(getTestDatabase())
  })

  afterEach(() => {
    restoreFlag()
  })

  it('creates a pending order + transaction and returns the Tpay redirectUrl', async () => {
    const db = getTestDatabase()
    const product = await createProduct(db, { slug: 'proteinowa-piekarnia', price: '29.00' })
    const cookies = createCookies()

    const response = await POST(orderRequest({ ...VALID_BODY, email: 'Anna@Example.com' }, { cookies }))
    const json = await parseJSONResponse(response)

    expect(response.status).toBe(201)
    expect(json.error).toBeNull()
    expect(json.data.redirectUrl).toBe('https://secure.sandbox.tpay.com/?title=TR-TEST-1')

    const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, json.data.orderId))
    expect(order).toMatchObject({ status: 'pending', email: 'anna@example.com', totalAmount: '29.00', userId: null })

    const items = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id))
    expect(items.map((i) => i.productId)).toEqual([product.id])

    const [tx] = await db.select().from(transactions).where(eq(transactions.shopOrderId, order.id))
    expect(tx).toMatchObject({ status: 'pending', item: SHOP_TRANSACTION_ITEM, tpayTransactionId: 'TR-TEST-1' })

    expect(tpayMock.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 29, payerEmail: 'anna@example.com', crc: tx.id })
    )

    // cookie = orderId.secret; w bazie tylko SHA-256 sekretu
    const [name, value] = cookies.set.mock.calls[0]
    expect(name).toBe(CHECKOUT_COOKIE)
    const [cookieOrderId, secret] = String(value).split('.')
    expect(cookieOrderId).toBe(order.id)
    expect(order.checkoutSecretHash).toBe(await hashToken(secret))
    expect(JSON.stringify(json)).not.toContain(secret)
  })
})
