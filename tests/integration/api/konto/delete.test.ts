/**
 * Integration Tests: POST /api/konto/delete (Task 6.5) – usunięcie konta `customer`.
 *
 * Real PostgreSQL via Testcontainers. Konto zakładane prawdziwym flow (ShopAccountService.createAccountFromToken),
 * więc w audit_log jest wpis `create users` z e-mailem (source: 'shop_account_link').
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { eq, or, sql } from 'drizzle-orm'
import { POST } from '@/pages/api/konto/delete'
import { lucia as defaultLucia } from '@/lib/auth'
import { ShopAccountService } from '@/lib/services/shopAccountService'
import { ShopResendService } from '@/lib/services/shopResendService'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import {
  auditLog,
  consents,
  events,
  invitations,
  loginAttempts,
  passwordResetTokens,
  sessions,
  shopOrders,
  transactions,
  users,
} from '@/db/schema'
import type { Database } from '@/db'
import { createMockAPIContext } from '../../../helpers/api-helper'
import { createMockAuthContext } from '../../../helpers/auth-helper'
import { startTestDatabase, stopTestDatabase, cleanDatabase, getTestDatabase } from '../../../helpers/db-container'
import { createUser, createSession, createPasswordResetToken, createConsent, createEvent } from '../../../helpers/fixtures'
import { createPaidOrder, createProduct } from '../../../fixtures/shop'

const testDb = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/db', () => ({
  get db() {
    return testDb.current
  },
}))

const EMAIL = 'anna@example.com'
const PASSWORD_HASH = 'ab'.repeat(32)

type SessionUser = { id: string; email: string; role: string } | null

function cookieJar() {
  return { get: () => undefined, set: vi.fn(), delete: vi.fn(), has: () => false }
}

async function call(
  body: unknown,
  user: SessionUser,
  cookies = cookieJar(),
  contentType: string | null = 'application/json'
) {
  const url = 'http://localhost/api/konto/delete'
  const request = new Request(url, {
    method: 'POST',
    headers: contentType ? { 'Content-Type': contentType } : {},
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  const response = await POST(
    createMockAPIContext({ request, url, cookies, locals: createMockAuthContext({ user }) })
  )
  const text = await response.text()
  return { response, text, json: JSON.parse(text), cookies }
}

describe('POST /api/konto/delete (test DB)', () => {
  let db: Database

  beforeAll(async () => {
    testDb.current = (await startTestDatabase()).db
    db = getTestDatabase()
  })

  afterAll(async () => {
    testDb.current = undefined
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(db)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** Paid guest order + shop transaction, then a customer account via the real account-link flow. */
  async function customerWithPurchase() {
    const product = await createProduct(db)
    const { order } = await createPaidOrder(db, { email: EMAIL, productIds: [product.id], firstName: 'Anna' })
    const token = await new ShopTokenService(db).createAccountToken(EMAIL)
    const created = await new ShopAccountService(db).createAccountFromToken(token, PASSWORD_HASH)
    if (created.ok !== true) throw new Error('account not created')
    const userId = created.userId

    const [transaction] = await db
      .insert(transactions)
      .values({
        userId,
        shopOrderId: order.id,
        item: 'SHOP_ORDER',
        amount: order.totalAmount,
        status: 'success',
        tpayTitle: order.orderNumber,
        payerEmail: EMAIL,
      })
      .returning()

    const session = await createSession(db, userId)
    await createSession(db, userId)
    await createPasswordResetToken(db, userId)
    await createConsent(db, userId)
    const event = await createEvent(db, userId, 'login_success', { ip: '203.0.113.7', userAgent: 'UA', source: 'x' })
    await db.insert(loginAttempts).values({ email: EMAIL, success: true })
    await db.insert(loginAttempts).values({ email: 'ola@example.com', success: true })

    const sessionUser = { id: userId, email: EMAIL, role: 'customer' }
    return { userId, order, transaction, session, event, sessionUser }
  }

  async function auditRowsFor(userId: string) {
    return db
      .select()
      .from(auditLog)
      .where(or(eq(auditLog.recordId, userId), eq(auditLog.userId, userId)))
  }

  it('customer deletes the account: user + sessions gone, purchases kept without user_id, audit scrubbed', async () => {
    const { userId, order, transaction, event, sessionUser } = await customerWithPurchase()

    // non-object jsonb (array) is left as is by the scrub (guard jsonb_typeof = 'object')
    const [arrayEntry] = await db
      .insert(auditLog)
      .values({ action: 'update', tableName: 'users', recordId: userId, before: ['email', 'x'], after: 'scalar' })
      .returning()

    // sanity: create entry with the e-mail exists before deletion
    const before = await auditRowsFor(userId)
    expect(JSON.stringify(before)).toContain(EMAIL)

    const { response, json, text, cookies } = await call({ email: '  Anna@Example.COM ' }, sessionUser)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(json).toEqual({ data: { deleted: true, redirectTo: '/' }, error: null })
    expect(text).not.toContain(EMAIL)

    // session cookie cleared (blank Lucia cookie)
    expect(cookies.set).toHaveBeenCalledTimes(1)
    const [name, value] = cookies.set.mock.calls[0]
    expect(name).toBe(defaultLucia.sessionCookieName)
    expect(value).toBe('')

    expect(await db.select().from(users).where(eq(users.id, userId))).toEqual([])
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toEqual([])
    expect(await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, userId))).toEqual([])
    expect(await db.select().from(consents).where(eq(consents.userId, userId))).toEqual([])

    const [keptOrder] = await db.select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(keptOrder.userId).toBeNull()
    expect(keptOrder.status).toBe('paid')
    expect(keptOrder.email).toBe(EMAIL)
    const [keptTransaction] = await db.select().from(transactions).where(eq(transactions.id, transaction.id))
    expect(keptTransaction.userId).toBeNull()
    expect(keptTransaction.shopOrderId).toBe(order.id)

    const [keptEvent] = await db.select().from(events).where(eq(events.id, event.id))
    expect(keptEvent.userId).toBeNull()
    expect(keptEvent.eventType).toBe('login_success')
    expect(keptEvent.properties).toEqual({ source: 'x' })

    const attempts = await db.select().from(loginAttempts)
    expect(attempts.map((a) => a.email)).toEqual(['ola@example.com'])

    const audit = await auditRowsFor(userId)
    expect(JSON.stringify(audit)).not.toContain(EMAIL)
    expect(audit.every((row) => row.userId === null)).toBe(true)
    const createEntry = audit.find((row) => row.action === 'create')
    expect(createEntry?.after).toMatchObject({ id: userId, role: 'customer', source: 'shop_account_link' })
    expect(createEntry?.after).not.toHaveProperty('email')
    const keptArrayEntry = audit.find((row) => row.id === arrayEntry.id)
    expect(keptArrayEntry?.before).toEqual(['email', 'x'])
    expect(keptArrayEntry?.after).toBe('scalar')
    const deleteEntry = audit.find((row) => row.action === 'delete')
    expect(deleteEntry).toMatchObject({ tableName: 'users', recordId: userId, userId: null })
  })

  it('wrong e-mail → 400, nothing changes', async () => {
    const { userId, order, sessionUser } = await customerWithPurchase()
    const auditBefore = await auditRowsFor(userId)

    for (const body of [{ email: 'ola@example.com' }, { email: '' }, {}, 'not json']) {
      const { response, json, cookies } = await call(body, sessionUser)
      expect(response.status).toBe(400)
      expect(json.error.code).toBe('validation_error')
      expect(cookies.set).not.toHaveBeenCalled()
    }

    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1)
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(2)
    const [keptOrder] = await db.select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(keptOrder.userId).toBe(userId)
    expect(await auditRowsFor(userId)).toEqual(auditBefore)
  })

  it('Content-Type other than application/json → 415, nothing changes', async () => {
    const { userId, sessionUser } = await customerWithPurchase()
    for (const contentType of ['application/x-www-form-urlencoded', 'text/plain', null]) {
      const { response, json } = await call({ email: EMAIL }, sessionUser, cookieJar(), contentType)
      expect(response.status).toBe(415)
      expect(json.error.code).toBe('unsupported_media_type')
    }
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1)
    // charset parameter is fine
    const ok = await call({ email: EMAIL }, sessionUser, cookieJar(), 'application/json; charset=utf-8')
    expect(ok.response.status).toBe(200)
  })

  it('patient / dietitian → 403, account kept', async () => {
    for (const role of ['patient', 'dietitian'] as const) {
      const email = `${role}@example.com`
      const user = await createUser(db, { email, role })
      const { response, json } = await call({ email }, { id: user.id, email, role })
      expect(response.status).toBe(403)
      expect(json.error.code).toBe('forbidden')
      expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1)
    }
  })

  it('role is re-checked in the DB (stale session says customer, row is patient) → 403', async () => {
    const user = await createUser(db, { email: 'pacjentka@example.com', role: 'patient' })
    const { response } = await call(
      { email: 'pacjentka@example.com' },
      { id: user.id, email: 'pacjentka@example.com', role: 'customer' }
    )
    expect(response.status).toBe(403)
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(1)
  })

  it('guest → 401', async () => {
    const { response, json } = await call({ email: EMAIL }, null)
    expect(response.status).toBe(401)
    expect(json.error.code).toBe('unauthorized')
  })

  it('account already gone (double click) → 401 + cookie cleared', async () => {
    const { sessionUser } = await customerWithPurchase()
    expect((await call({ email: EMAIL }, sessionUser)).response.status).toBe(200)
    const second = await call({ email: EMAIL }, sessionUser)
    expect(second.response.status).toBe(401)
    expect(second.cookies.set).toHaveBeenCalledTimes(1)
  })

  it('customer with a PZK transaction (no shop order) → 409, nothing changes', async () => {
    const { userId, sessionUser } = await customerWithPurchase()
    await db.insert(transactions).values({
      userId,
      item: 'PZK_MODULE_1',
      amount: '349.00',
      status: 'success',
      tpayTitle: 'PZK Moduł 1',
      payerEmail: EMAIL,
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { response, json } = await call({ email: EMAIL }, sessionUser)

    expect(response.status).toBe(409)
    expect(json.error.code).toBe('conflict')
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1)
    expect(await db.select().from(transactions).where(eq(transactions.userId, userId))).toHaveLength(2)
    expect(JSON.stringify(await auditRowsFor(userId))).toContain(EMAIL)
    expect(errorSpy).toHaveBeenCalledWith(
      '[AccountDeletionService] Account not deleted – non-shop transaction:',
      expect.objectContaining({ userId, constraint: 'chk_transactions_owner' })
    )
  })

  it('customer referenced by invitations.created_by → 409 (known FK), nothing changes, logged with constraint', async () => {
    const { userId, order, sessionUser } = await customerWithPurchase()
    await db.insert(invitations).values({
      email: 'zaproszona@example.com',
      tokenHash: 'f'.repeat(64),
      createdBy: userId,
      expiresAt: new Date(Date.now() + 86400e3),
    })
    const auditBefore = await auditRowsFor(userId)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const { response, json, cookies } = await call({ email: EMAIL }, sessionUser)

    expect(response.status).toBe(409)
    expect(json.error.code).toBe('conflict')
    expect(cookies.set).not.toHaveBeenCalled()
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1)
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toHaveLength(2)
    const [keptOrder] = await db.select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(keptOrder.userId).toBe(userId)
    expect(await auditRowsFor(userId)).toEqual(auditBefore)
    expect(errorSpy).toHaveBeenCalledWith(
      '[AccountDeletionService] Account not deleted – blocked by constraint:',
      expect.objectContaining({ userId, constraint: 'invitations_created_by_users_id_fk', code: '23503' })
    )
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(EMAIL)
  })

  it('unexpected DB error (unknown constraint) → 500, nothing changes', async () => {
    const { userId, sessionUser } = await customerWithPurchase()
    await db.execute(sql`
      create or replace function test_block_user_delete() returns trigger language plpgsql as $$
      begin
        raise exception 'blocked' using errcode = '23503', constraint = 'some_other_fk';
      end $$`)
    await db.execute(sql`create trigger test_block_user_delete before delete on users for each row execute function test_block_user_delete()`)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { response, json } = await call({ email: EMAIL }, sessionUser)
      expect(response.status).toBe(500)
      expect(json.error.code).toBe('internal_server_error')
      expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1)
      expect(JSON.stringify(await auditRowsFor(userId))).toContain(EMAIL)
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(EMAIL)
    } finally {
      await db.execute(sql`drop trigger if exists test_block_user_delete on users`)
      await db.execute(sql`drop function if exists test_block_user_delete()`)
    }
  })

  it('after deletion „Wyślij link ponownie” still finds the paid orders by e-mail (create link)', async () => {
    const { order, sessionUser } = await customerWithPurchase()
    await call({ email: EMAIL }, sessionUser)

    const sendDownloadLinks = vi.fn(async () => true)
    const result = await new ShopResendService(db, { mailer: { sendDownloadLinks } }).resend(EMAIL)

    expect(result).toEqual({ sent: true })
    expect(sendDownloadLinks).toHaveBeenCalledTimes(1)
    const [to, downloads, accountLink] = sendDownloadLinks.mock.calls[0] as unknown as [
      string,
      { order: { id: string } }[],
      { kind: string },
    ]
    expect(to).toBe(EMAIL)
    expect(downloads.map((d) => d.order.id)).toEqual([order.id])
    expect(accountLink.kind).toBe('create')
  })

  it('after deletion a new account link creates a fresh account for the same e-mail', async () => {
    const { userId, order, sessionUser } = await customerWithPurchase()
    await call({ email: EMAIL }, sessionUser)

    const token = await new ShopTokenService(db).createAccountToken(EMAIL)
    const outcome = await new ShopAccountService(db).handleAccountToken(token, {
      sessionUser: null,
      passwordHash: PASSWORD_HASH,
    })

    expect(outcome.result).toBe('created_and_logged_in')
    const [fresh] = await db.select().from(users).where(eq(users.email, EMAIL))
    expect(fresh.id).not.toBe(userId)
    expect(fresh.role).toBe('customer')
    const [reattached] = await db.select().from(shopOrders).where(eq(shopOrders.id, order.id))
    expect(reattached.userId).toBe(fresh.id)
  })
})
