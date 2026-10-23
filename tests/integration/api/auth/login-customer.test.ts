/**
 * Integration Tests (Task 6.2): logowanie klientki sklepu (`customer`).
 *
 * Real PostgreSQL via Testcontainers + prawdziwe endpointy login / forgot-password / reset-password
 * i prawdziwe middleware RBAC (bramka /logowanie: FF_STREFA_PACJENTA || FF_SKLEP).
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { POST as login } from '@/pages/api/auth/login'
import { POST as forgotPassword } from '@/pages/api/auth/forgot-password'
import { POST as resetPassword } from '@/pages/api/auth/reset-password'
import { onRequest as rbacMiddleware } from '@/middleware/rbac'
import { postLoginRedirect } from '@/lib/safeRedirect'
import { isLoginEnabled } from '@/lib/feature-flags'
import { sendPasswordResetEmail } from '@/lib/email'
import { passwordResetTokens, sessions } from '@/db/schema'
import { createMockAPIContext } from '../../../helpers/api-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../../helpers/db-container'
import { createUser } from '../../../helpers/fixtures'

const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

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

vi.mock('@/lib/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/email')>()
  return { ...actual, sendPasswordResetEmail: vi.fn(async () => undefined) }
})

const PASSWORD_HASH = 'ab'.repeat(32)
const NEW_PASSWORD_HASH = 'cd'.repeat(32)
let seq = 0
const uniqueEmail = () => `klientka-${Date.now()}-${++seq}@example.com`

function cookieJar() {
  return { get: () => undefined, set: vi.fn(), delete: vi.fn(), has: () => false }
}

function jsonContext(path: string, body: unknown, cookies = cookieJar()) {
  const url = `http://localhost:4321${path}`
  const request = new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { ...createMockAPIContext({ request, url, cookies }), clientAddress: '203.0.113.7' }
}

async function runRbac(pathname: string, user: unknown = null): Promise<Response> {
  const url = new URL(`http://localhost:4321${pathname}`)
  const context = {
    url,
    request: new Request(url),
    locals: { user },
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  }
  const next = async () => new Response('passed', { status: 200 })
  return (await (rbacMiddleware as any)(context, next)) as Response
}

describe('Integration: logowanie klientki sklepu (Task 6.2)', () => {
  beforeAll(async () => {
    testDb.current = (await startTestDatabase()).db
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(testDb.current as never)
    vi.mocked(sendPasswordResetEmail).mockClear()
  })

  describe('POST /api/auth/login', () => {
    it('customer loguje się (200, sesja) i trafia na /konto/zakupy', async () => {
      const email = uniqueEmail()
      const customer = await createUser(testDb.current as never, {
        email,
        password: PASSWORD_HASH,
        role: 'customer',
        emailVerifiedAt: new Date(),
      })
      const cookies = cookieJar()

      const res = await login(jsonContext('/api/auth/login', { email, password: PASSWORD_HASH }, cookies) as never)
      const body = await res.json()

      expect(res.status).toBe(200)
      expect(body.user).toMatchObject({ id: customer.id, role: 'customer' })
      expect(cookies.set).toHaveBeenCalledTimes(1)
      const rows = await (testDb.current as any).select().from(sessions).where(eq(sessions.userId, customer.id))
      expect(rows).toHaveLength(1)

      // Cel przekierowania w LoginForm
      expect(postLoginRedirect(body.user.role, null)).toBe('/konto/zakupy')
      expect(postLoginRedirect(body.user.role, '/sklep/konto/abc123')).toBe('/sklep/konto/abc123')
      expect(postLoginRedirect(body.user.role, '//evil.com')).toBe('/konto/zakupy')
    })

    it('customer ze złym hasłem → 401', async () => {
      const email = uniqueEmail()
      await createUser(testDb.current as never, { email, password: PASSWORD_HASH, role: 'customer' })

      const res = await login(jsonContext('/api/auth/login', { email, password: NEW_PASSWORD_HASH }) as never)
      expect(res.status).toBe(401)
    })
  })

  describe('reset hasła dla customer', () => {
    it('forgot-password wysyła link, reset-password ustawia nowe hasło, logowanie nowym hasłem działa', async () => {
      vi.stubEnv('SITE_URL', 'https://example.test')
      try {
        const email = uniqueEmail()
        const customer = await createUser(testDb.current as never, {
          email,
          password: PASSWORD_HASH,
          role: 'customer',
          emailVerifiedAt: new Date(),
        })

        const forgotRes = await forgotPassword(jsonContext('/api/auth/forgot-password', { email }) as never)
        expect(forgotRes.status).toBe(200)

        const tokens = await (testDb.current as any)
          .select()
          .from(passwordResetTokens)
          .where(eq(passwordResetTokens.userId, customer.id))
        expect(tokens).toHaveLength(1)

        expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1)
        const [to, resetLink] = vi.mocked(sendPasswordResetEmail).mock.calls[0]
        expect(to).toBe(email)
        const rawToken = String(resetLink).split('/reset-hasla/')[1]
        expect(rawToken).toMatch(/^[a-f0-9]{64}$/)

        const resetRes = await resetPassword(
          jsonContext('/api/auth/reset-password', { token: rawToken, newPassword: NEW_PASSWORD_HASH }) as never,
        )
        expect(resetRes.status).toBe(200)

        const loginRes = await login(
          jsonContext('/api/auth/login', { email, password: NEW_PASSWORD_HASH }) as never,
        )
        expect(loginRes.status).toBe(200)
        expect((await loginRes.json()).user.role).toBe('customer')
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  describe('/logowanie – bramka flag', () => {
    const original = { strefa: process.env.FF_STREFA_PACJENTA, sklep: process.env.FF_SKLEP }

    afterEach(() => {
      for (const [key, value] of [
        ['FF_STREFA_PACJENTA', original.strefa],
        ['FF_SKLEP', original.sklep],
      ] as const) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    })

    it.each([
      ['false', 'true', 200],
      ['true', 'false', 200],
      ['true', 'true', 200],
      ['false', 'false', 404],
    ])('FF_STREFA_PACJENTA=%s, FF_SKLEP=%s → %i', async (strefa, sklep, expected) => {
      process.env.FF_STREFA_PACJENTA = strefa
      process.env.FF_SKLEP = sklep

      expect(isLoginEnabled()).toBe(expected === 200)
      const res = await runRbac('/logowanie')
      expect(res.status).toBe(expected)
      const withNext = await runRbac(`/logowanie?next=${encodeURIComponent('/sklep/konto/abc')}`)
      expect(withNext.status).toBe(expected)
    })

    it('tylko FF_SKLEP: zalogowana klientka na /logowanie → /konto/zakupy', async () => {
      process.env.FF_STREFA_PACJENTA = 'false'
      process.env.FF_SKLEP = 'true'

      const res = await runRbac('/logowanie', { id: 'c1', email: 'k@example.com', role: 'customer' })
      expect(res.status).toBe(302)
      expect(res.headers.get('Location')).toBe('/konto/zakupy')
    })
  })
})
