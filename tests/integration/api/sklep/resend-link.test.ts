/**
 * Integration Tests: POST /api/sklep/resend-link – „Wyślij link ponownie” (Task 4.5)
 *
 * Real PostgreSQL via Testcontainers; mailer = spy na pendingShopMailer.sendDownloadLinks.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/pages/api/sklep/resend-link'
import { clearRateLimits, recordPublicRequest } from '@/lib/rate-limit-public'
import { pendingShopMailer } from '@/lib/shop/mailer'
import { isShopSalesPath } from '@/lib/shop/guards'
import { RESEND_LINK_MESSAGE } from '@/lib/shop/resendLink'
import { hashToken } from '@/lib/crypto'
import { shopAccountTokens, shopDownloadTokens, users } from '@/db/schema'
import { createMockAPIContext } from '../../../helpers/api-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createPaidOrder, createProduct } from '../../../fixtures/shop'
import { createPatient } from '../../../fixtures/users'

const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

const EMAIL = 'anna@example.com'
const originalFlag = process.env.FF_SKLEP
let ipCounter = 0

/** Każde wywołanie z innego IP (limit IP 5/h nie przeszkadza w testach limitu e-maila). */
function call(body: unknown, ip = `203.0.113.${++ipCounter % 250}`) {
  const url = 'http://localhost/api/sklep/resend-link'
  const request = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return POST(createMockAPIContext({ request, url }))
}

const spySend = () => vi.spyOn(pendingShopMailer, 'sendDownloadLinks')

const EXPECTED_BODY = JSON.stringify({ data: { message: RESEND_LINK_MESSAGE }, error: null })

async function expectGeneric(response: Response) {
  expect(response.status).toBe(200)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(await response.text()).toBe(EXPECTED_BODY)
}

describe('POST /api/sklep/resend-link (test DB)', () => {
  let send: ReturnType<typeof spySend>

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
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    send = spySend().mockResolvedValue(true)
  })

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.FF_SKLEP
    else process.env.FF_SKLEP = originalFlag
    vi.restoreAllMocks()
  })

  async function order(overrides: Partial<Parameters<typeof createPaidOrder>[1]> = {}) {
    const db = getTestDatabase()
    const product = await createProduct(db, { slug: `ebook-${Math.random().toString(36).slice(2)}` })
    return createPaidOrder(db, { email: EMAIL, productIds: [product.id], ...overrides })
  }

  const accountTokens = () => getTestDatabase().select().from(shopAccountTokens)
  const downloadTokens = () => getTestDatabase().select().from(shopDownloadTokens)

  it('no orders → same response, no mail, no tokens', async () => {
    await expectGeneric(await call({ email: EMAIL }))
    expect(send).not.toHaveBeenCalled()
    expect(await downloadTokens()).toHaveLength(0)
    expect(await accountTokens()).toHaveLength(0)
  })

  it('paid orders → one mail with a fresh download token per order (hash in DB)', async () => {
    const a = await order()
    const b = await order()

    await expectGeneric(await call({ email: 'Anna@Example.com ' }))

    expect(send).toHaveBeenCalledTimes(1)
    const [email, downloads] = send.mock.calls[0]
    expect(email).toBe(EMAIL)
    expect(downloads.map((d) => d.order.id).sort()).toEqual([a.order.id, b.order.id].sort())
    for (const d of downloads) {
      expect(d.items).toHaveLength(1)
      expect(d.items[0].orderId).toBe(d.order.id)
      expect(d.downloadToken).toMatch(/^[0-9a-f]{64}$/)
    }

    const rows = await downloadTokens()
    expect(rows).toHaveLength(2)
    for (const d of downloads) {
      const row = rows.find((r) => r.orderId === d.order.id)
      expect(row?.tokenHash).toBe(await hashToken(d.downloadToken))
    }
  })

  it('excludes pending / failed / expired / anonymised orders', async () => {
    await order({ status: 'pending', paidAt: null, confirmationSentAt: null })
    await order({ status: 'failed', paidAt: null, confirmationSentAt: null })
    await order({ status: 'expired', paidAt: null, confirmationSentAt: null })
    await order({ anonymizedAt: new Date() })

    await expectGeneric(await call({ email: EMAIL }))
    expect(send).not.toHaveBeenCalled()
    expect(await downloadTokens()).toHaveLength(0)

    const paid = await order()
    await call({ email: EMAIL })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][1].map((d) => d.order.id)).toEqual([paid.order.id])
  })

  it('no account → create link + new shop_account_tokens row', async () => {
    await order()

    await call({ email: EMAIL })

    const link = send.mock.calls[0][2]
    expect(link.kind).toBe('create')
    if (link.kind !== 'create') throw new Error('unreachable')
    expect(link.emphasized).toBe(false)
    const rows = await accountTokens()
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe(EMAIL)
    expect(rows[0].tokenHash).toBe(await hashToken(link.token))
  })

  it('create link is emphasized when an unattached order requested an account', async () => {
    await order({ accountRequested: true })
    await call({ email: EMAIL })
    expect(send.mock.calls[0][2]).toMatchObject({ kind: 'create', emphasized: true })
  })

  it('account exists + unattached paid order → attach link', async () => {
    const user = await createPatient(getTestDatabase(), { email: 'Anna@Example.com' })
    await order({ userId: user.id })
    await order()

    await call({ email: EMAIL })

    expect(send.mock.calls[0][1]).toHaveLength(2)
    expect(send.mock.calls[0][2].kind).toBe('attach')
    expect(await accountTokens()).toHaveLength(1)
  })

  it('account exists and all orders attached → none, no account token', async () => {
    const user = await createPatient(getTestDatabase(), { email: EMAIL })
    await order({ userId: user.id })

    await call({ email: EMAIL })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][2]).toEqual({ kind: 'none' })
    expect(await accountTokens()).toHaveLength(0)
    expect(await downloadTokens()).toHaveLength(1)
  })

  it('still works after the account was deleted (user row removed → orders userId NULL)', async () => {
    const db = getTestDatabase()
    const user = await createPatient(db, { email: EMAIL })
    const { order: o } = await order({ userId: user.id })
    await db.delete(users).where(eq(users.id, user.id))

    await expectGeneric(await call({ email: EMAIL }))

    expect(send).toHaveBeenCalledTimes(1)
    const [, downloads, link] = send.mock.calls[0]
    expect(downloads[0].order.id).toBe(o.id)
    expect(downloads[0].order.userId).toBeNull()
    expect(link.kind).toBe('create')
  })

  it('e-mail rate limit (2/h): third request → same response, no mail', async () => {
    await order()

    const responses = [await call({ email: EMAIL }), await call({ email: EMAIL }), await call({ email: EMAIL })]

    for (const r of responses) await expectGeneric(r)
    expect(send).toHaveBeenCalledTimes(2)
    expect(await downloadTokens()).toHaveLength(2)
  })

  it('e-mail limit counts requests without orders too (no enumeration via the counter)', async () => {
    await call({ email: EMAIL })
    await call({ email: EMAIL })
    await order()

    await expectGeneric(await call({ email: EMAIL }))
    expect(send).not.toHaveBeenCalled()
  })

  it('IP rate limit (5/h) → 429 with Retry-After, nothing sent', async () => {
    await order()
    const ip = '198.51.100.7'
    for (let i = 0; i < 5; i++) recordPublicRequest(ip)

    const response = await call({ email: EMAIL }, ip)

    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await response.json()).error.code).toBe('rate_limit_exceeded')
    expect(send).not.toHaveBeenCalled()
  })

  it('invalid e-mail / JSON → 400, nothing counted or sent', async () => {
    for (const body of [{ email: 'nie-email' }, {}, { email: 123 }, 'not json']) {
      const response = await call(body, '198.51.100.8')
      expect(response.status).toBe(400)
      expect((await response.json()).error.code).toBe('validation_error')
    }
    expect(send).not.toHaveBeenCalled()
    // limit IP nie zużyty przez błędne żądania
    expect((await call({ email: EMAIL }, '198.51.100.8')).status).toBe(200)
  })

  it('mailer failure (false or throw) → same response', async () => {
    await order()
    send.mockResolvedValueOnce(false)
    await expectGeneric(await call({ email: EMAIL }))

    send.mockRejectedValueOnce(new Error('SMTP down anna@example.com'))
    await expectGeneric(await call({ email: EMAIL }))
    for (const spy of [console.warn, console.error] as unknown as ReturnType<typeof vi.fn>[]) {
      for (const args of spy.mock.calls) expect(JSON.stringify(args)).not.toContain(EMAIL)
    }
  })

  it('works with FF_SKLEP=false (delivery path)', async () => {
    process.env.FF_SKLEP = 'false'
    expect(isShopSalesPath('/api/sklep/resend-link')).toBe(false)
    expect(isShopSalesPath('/sklep/wyslij-link')).toBe(false)
    await order()

    await expectGeneric(await call({ email: EMAIL }))
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('response bodies are byte-identical with and without orders', async () => {
    const without = await (await call({ email: 'ola@example.com' })).text()
    await order()
    const withOrders = await (await call({ email: EMAIL })).text()
    expect(send).toHaveBeenCalledTimes(1)
    expect(withOrders).toBe(without)
    expect(withOrders).toBe(EXPECTED_BODY)
  })
})
