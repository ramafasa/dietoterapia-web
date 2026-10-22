import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import { eq } from 'drizzle-orm'
import { TpayService } from '@/lib/services/tpayService'
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

// Serwis bez wstrzykniętego Tpay → leniwie getTpayService(); podmieniamy go na mock weryfikacji JWS
// albo (blok "real JWS") na prawdziwy TpayService z certyfikatem serwowanym przez stub fetch.
const tpayMock = vi.hoisted(() => ({ verifyWebhookSignature: vi.fn() }))
const tpayHolder = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/services/tpayService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/tpayService')>()),
  getTpayService: () => tpayHolder.current ?? tpayMock,
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

/** Drugie zamówienie (inny produkt – slug jest unikalny). */
async function pendingShopTransaction2() {
  const db = getTestDatabase()
  const product = await createProduct(db, { slug: 'drugi-ebook' })
  const { order } = await createPaidOrder(db, {
    email: 'ewa@example.com',
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

  it.each([['11111111-1111-4111-8111-111111111111'], ['not-a-uuid']])(
    'unknown transaction %s with valid signature → "TRUE" 200 (retries would not help)',
    async (crc) => {
      const res = await POST(callbackRequest(body(crc)))
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('TRUE')
    }
  )

  it('database error → "FALSE" 500', async () => {
    const { trx } = await pendingShopTransaction()
    const realDb = testDb.current
    testDb.current = {
      select: () => {
        throw Object.assign(new Error('connection lost'), { code: '08006' })
      },
    }
    try {
      const res = await POST(callbackRequest(body(trx.id)))
      expect(res.status).toBe(500)
      expect(await res.text()).toBe('FALSE')
    } finally {
      testDb.current = realDb
    }
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

describe('POST /api/sklep/platnosc/callback – real JWS verification (TpayService)', () => {
  const CERT_URL = 'https://secure.sandbox.tpay.com/x509/notifications-jws.pem'
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  const publicKeyPem = publicKey.export({ type: 'pkcs1', format: 'pem' }).toString()

  /** Detached JWS (header..signature) – format Tpay; podpis nad dokładnym body. */
  function signDetached(rawBody: string) {
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'RS256', x5u: CERT_URL })).toString('base64url')
    const sign = crypto.createSign('SHA256')
    sign.update(`${headerB64}.${Buffer.from(rawBody).toString('base64url')}`)
    sign.end()
    return `${headerB64}..${sign.sign(privateKey).toString('base64url')}`
  }

  beforeAll(async () => {
    const { db } = await startTestDatabase()
    testDb.current = db
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(getTestDatabase())
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url === CERT_URL ? new Response(publicKeyPem, { status: 200 }) : new Response('nope', { status: 404 })
      )
    )
    tpayHolder.current = new TpayService({
      clientId: 'test',
      clientSecret: 'test',
      environment: 'sandbox',
      certDomain: 'secure.sandbox.tpay.com',
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    tpayHolder.current = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function orderStatus(id: string) {
    const [o] = await getTestDatabase().select().from(shopOrders).where(eq(shopOrders.id, id))
    return o.status
  }

  it('correctly signed body → "TRUE", order paid', async () => {
    const { order, trx } = await pendingShopTransaction()
    const raw = body(trx.id)

    const res = await POST(callbackRequest(raw, { 'X-JWS-Signature': signDetached(raw) }))

    expect(await res.text()).toBe('TRUE')
    expect(await orderStatus(order.id)).toBe('paid')
  })

  it.each([
    ['tr_amount', (raw: string) => raw.replace('tr_amount=29.00', 'tr_amount=0.01')],
    ['tr_crc', (raw: string, otherId: string) => raw.replace(/tr_crc=[^&]+/, `tr_crc=${otherId}`)],
  ])('same signature with tampered %s → "FALSE" 500, orders stay pending', async (_field, tamper) => {
    const { order, trx } = await pendingShopTransaction()
    const other = await pendingShopTransaction2()
    const raw = body(trx.id)
    const signature = signDetached(raw)

    const res = await POST(callbackRequest(tamper(raw, other.trx.id), { 'X-JWS-Signature': signature }))

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('FALSE')
    expect(await orderStatus(order.id)).toBe('pending')
    expect(await orderStatus(other.order.id)).toBe('pending')
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
