import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/pages/api/sklep/platnosc/callback'
import { onRequest as csrfMiddleware } from '@/middleware/csrf'
import { shopOrders, transactions } from '@/db/schema'
import { SHOP_TRANSACTION_ITEM } from '@/lib/shop/constants'
import { createMockAPIContext } from '../../../helpers/api-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createProduct, createPaidOrder } from '../../../fixtures/shop'

// Endpoint importuje `db` z '@/db' – podstawiamy bazę z Testcontainers.
const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

// Serwis bez wstrzykniętego Tpay → leniwie getTpayService(); podmieniamy weryfikację JWS.
const tpayMock = vi.hoisted(() => ({ verifyWebhookSignature: vi.fn() }))
vi.mock('@/lib/services/tpayService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/tpayService')>()),
  getTpayService: () => tpayMock,
}))

const originalFlag = process.env.FF_SKLEP

function callbackRequest(body: string, headers: Record<string, string> = {}) {
  const request = new Request('http://localhost/api/sklep/platnosc/callback', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-JWS-Signature': 'header.payload.signature',
      ...headers,
    },
    body,
  })
  return createMockAPIContext({ request, url: request.url })
}

async function pendingShopTransaction() {
  const db = getTestDatabase()
  const product = await createProduct(db)
  const { order } = await createPaidOrder(db, {
    email: 'anna@example.com',
    productIds: [product.id],
    status: 'pending',
    paidAt: null,
    confirmationSentAt: null,
  })
  const [trx] = await db
    .insert(transactions)
    .values({
      shopOrderId: order.id,
      item: SHOP_TRANSACTION_ITEM,
      amount: order.totalAmount,
      status: 'pending',
      tpayTitle: `Zamówienie ${order.orderNumber}`,
      payerEmail: order.email,
    })
    .returning()
  return { order, trx }
}

function body(trxId: string, overrides: Record<string, string> = {}) {
  return new URLSearchParams({
    tr_id: 'TR-ABC-123',
    tr_status: 'TRUE',
    tr_amount: '29.00',
    tr_crc: trxId,
    ...overrides,
  }).toString()
}

describe('POST /api/sklep/platnosc/callback', () => {
  beforeAll(async () => {
    const { db } = await startTestDatabase()
    testDb.current = db
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(getTestDatabase())
    tpayMock.verifyWebhookSignature.mockReset().mockResolvedValue(true)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.FF_SKLEP
    else process.env.FF_SKLEP = originalFlag
    vi.restoreAllMocks()
  })

  it('success → "TRUE" 200, order paid; confirmation pending until Phase 5 mailer (file not released)', async () => {
    const { order, trx } = await pendingShopTransaction()
    const raw = body(trx.id)

    const res = await POST(callbackRequest(raw))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('TRUE')
    expect(tpayMock.verifyWebhookSignature).toHaveBeenCalledWith('header.payload.signature', raw)
    const [o] = await getTestDatabase().select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(o.status).toBe('paid')
    expect(o.confirmationSentAt).toBeNull()
  })

  it('works with FF_SKLEP=false (payments must never be lost)', async () => {
    process.env.FF_SKLEP = 'false'
    const { order, trx } = await pendingShopTransaction()

    const res = await POST(callbackRequest(body(trx.id)))

    expect(await res.text()).toBe('TRUE')
    const [o] = await getTestDatabase().select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(o.status).toBe('paid')
  })

  it('duplicate notification → "TRUE" 200 (already processed)', async () => {
    const { trx } = await pendingShopTransaction()
    await POST(callbackRequest(body(trx.id)))

    const res = await POST(callbackRequest(body(trx.id)))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('TRUE')
  })

  it('amount mismatch → "TRUE" 200 (manual handling, no Tpay retries), order failed', async () => {
    const { order, trx } = await pendingShopTransaction()

    const res = await POST(callbackRequest(body(trx.id, { tr_amount: '1.00' })))

    expect(await res.text()).toBe('TRUE')
    const [o] = await getTestDatabase().select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(o.status).toBe('failed')
  })

  it('invalid signature → "FALSE" 500, nothing changes', async () => {
    tpayMock.verifyWebhookSignature.mockResolvedValue(false)
    const { order, trx } = await pendingShopTransaction()

    const res = await POST(callbackRequest(body(trx.id)))

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('FALSE')
    const [o] = await getTestDatabase().select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(o.status).toBe('pending')
  })

  it('unknown transaction → "FALSE" 500', async () => {
    const res = await POST(callbackRequest(body('11111111-1111-4111-8111-111111111111')))
    expect(res.status).toBe(500)
    expect(await res.text()).toBe('FALSE')
  })

  it('missing tr_id / tr_crc → "FALSE" 400', async () => {
    const res = await POST(callbackRequest('tr_status=TRUE&tr_amount=29.00'))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe('FALSE')
    expect(tpayMock.verifyWebhookSignature).not.toHaveBeenCalled()
  })

  it('body over the limit → "FALSE" 413', async () => {
    const res = await POST(callbackRequest('x'.repeat(64 * 1024 + 1)))
    expect(res.status).toBe(413)
    expect(await res.text()).toBe('FALSE')
  })
})

describe('CSRF middleware – shop webhook exemption', () => {
  // Lekki mock: Node Request potrafi usuwać nagłówek Origin
  function runCsrf(pathname: string) {
    const headers = new Map([
      ['origin', 'https://secure.tpay.com'],
      ['host', 'paulinamaciak.pl'],
    ])
    const context = {
      url: new URL(`https://paulinamaciak.pl${pathname}`),
      request: { method: 'POST', headers: { get: (n: string) => headers.get(n.toLowerCase()) ?? null } },
    }
    return (csrfMiddleware as any)(context, async () => new Response('passed', { status: 200 })) as Promise<Response>
  }

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cross-origin POST to /api/sklep/platnosc/callback passes', async () => {
    expect((await runCsrf('/api/sklep/platnosc/callback')).status).toBe(200)
  })

  it('cross-origin POST to another shop endpoint is blocked', async () => {
    expect((await runCsrf('/api/sklep/orders')).status).toBe(403)
  })
})
