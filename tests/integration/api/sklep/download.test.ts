/**
 * Integration Tests: pobieranie e-booka (Task 4.3) – trzy wejścia + „Załóż konto” ze strony pobierania.
 *
 * - GET  /api/sklep/pobierz/[token]/[itemId]          (link z maila)
 * - GET  /api/sklep/orders/[id]/items/[itemId]/download (ciasteczko strony sukcesu)
 * - GET  /api/konto/zakupy/[itemId]/download            (konto)
 * - POST /api/sklep/pobierz/[token]/account-link        (mail z linkiem konta)
 *
 * Real PostgreSQL via Testcontainers; presign zamockowany.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { GET as tokenDownload } from '@/pages/api/sklep/pobierz/[token]/[itemId]'
import { POST as accountLink } from '@/pages/api/sklep/pobierz/[token]/account-link'
import { GET as checkoutDownload } from '@/pages/api/sklep/orders/[id]/items/[itemId]/download'
import { GET as accountDownload } from '@/pages/api/konto/zakupy/[itemId]/download'
import { clearRateLimits, recordEmailSent, recordPublicRequest } from '@/lib/rate-limit-public'
import { pendingShopMailer } from '@/lib/shop/mailer'
import { isShopSalesPath } from '@/lib/shop/guards'
import { CHECKOUT_COOKIE } from '@/lib/shop/constants'
import { hashToken } from '@/lib/crypto'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { shopAccountTokens } from '@/db/schema'
import { createMockAPIContext } from '../../../helpers/api-helper'
import { createMockAuthContext } from '../../../helpers/auth-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createPaidOrder, createProduct } from '../../../fixtures/shop'
import { createPatient } from '../../../fixtures/users'

const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

const PRESIGNED = 'https://r2.example.com/bucket/proteinowa.pdf?X-Amz-Signature=abc'
vi.mock('@/lib/storage/s3-presign', () => ({
  generatePresignedUrl: vi.fn(async () => PRESIGNED),
}))

const SECRET = 'ab'.repeat(32)
const IP = '203.0.113.9'
const originalFlag = process.env.FF_SKLEP

function cookiesWith(value?: string) {
  return {
    get: (name: string) => (name === CHECKOUT_COOKIE && value !== undefined ? { value } : undefined),
    set: vi.fn(),
    delete: vi.fn(),
    has: (name: string) => name === CHECKOUT_COOKIE && value !== undefined,
  }
}

function ctx(path: string, params: Record<string, string>, extra: Record<string, unknown> = {}, method = 'GET') {
  const url = `http://localhost${path}`
  const request = new Request(url, { method, headers: { 'x-forwarded-for': IP } })
  return createMockAPIContext({ request, url, params, ...extra })
}

async function expectRedirectToFile(response: Response) {
  expect(response.status).toBe(302)
  expect(response.headers.get('Location')).toBe(PRESIGNED)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer')
}

function expectNotFound(response: Response) {
  expect(response.status).toBe(404)
  expect(response.headers.get('Location')).toBeNull()
  expect(response.headers.get('Cache-Control')).toBe('no-store')
}

describe('e-book download endpoints (test DB)', () => {
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

  async function order(overrides: Record<string, unknown> = {}) {
    const db = getTestDatabase()
    const product = await createProduct(db, { slug: `ebook-${Math.random().toString(36).slice(2)}` })
    const { order, items } = await createPaidOrder(db, {
      email: 'anna@example.com',
      productIds: [product.id],
      checkoutSecretHash: await hashToken(SECRET),
      ...overrides,
    })
    const token = await new ShopTokenService(db).createDownloadToken(order.id)
    return { order, item: items[0], token }
  }

  describe('GET /api/sklep/pobierz/[token]/[itemId]', () => {
    const call = (token: string, itemId: string) =>
      tokenDownload(ctx(`/api/sklep/pobierz/${token}/${itemId}`, { token, itemId }))

    it('302 to the presigned URL for a valid token', async () => {
      const { item, token } = await order()
      await expectRedirectToFile(await call(token, item.id))
    })

    it('404 for an invalid token', async () => {
      const { item } = await order()
      expectNotFound(await call('f'.repeat(64), item.id))
      expectNotFound(await call('garbage', item.id))
    })

    it('404 for an item of another order', async () => {
      const a = await order()
      const b = await order({ email: 'ola@example.com' })
      expectNotFound(await call(a.token, b.item.id))
    })

    it('404 while the confirmation e-mail has not been sent', async () => {
      const { item, token } = await order({ confirmationSentAt: null })
      expectNotFound(await call(token, item.id))
    })

    it('works with FF_SKLEP=false (delivery path)', async () => {
      process.env.FF_SKLEP = 'false'
      const { item, token } = await order()
      expect(isShopSalesPath(`/api/sklep/pobierz/${token}/${item.id}`)).toBe(false)
      expect(isShopSalesPath(`/sklep/pobierz/${token}`)).toBe(false)
      await expectRedirectToFile(await call(token, item.id))
    })
  })

  describe('GET /api/sklep/orders/[id]/items/[itemId]/download', () => {
    const call = (id: string, itemId: string, cookie?: string) =>
      checkoutDownload(
        ctx(`/api/sklep/orders/${id}/items/${itemId}/download`, { id, itemId }, { cookies: cookiesWith(cookie) })
      )

    it('302 with a valid checkout cookie', async () => {
      const { order: o, item } = await order()
      await expectRedirectToFile(await call(o.id, item.id, `${o.id}.${SECRET}`))
    })

    it('404 without the cookie', async () => {
      const { order: o, item } = await order()
      expectNotFound(await call(o.id, item.id))
    })

    it('404 with a wrong secret / a cookie for another order', async () => {
      const { order: o, item } = await order()
      expectNotFound(await call(o.id, item.id, `${o.id}.${'cd'.repeat(32)}`))
      const other = '44444444-4444-4444-8444-444444444444'
      expectNotFound(await call(o.id, item.id, `${other}.${SECRET}`))
    })

    it('404 for a pending order', async () => {
      const { order: o, item } = await order({ status: 'pending', paidAt: null, confirmationSentAt: null })
      expectNotFound(await call(o.id, item.id, `${o.id}.${SECRET}`))
    })

    it('works with FF_SKLEP=false (delivery path)', async () => {
      process.env.FF_SKLEP = 'false'
      const { order: o, item } = await order()
      expect(isShopSalesPath(`/api/sklep/orders/${o.id}/items/${item.id}/download`)).toBe(false)
      await expectRedirectToFile(await call(o.id, item.id, `${o.id}.${SECRET}`))
    })
  })

  describe('GET /api/konto/zakupy/[itemId]/download', () => {
    const call = (itemId: string, user: { id: string; email: string } | null) =>
      accountDownload(
        ctx(`/api/konto/zakupy/${itemId}/download`, { itemId }, {
          locals: createMockAuthContext({ user: user ? { ...user, role: 'patient' } : null }),
        })
      )

    it('401 without a session', async () => {
      const { item } = await order()
      const response = await call(item.id, null)
      expect(response.status).toBe(401)
    })

    it('404 for another user\'s item', async () => {
      const db = getTestDatabase()
      const owner = await createPatient(db, { email: 'anna@example.com' })
      const other = await createPatient(db, { email: 'ola@example.com' })
      const { item } = await order({ userId: owner.id })
      expectNotFound(await call(item.id, { id: other.id, email: other.email }))
    })

    it('302 for the user\'s own item', async () => {
      const db = getTestDatabase()
      const owner = await createPatient(db, { email: 'anna@example.com' })
      const { item } = await order({ userId: owner.id })
      await expectRedirectToFile(await call(item.id, { id: owner.id, email: owner.email }))
    })
  })

  describe('POST /api/sklep/pobierz/[token]/account-link', () => {
    const call = (token: string) =>
      accountLink(ctx(`/api/sklep/pobierz/${token}/account-link`, { token }, {}, 'POST'))

    async function accountTokenCount() {
      return (await getTestDatabase().select().from(shopAccountTokens)).length
    }

    it('sends a fresh account token by e-mail only; redirects with the confirmation flag', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const { token } = await order()

      const response = await call(token)

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe(`/sklep/pobierz/${token}?konto=wyslano`)
      expect(send).toHaveBeenCalledTimes(1)
      const [email, link] = send.mock.calls[0]
      expect(email).toBe('anna@example.com')
      expect(link.kind).toBe('create')
      expect(link.token).toMatch(/^[0-9a-f]{64}$/)
      expect(link.token).not.toBe(token)
      expect(await accountTokenCount()).toBe(1)
      const body = await response.text()
      expect(body).not.toContain(link.token)
      expect(response.headers.get('Location')).not.toContain(link.token)
    })

    it('sends an attach link when an account with this e-mail exists', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      await createPatient(getTestDatabase(), { email: 'Anna@Example.com' })
      const { token } = await order()

      await call(token)

      expect(send.mock.calls[0][1].kind).toBe('attach')
    })

    it('same response, no send when the e-mail rate limit is exceeded', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const { token } = await order()
      recordEmailSent('anna@example.com')
      recordEmailSent('anna@example.com')

      const response = await call(token)

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe(`/sklep/pobierz/${token}?konto=wyslano`)
      expect(send).not.toHaveBeenCalled()
      expect(await accountTokenCount()).toBe(0)
    })

    it('same response, no send when the IP rate limit is exceeded', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const { token } = await order()
      for (let i = 0; i < 5; i++) recordPublicRequest(IP)

      const response = await call(token)

      expect(response.headers.get('Location')).toBe(`/sklep/pobierz/${token}?konto=wyslano`)
      expect(send).not.toHaveBeenCalled()
    })

    it('third request within an hour is not sent (2/h per e-mail)', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const { token } = await order()

      await call(token)
      await call(token)
      await call(token)

      expect(send).toHaveBeenCalledTimes(2)
    })

    it('same response when the mailer fails (does not reveal delivery)', async () => {
      vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(false)
      const { token } = await order()

      const response = await call(token)

      expect(response.headers.get('Location')).toBe(`/sklep/pobierz/${token}?konto=wyslano`)
    })

    it('does nothing for an order that already has a userId', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const user = await createPatient(getTestDatabase(), { email: 'anna@example.com' })
      const { token } = await order({ userId: user.id })

      const response = await call(token)

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe(`/sklep/pobierz/${token}`)
      expect(send).not.toHaveBeenCalled()
      expect(await accountTokenCount()).toBe(0)
    })

    it('invalid token → back to the page (which shows "Link wygasł"), no send', async () => {
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const bad = 'f'.repeat(64)

      const response = await call(bad)

      expect(response.headers.get('Location')).toBe(`/sklep/pobierz/${bad}`)
      expect(send).not.toHaveBeenCalled()
    })

    it('works with FF_SKLEP=false (delivery path)', async () => {
      process.env.FF_SKLEP = 'false'
      const send = vi.spyOn(pendingShopMailer, 'sendAccountLink').mockResolvedValue(true)
      const { token } = await order()
      expect(isShopSalesPath(`/api/sklep/pobierz/${token}/account-link`)).toBe(false)

      await call(token)

      expect(send).toHaveBeenCalledTimes(1)
    })
  })
})
