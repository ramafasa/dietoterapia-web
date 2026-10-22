/**
 * Integration Tests: POST /api/sklep/konto/[token] (Task 4.4) – link konta z maila.
 *
 * Real PostgreSQL via Testcontainers + prawdziwe ShopAccountService / ShopTokenService / Lucia
 * (Lucia na bazie testowej – `@/lib/auth` z leniwym `lucia`).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST } from '@/pages/api/sklep/konto/[token]'
import { onRequest as csrfMiddleware } from '@/middleware/csrf'
import { clearRateLimits, recordShopRequest } from '@/lib/rate-limit-public'
import { isShopSalesPath } from '@/lib/shop/guards'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { createLucia } from '@/lib/auth'
import { sessions, shopAccountTokens, shopOrders, users } from '@/db/schema'
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

// `lucia` z '@/lib/auth' powstaje przy imporcie z (jeszcze pustym) `db` – podmieniamy na instancję
// zbudowaną leniwie na bazie testowej.
const luciaHolder = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>()
  return {
    ...actual,
    get lucia() {
      luciaHolder.current ??= actual.createLucia(testDb.current as never)
      return luciaHolder.current
    },
  }
})

const IP = '203.0.113.44'
const EMAIL = 'anna@example.com'
const PASSWORD_HASH = 'ab'.repeat(32)
const originalFlag = process.env.FF_SKLEP

type SessionUser = { id: string; email: string; role: string } | null

function cookieJar() {
  const set = vi.fn()
  return { get: () => undefined, set, delete: vi.fn(), has: () => false }
}

function buildContext(token: string, body: unknown, user: SessionUser = null, cookies = cookieJar()) {
  const url = `http://localhost/api/sklep/konto/${token}`
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': IP },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  return createMockAPIContext({
    request,
    url,
    params: { token },
    cookies,
    locals: createMockAuthContext({ user }),
  })
}

async function call(token: string, body: unknown = {}, user: SessionUser = null, cookies = cookieJar()) {
  const response = await POST(buildContext(token, body, user, cookies))
  const text = await response.text()
  return { response, text, json: JSON.parse(text), cookies }
}

describe('POST /api/sklep/konto/[token] (test DB)', () => {
  beforeAll(async () => {
    testDb.current = (await startTestDatabase()).db
  })

  afterAll(async () => {
    testDb.current = undefined
    luciaHolder.current = undefined
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

  async function paidOrder(email = EMAIL, userId: string | null = null) {
    const db = getTestDatabase()
    const product = await createProduct(db, { slug: `ebook-${Math.random().toString(36).slice(2)}` })
    const { order } = await createPaidOrder(db, { email, productIds: [product.id], userId, firstName: 'Anna' })
    return order
  }

  const accountToken = (email = EMAIL, now?: Date) =>
    new ShopTokenService(getTestDatabase()).createAccountToken(email, now)

  async function tokenUsed(token: string) {
    return !(await new ShopTokenService(getTestDatabase()).peekAccountToken(token))
  }

  function expectNoLeak(text: string, token: string) {
    expect(text).not.toContain(token)
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain(PASSWORD_HASH)
  }

  describe('create (no account, no session)', () => {
    it('201: creates a verified customer, attaches all paid orders, sets a Lucia session cookie', async () => {
      const db = getTestDatabase()
      const a = await paidOrder()
      const b = await paidOrder('Anna@Example.com')
      const other = await paidOrder('ola@example.com')
      const token = await accountToken()

      const { response, json, text, cookies } = await call(token, { passwordHash: PASSWORD_HASH })

      expect(response.status).toBe(201)
      expect(response.headers.get('Cache-Control')).toBe('no-store')
      expect(json).toEqual({ data: { result: 'created_and_logged_in', redirectTo: '/konto/zakupy' }, error: null })
      expectNoLeak(text, token)

      const [user] = await db.select().from(users).where(eq(users.email, EMAIL))
      expect(user.role).toBe('customer')
      expect(user.status).toBe('active')
      expect(user.emailVerifiedAt).not.toBeNull()

      const orders = await db.select().from(shopOrders)
      expect(orders.find((o) => o.id === a.id)?.userId).toBe(user.id)
      expect(orders.find((o) => o.id === b.id)?.userId).toBe(user.id)
      expect(orders.find((o) => o.id === other.id)?.userId).toBeNull()

      // Ciasteczko sesji Lucia, sesja w DB należy do nowego konta
      const lucia = createLucia(db)
      expect(cookies.set).toHaveBeenCalledTimes(1)
      const [name, value] = cookies.set.mock.calls[0]
      expect(name).toBe(lucia.sessionCookieName)
      const [session] = await db.select().from(sessions).where(eq(sessions.id, value))
      expect(session.userId).toBe(user.id)
      const validated = await lucia.validateSession(value)
      expect(validated.user?.role).toBe('customer')

      expect(await tokenUsed(token)).toBe(true)
    })

    it('second POST with the same token → 404', async () => {
      await paidOrder()
      const token = await accountToken()
      expect((await call(token, { passwordHash: PASSWORD_HASH })).response.status).toBe(201)

      const second = await call(token, { passwordHash: PASSWORD_HASH })
      expect(second.response.status).toBe(404)
      expect(second.json.error.code).toBe('not_found')
      expect(second.cookies.set).not.toHaveBeenCalled()
    })

    it('missing passwordHash → 422 password_required, token still usable', async () => {
      const token = await accountToken()
      for (const body of [{}, undefined, { passwordHash: '' }]) {
        const { response, json } = await call(token, body)
        expect(response.status).toBe(422)
        expect(json.error.code).toBe('password_required')
      }
      expect(await tokenUsed(token)).toBe(false)
    })

    it('malformed passwordHash → 400, no account, token still usable', async () => {
      const token = await accountToken()
      for (const passwordHash of ['short', 'Z'.repeat(64), 'AB'.repeat(32)]) {
        const { response, json } = await call(token, { passwordHash })
        expect(response.status).toBe(400)
        expect(json.error.code).toBe('validation_error')
      }
      expect(await getTestDatabase().select().from(users)).toHaveLength(0)
      expect(await tokenUsed(token)).toBe(false)
    })

    it('bad body (invalid JSON / not an object / non-string hash) → 400', async () => {
      const token = await accountToken()
      expect((await call(token, '{nope')).response.status).toBe(400)
      expect((await call(token, '[1]')).response.status).toBe(400)
      expect((await call(token, { passwordHash: 123 })).response.status).toBe(400)
      expect(await tokenUsed(token)).toBe(false)
    })
  })

  describe('existing account', () => {
    it('matching session (case-insensitive) → 200 attached with count, token consumed', async () => {
      const db = getTestDatabase()
      const patient = await createPatient(db, { email: EMAIL })
      const a = await paidOrder()
      await paidOrder()
      await paidOrder('ola@example.com')
      const token = await accountToken()

      const { response, json, text, cookies } = await call(token, {}, {
        id: patient.id,
        email: 'Anna@Example.com',
        role: 'patient',
      })

      expect(response.status).toBe(200)
      expect(json).toEqual({ data: { result: 'attached', count: 2 }, error: null })
      expectNoLeak(text, token)
      expect(cookies.set).not.toHaveBeenCalled()
      const [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, a.id))
      expect(row.userId).toBe(patient.id)
      expect(await tokenUsed(token)).toBe(true)
    })

    it('no session → 409 login_required, token still usable', async () => {
      await createPatient(getTestDatabase(), { email: EMAIL })
      const token = await accountToken()

      const { response, json, text } = await call(token, { passwordHash: PASSWORD_HASH })

      expect(response.status).toBe(409)
      expect(json.error.code).toBe('login_required')
      expectNoLeak(text, token)
      expect(await tokenUsed(token)).toBe(false)
    })

    it('session of another account → 409 login_required, nothing attached', async () => {
      const db = getTestDatabase()
      await createPatient(db, { email: EMAIL })
      const other = await createPatient(db, { email: 'ola@example.com' })
      const order = await paidOrder()
      const token = await accountToken()

      const { response, json } = await call(token, {}, { id: other.id, email: other.email, role: 'patient' })

      expect(response.status).toBe(409)
      expect(json.error.code).toBe('login_required')
      const [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, order.id))
      expect(row.userId).toBeNull()
      expect(await tokenUsed(token)).toBe(false)
    })
  })

  it('no account + session of another account → 409 different_account, no account created', async () => {
    const db = getTestDatabase()
    const other = await createPatient(db, { email: 'ola@example.com' })
    const token = await accountToken()

    const { response, json, text, cookies } = await call(token, { passwordHash: PASSWORD_HASH }, {
      id: other.id,
      email: other.email,
      role: 'patient',
    })

    expect(response.status).toBe(409)
    expect(json.error.code).toBe('different_account')
    expectNoLeak(text, token)
    expect(cookies.set).not.toHaveBeenCalled()
    expect(await db.select().from(users).where(eq(users.email, EMAIL))).toHaveLength(0)
    expect(await tokenUsed(token)).toBe(false)
  })

  it('expired / unknown / malformed token → 404', async () => {
    const expired = await accountToken(EMAIL, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000))
    for (const token of [expired, 'f'.repeat(64), 'garbage']) {
      const { response, json } = await call(token, { passwordHash: PASSWORD_HASH })
      expect(response.status).toBe(404)
      expect(json.error.code).toBe('not_found')
    }
    expect(await getTestDatabase().select().from(users)).toHaveLength(0)
  })

  it('works with FF_SKLEP=false (delivery path)', async () => {
    process.env.FF_SKLEP = 'false'
    const token = await accountToken()
    expect(isShopSalesPath(`/api/sklep/konto/${token}`)).toBe(false)
    expect(isShopSalesPath(`/sklep/konto/${token}`)).toBe(false)

    expect((await call(token, { passwordHash: PASSWORD_HASH })).response.status).toBe(201)
  })

  it('429 with Retry-After when the shop IP limit is exceeded (token untouched)', async () => {
    const token = await accountToken()
    for (let i = 0; i < 60; i++) recordShopRequest(IP)

    const { response, json } = await call(token, { passwordHash: PASSWORD_HASH })

    expect(response.status).toBe(429)
    expect(json.error.code).toBe('rate_limit_exceeded')
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(await tokenUsed(token)).toBe(false)
    expect(await getTestDatabase().select().from(shopAccountTokens)).toHaveLength(1)
  })

  it('same-origin POST passes the CSRF middleware and reaches the handler', async () => {
    const token = await accountToken()
    const context = buildContext(token, { passwordHash: PASSWORD_HASH })
    const headers = new Headers(context.request.headers)
    headers.set('origin', 'https://paulinamaciak.pl')
    headers.set('host', 'paulinamaciak.pl')
    const request = new Request(`https://paulinamaciak.pl/api/sklep/konto/${token}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ passwordHash: PASSWORD_HASH }),
    })
    const csrfContext = { ...context, request, url: new URL(request.url) }

    const response = (await (csrfMiddleware as any)(csrfContext, () => POST(csrfContext))) as Response

    expect(response.status).toBe(201)
  })
})
