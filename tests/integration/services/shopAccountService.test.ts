/**
 * Integration Tests: ShopAccountService (sklep, Task 4.2)
 *
 * Real PostgreSQL via Testcontainers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import bcrypt from 'bcrypt'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import * as schema from '@/db/schema'
import type { Database } from '@/db'
import { auditLog, events, shopAccountTokens, shopOrders, users } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createUser } from '../../helpers/fixtures'
import { createProduct, createPaidOrder } from '../../fixtures/shop'
import { InvalidPasswordHashError, ShopAccountService } from '@/lib/services/shopAccountService'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { hashToken } from '@/lib/crypto'

let db: Database
let container: StartedPostgreSqlContainer
let service: ShopAccountService
let tokens: ShopTokenService

// SHA-256 hasła z klienta (hashPasswordClient) – 64 znaki hex
const CLIENT_HASH = 'a'.repeat(32) + 'b'.repeat(32)
const EMAIL = 'anna@example.com'

beforeAll(async () => {
  const result = await startTestDatabase()
  db = result.db
  container = result.container
  service = new ShopAccountService(db)
  tokens = new ShopTokenService(db)
})

afterAll(async () => {
  await stopTestDatabase()
})

beforeEach(async () => {
  await cleanDatabase(db)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

let productId: string | undefined
async function order(
  overrides: Partial<typeof shopOrders.$inferInsert> & { email?: string; userId?: string | null } = {}
) {
  if (!productId) productId = (await createProduct(db)).id
  const { order } = await createPaidOrder(db, {
    email: overrides.email ?? EMAIL,
    productIds: [productId],
    userId: overrides.userId ?? null,
    accountRequested: false,
    ...overrides,
  })
  return order
}
beforeEach(() => {
  productId = undefined
})

async function orderRow(id: string) {
  const [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, id))
  return row
}

async function tokenUsedAt(raw: string) {
  const [row] = await db
    .select({ usedAt: shopAccountTokens.usedAt })
    .from(shopAccountTokens)
    .where(eq(shopAccountTokens.tokenHash, await hashToken(raw)))
  return row.usedAt
}

function allLogs(): string {
  const spies = [console.log, console.warn, console.error] as unknown as Array<{ mock: { calls: unknown[][] } }>
  return JSON.stringify(spies.flatMap((s) => s.mock.calls))
}

describe('Integration: ShopAccountService.resolveAccountLinkForOrder', () => {
  it('order with userId → none, no token created', async () => {
    const user = await createUser(db, { email: EMAIL, role: 'customer' })
    const o = await order({ userId: user.id })

    expect(await service.resolveAccountLinkForOrder(o)).toEqual({ kind: 'none' })
    expect(await db.select().from(shopAccountTokens)).toHaveLength(0)
  })

  it('existing account with that e-mail (case-insensitive) → attach + valid account token', async () => {
    await createUser(db, { email: 'Anna@Example.com', role: 'patient' })
    const o = await order()

    const link = await service.resolveAccountLinkForOrder(o)

    expect(link.kind).toBe('attach')
    if (link.kind !== 'attach') return
    expect(await tokens.peekAccountToken(link.token)).toEqual({ email: EMAIL })
  })

  it.each([
    [false, false],
    [true, true],
  ])('no account → create + token, emphasized = accountRequested (%s)', async (accountRequested, emphasized) => {
    const o = await order({ accountRequested })

    const link = await service.resolveAccountLinkForOrder(o)

    expect(link).toMatchObject({ kind: 'create', emphasized })
    if (link.kind !== 'create') return
    expect(await tokens.peekAccountToken(link.token)).toEqual({ email: EMAIL })
    expect(await db.select().from(shopAccountTokens)).toHaveLength(1)
  })
})

describe('Integration: ShopAccountService.attachOrdersByEmail', () => {
  it('attaches only paid, unattached orders with that e-mail (case-insensitive); others untouched', async () => {
    const user = await createUser(db, { email: EMAIL, role: 'customer' })
    const other = await createUser(db, { email: 'ola@example.com', role: 'customer' })
    const paid1 = await order()
    const paid2 = await order()
    const pending = await order({ status: 'pending', paidAt: null })
    const failed = await order({ status: 'failed', paidAt: null })
    const expired = await order({ status: 'expired', paidAt: null })
    const alreadyAttached = await order({ userId: other.id })
    const otherEmail = await order({ email: 'ola@example.com' })

    expect(await service.attachOrdersByEmail(user.id, 'Anna@EXAMPLE.com')).toBe(2)

    expect((await orderRow(paid1.id)).userId).toBe(user.id)
    expect((await orderRow(paid2.id)).userId).toBe(user.id)
    for (const o of [pending, failed, expired, otherEmail]) expect((await orderRow(o.id)).userId).toBeNull()
    expect((await orderRow(alreadyAttached.id)).userId).toBe(other.id)
  })

  it('anonymised paid order with a matching e-mail is not attached', async () => {
    const user = await createUser(db, { email: EMAIL, role: 'customer' })
    const anonymised = await order({ anonymizedAt: new Date() })

    expect(await service.attachOrdersByEmail(user.id, EMAIL)).toBe(0)
    expect((await orderRow(anonymised.id)).userId).toBeNull()
  })

  it('DB error → generic error, log without e-mail', async () => {
    await expect(service.attachOrdersByEmail('not-a-uuid', EMAIL)).rejects.toThrow('Failed to attach orders')
    expect(allLogs()).not.toContain(EMAIL)
  })
})

describe('Integration: ShopAccountService.createAccountFromToken', () => {
  it('creates verified customer: bcrypt over client hash, firstName from newest paid order, ALL paid orders attached', async () => {
    const now = new Date()
    const old = await order({ firstName: 'Ania', paidAt: new Date(now.getTime() - 86_400_000) })
    const newest = await order({ firstName: 'Anna', paidAt: now })
    const pending = await order({ status: 'pending', paidAt: null, firstName: 'Pending' })
    const failed = await order({ status: 'failed', paidAt: null })
    const foreign = await order({ email: 'ola@example.com', firstName: 'Ola' })
    const raw = await tokens.createAccountToken(EMAIL)

    const result = await service.createAccountFromToken(raw, CLIENT_HASH, now)

    expect(result.ok).toBe(true)
    if (result.ok !== true) return
    const [user] = await db.select().from(users).where(eq(users.id, result.userId))
    expect(user).toMatchObject({ email: EMAIL, role: 'customer', status: 'active', firstName: 'Anna' })
    expect(user.emailVerifiedAt?.getTime()).toBe(now.getTime())
    expect(user.passwordHash).not.toBe(CLIENT_HASH)
    expect(await bcrypt.compare(CLIENT_HASH, user.passwordHash)).toBe(true)

    expect((await orderRow(old.id)).userId).toBe(user.id)
    expect((await orderRow(newest.id)).userId).toBe(user.id)
    expect((await orderRow(pending.id)).userId).toBeNull()
    expect((await orderRow(failed.id)).userId).toBeNull()
    expect((await orderRow(foreign.id)).userId).toBeNull()
    expect(await tokenUsedAt(raw)).not.toBeNull()
  })

  it('writes audit log (create users) and signup event', async () => {
    await order()
    const raw = await tokens.createAccountToken(EMAIL)

    const result = await service.createAccountFromToken(raw, CLIENT_HASH)
    if (result.ok !== true) throw new Error('expected ok')

    const audits = await db.select().from(auditLog).where(eq(auditLog.recordId, result.userId))
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: 'create', tableName: 'users', userId: result.userId })
    const evts = await db.select().from(events).where(eq(events.userId, result.userId))
    expect(evts).toHaveLength(1)
    expect(evts[0]).toMatchObject({
      eventType: 'signup',
      properties: { role: 'customer', source: 'shop_account_link' },
    })
  })

  it('second use of the same token → invalid, nothing new created', async () => {
    await order()
    const raw = await tokens.createAccountToken(EMAIL)
    expect((await service.createAccountFromToken(raw, CLIENT_HASH)).ok).toBe(true)

    expect(await service.createAccountFromToken(raw, CLIENT_HASH)).toEqual({ ok: false, reason: 'invalid' })
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('unknown / expired token → invalid', async () => {
    const now = new Date()
    const raw = await tokens.createAccountToken(EMAIL, now)
    const later = new Date(now.getTime() + 31 * 86_400_000)

    expect(await service.createAccountFromToken('f'.repeat(64), CLIENT_HASH)).toEqual({ ok: false, reason: 'invalid' })
    expect(await service.createAccountFromToken(raw, CLIENT_HASH, later)).toEqual({ ok: false, reason: 'invalid' })
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('existing account (any case) → account_exists, nothing changed, token unused', async () => {
    await createUser(db, { email: 'Anna@Example.com', role: 'patient' })
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)

    expect(await service.createAccountFromToken(raw, CLIENT_HASH)).toEqual({ ok: false, reason: 'account_exists' })

    expect(await db.select().from(users)).toHaveLength(1)
    expect((await orderRow(o.id)).userId).toBeNull()
    expect(await tokenUsedAt(raw)).toBeNull()
    expect(await db.select().from(auditLog)).toHaveLength(0)
  })

  it('unique-violation race (concurrent insert of the same e-mail) → account_exists, full rollback', async () => {
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)
    // Osobna pula: blokująca transakcja wstawia konto (niezacommitowane), więc SELECT serwisu go nie
    // widzi, a INSERT czeka na indeks unikalny i po commicie blokującej dostaje 23505.
    const sql = postgres(container.getConnectionUri(), { max: 3 })
    try {
      const poolService = new ShopAccountService(drizzle(sql, { schema }) as unknown as Database)
      let pending: Promise<PromiseSettledResult<unknown>> | undefined
      await sql.begin(async (t) => {
        await t`insert into users (email, password_hash, role) values (${EMAIL}, 'x', 'patient')`
        // allSettled: odrzucenie nie zostaje „unhandled”, gdy poll niżej rzuci
        pending = Promise.allSettled([poolService.createAccountFromToken(raw, CLIENT_HASH)]).then(([r]) => r)
        // Czekamy (≤ 5 s), aż INSERT serwisu faktycznie stoi na blokadzie indeksu unikalnego
        const deadline = Date.now() + 5000
        for (;;) {
          const [{ waiting }] = await sql<{ waiting: number }[]>`
            select count(*)::int as waiting from pg_stat_activity
            where wait_event_type = 'Lock' and query ilike 'insert into "users"%'`
          if (waiting > 0) break
          if (Date.now() > deadline) throw new Error('service INSERT never blocked on the unique index')
          await new Promise((r) => setTimeout(r, 25))
        }
      })

      expect(await pending).toEqual({ status: 'fulfilled', value: { ok: false, reason: 'account_exists' } })
      // gałąź unique-violation (nie wcześniejszy SELECT) faktycznie zadziałała
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain('users e-mail unique violation')
    } finally {
      await sql.end({ timeout: 5 })
    }

    const all = await db.select().from(users)
    expect(all).toHaveLength(1)
    expect(all[0].role).toBe('patient')
    expect((await orderRow(o.id)).userId).toBeNull()
    expect(await tokenUsedAt(raw)).toBeNull()
  })

  it('invalid password hash format → throws before touching the token', async () => {
    const raw = await tokens.createAccountToken(EMAIL)
    for (const bad of ['', 'short', 'A'.repeat(64), 'g'.repeat(64)]) {
      await expect(service.createAccountFromToken(raw, bad)).rejects.toBeInstanceOf(InvalidPasswordHashError)
    }
    expect(await tokenUsedAt(raw)).toBeNull()
  })
})

describe('Integration: ShopAccountService.handleAccountToken', () => {
  it('invalid / used token → invalid', async () => {
    const raw = await tokens.createAccountToken(EMAIL)
    await tokens.consumeAccountToken(raw)

    expect(await service.handleAccountToken('f'.repeat(64), { sessionUser: null })).toEqual({ result: 'invalid' })
    expect(await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })).toEqual({
      result: 'invalid',
    })
  })

  it('existing account + session on the same e-mail (case-insensitive) → attached, token consumed', async () => {
    const user = await createUser(db, { email: 'Anna@X.pl', role: 'customer' })
    const o1 = await order({ email: 'anna@x.pl' })
    const o2 = await order({ email: 'anna@x.pl' })
    const raw = await tokens.createAccountToken('anna@x.pl')

    const result = await service.handleAccountToken(raw, {
      sessionUser: { id: user.id, email: 'Anna@X.pl', role: 'customer' },
    })

    expect(result).toEqual({ result: 'attached', count: 2 })
    expect((await orderRow(o1.id)).userId).toBe(user.id)
    expect((await orderRow(o2.id)).userId).toBe(user.id)
    expect(await tokenUsedAt(raw)).not.toBeNull()
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('existing patient account → attach works, role unchanged', async () => {
    const patient = await createUser(db, { email: EMAIL, role: 'patient' })
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)

    expect(
      await service.handleAccountToken(raw, { sessionUser: { id: patient.id, email: EMAIL, role: 'patient' } })
    ).toEqual({ result: 'attached', count: 1 })

    expect((await orderRow(o.id)).userId).toBe(patient.id)
    const [row] = await db.select().from(users).where(eq(users.id, patient.id))
    expect(row.role).toBe('patient')
  })

  it('existing account, no session → login_required, token NOT consumed, nothing attached', async () => {
    await createUser(db, { email: EMAIL, role: 'customer' })
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)

    expect(await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })).toEqual({
      result: 'login_required',
    })
    expect(await tokenUsedAt(raw)).toBeNull()
    expect((await orderRow(o.id)).userId).toBeNull()
  })

  it('existing account, session of a DIFFERENT account → login_required, nothing attached to the session user', async () => {
    await createUser(db, { email: EMAIL, role: 'customer' })
    const intruder = await createUser(db, { email: 'ola@example.com', role: 'customer' })
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)

    expect(
      await service.handleAccountToken(raw, {
        sessionUser: { id: intruder.id, email: 'ola@example.com', role: 'customer' },
      })
    ).toEqual({ result: 'login_required' })
    expect(await tokenUsedAt(raw)).toBeNull()
    expect((await orderRow(o.id)).userId).toBeNull()
  })

  it('no account, session of a different account → different_account, token NOT consumed, no account created', async () => {
    const other = await createUser(db, { email: 'ola@example.com', role: 'customer' })
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)

    expect(
      await service.handleAccountToken(raw, {
        sessionUser: { id: other.id, email: 'ola@example.com', role: 'customer' },
        passwordHash: CLIENT_HASH,
      })
    ).toEqual({ result: 'different_account' })
    expect(await tokenUsedAt(raw)).toBeNull()
    expect(await db.select().from(users)).toHaveLength(1)
    expect((await orderRow(o.id)).userId).toBeNull()
  })

  it('no account, no password → password_required, token NOT consumed', async () => {
    await order()
    const raw = await tokens.createAccountToken(EMAIL)

    expect(await service.handleAccountToken(raw, { sessionUser: null })).toEqual({ result: 'password_required' })
    expect(await tokenUsedAt(raw)).toBeNull()
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('no account + password → created_and_logged_in, orders attached, token consumed', async () => {
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)

    const result = await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })

    expect(result.result).toBe('created_and_logged_in')
    if (result.result !== 'created_and_logged_in') return
    expect((await orderRow(o.id)).userId).toBe(result.userId)
    expect(await tokenUsedAt(raw)).not.toBeNull()
  })

  it('account created between peek and create (race) → login_required, nothing created, token unused', async () => {
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)
    let raced = false
    const racingTokens = {
      createAccountToken: tokens.createAccountToken.bind(tokens),
      peekAccountToken: async (r: string, now?: Date) => {
        const peeked = await tokens.peekAccountToken(r, now)
        if (!raced) {
          raced = true
          await createUser(db, { email: EMAIL, role: 'patient' })
        }
        return peeked
      },
    }
    const racing = new ShopAccountService(db, racingTokens)

    // peek → (konto powstaje) → lookup widzi konto → login_required
    expect(await racing.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })).toEqual({
      result: 'login_required',
    })
    expect(await db.select().from(users)).toHaveLength(1)
    expect(await tokenUsedAt(raw)).toBeNull()
    expect((await orderRow(o.id)).userId).toBeNull()
  })

  it('account created after the lookup, before create → login_required via account_exists', async () => {
    const o = await order()
    const raw = await tokens.createAccountToken(EMAIL)
    const spy = vi.spyOn(service, 'createAccountFromToken')
    spy.mockImplementationOnce(async (...args) => {
      await createUser(db, { email: EMAIL, role: 'patient' })
      spy.mockRestore()
      return service.createAccountFromToken(...args)
    })

    expect(await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })).toEqual({
      result: 'login_required',
    })
    expect(await db.select().from(users)).toHaveLength(1)
    expect(await tokenUsedAt(raw)).toBeNull()
    expect((await orderRow(o.id)).userId).toBeNull()
  })

  it('token consumed concurrently between peek and create → invalid', async () => {
    await order()
    const raw = await tokens.createAccountToken(EMAIL)
    const spy = vi.spyOn(service, 'createAccountFromToken')
    spy.mockImplementationOnce(async (...args) => {
      await tokens.consumeAccountToken(raw)
      spy.mockRestore()
      return service.createAccountFromToken(...args)
    })

    expect(await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })).toEqual({
      result: 'invalid',
    })
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('logs never contain e-mail, password hash or raw token', async () => {
    await createUser(db, { email: 'ola@example.com', role: 'customer' })
    await order()
    const raw = await tokens.createAccountToken(EMAIL)
    const sessionRaw = await tokens.createAccountToken('ola@example.com')

    await service.handleAccountToken(raw, { sessionUser: null })
    await service.handleAccountToken(sessionRaw, { sessionUser: null })
    await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })
    await service.handleAccountToken(raw, { sessionUser: null, passwordHash: CLIENT_HASH })
    // wymuszony błąd DB w ścieżce logowania błędów
    await expect(service.attachOrdersByEmail('not-a-uuid', EMAIL)).rejects.toThrow()

    const logs = allLogs()
    for (const secret of [EMAIL, 'ola@example.com', CLIENT_HASH, raw, sessionRaw]) {
      expect(logs).not.toContain(secret)
    }
  })
})
