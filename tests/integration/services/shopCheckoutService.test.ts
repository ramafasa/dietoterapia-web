/**
 * Integration Tests: Shop Checkout Service – quoteCart + createOrder (sklep)
 *
 * Real PostgreSQL via Testcontainers. Tpay is injected as a mock.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import type { Database } from '@/db'
import { products, shopOrderItems, shopOrders, transactions, users } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createProduct, createPaidOrder } from '../../fixtures/shop'
import { createUser } from '../../helpers/fixtures'
import {
  ShopCheckoutService,
  type CreateOrderInput,
  type ShopTpayClient,
} from '@/lib/services/shopCheckoutService'
import { hashToken } from '@/lib/crypto'
import {
  DIGITAL_CONTENT_CONSENT_TEXT,
  SHOP_TERMS_VERSION,
  SHOP_TRANSACTION_ITEM,
} from '@/lib/shop/constants'

let db: Database

beforeAll(async () => {
  const result = await startTestDatabase()
  db = result.db
})

afterAll(async () => {
  await stopTestDatabase()
})

beforeEach(async () => {
  await cleanDatabase(db)
})

describe('Integration: ShopCheckoutService.quoteCart', () => {
  let service: ShopCheckoutService

  beforeAll(() => {
    service = new ShopCheckoutService(db)
  })

  it('returns authoritative items with productId, slug, title and price', async () => {
    const product = await createProduct(db, { slug: 'a', title: 'Ebook A', price: '29.00' })

    const quote = await service.quoteCart(['a'])

    expect(quote).toEqual({
      items: [{ productId: product.id, slug: 'a', title: 'Ebook A', price: '29.00' }],
      removedSlugs: [],
      total: '29.00',
    })
  })

  it('collapses duplicates and preserves first-seen order', async () => {
    await createProduct(db, { slug: 'a' })
    await createProduct(db, { slug: 'b' })
    await createProduct(db, { slug: 'c' })

    const quote = await service.quoteCart(['c', 'a', 'c', 'b', 'a'])

    expect(quote.items.map((i) => i.slug)).toEqual(['c', 'a', 'b'])
    expect(quote.removedSlugs).toEqual([])
  })

  it('reports missing, draft and archived products in removedSlugs (in input order)', async () => {
    await createProduct(db, { slug: 'active' })
    await createProduct(db, { slug: 'draft', status: 'draft' })
    await createProduct(db, { slug: 'archived', status: 'archived' })

    const quote = await service.quoteCart(['draft', 'active', 'missing', 'archived', 'missing'])

    expect(quote.items.map((i) => i.slug)).toEqual(['active'])
    expect(quote.removedSlugs).toEqual(['draft', 'missing', 'archived'])
  })

  it('sums prices exactly (29.00 + 19.99 = 48.99)', async () => {
    await createProduct(db, { slug: 'a', price: '29.00' })
    await createProduct(db, { slug: 'b', price: '19.99' })

    const quote = await service.quoteCart(['a', 'b'])

    expect(quote.total).toBe('48.99')
  })

  it('returns an empty quote with total 0.00 for an empty cart', async () => {
    expect(await service.quoteCart([])).toEqual({ items: [], removedSlugs: [], total: '0.00' })
  })

  it('returns total 0.00 when every slug was removed', async () => {
    const quote = await service.quoteCart(['missing'])
    expect(quote).toEqual({ items: [], removedSlugs: ['missing'], total: '0.00' })
  })

  it('considers at most 20 unique slugs', async () => {
    const slugs = Array.from({ length: 25 }, (_, i) => `p-${i}`)
    for (const slug of slugs) await createProduct(db, { slug, price: '1.00' })

    const quote = await service.quoteCart(slugs)

    expect(quote.items.map((i) => i.slug)).toEqual(slugs.slice(0, 20))
    expect(quote.removedSlugs).toEqual([])
    expect(quote.total).toBe('20.00')
  })

  it('applies the 20 limit after collapsing duplicates', async () => {
    const slugs = Array.from({ length: 21 }, (_, i) => `p-${i}`)
    for (const slug of slugs) await createProduct(db, { slug, price: '1.00' })

    const quote = await service.quoteCart([slugs[0], slugs[0], ...slugs.slice(1)])

    expect(quote.items).toHaveLength(20)
    expect(quote.items.at(-1)?.slug).toBe('p-19')
  })
})

// SHA-256 of "test" – what the browser sends as the password hash
const CLIENT_PASSWORD_HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
const SITE_URL = 'https://sklep.test'

describe('Integration: ShopCheckoutService.createOrder', () => {
  let tpay: { createTransaction: ReturnType<typeof vi.fn> }
  let service: ShopCheckoutService
  const originalSiteUrl = process.env.SITE_URL

  beforeAll(() => {
    process.env.SITE_URL = SITE_URL
  })

  afterAll(() => {
    if (originalSiteUrl === undefined) delete process.env.SITE_URL
    else process.env.SITE_URL = originalSiteUrl
  })

  beforeEach(() => {
    let call = 0
    tpay = {
      // tpay_transaction_id jest unikalne – każde wywołanie dostaje własny identyfikator
      createTransaction: vi.fn().mockImplementation(async () => {
        const id = call++ === 0 ? 'TR-TEST-123' : `TR-TEST-123-${call}`
        return { transactionId: id, paymentUrl: `https://secure.sandbox.tpay.com/?title=${id}` }
      }),
    }
    service = new ShopCheckoutService(db, undefined, tpay as unknown as ShopTpayClient)
  })

  function input(overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
    return {
      slugs: ['proteinowa-piekarnia'],
      email: 'anna@example.com',
      firstName: 'Anna',
      acceptTerms: true,
      acceptDigitalContent: true,
      ...overrides,
    }
  }

  async function countRows() {
    const [o, i, t] = await Promise.all([
      db.select().from(shopOrders),
      db.select().from(shopOrderItems),
      db.select().from(transactions),
    ])
    return { orders: o.length, items: i.length, transactions: t.length }
  }

  it('creates a pending order, its items and a pending shop transaction, then initiates Tpay', async () => {
    const a = await createProduct(db, { slug: 'a', title: 'Ebook A', price: '29.00' })
    const b = await createProduct(db, { slug: 'b', title: 'Ebook B', price: '19.99' })

    const result = await service.createOrder(input({ slugs: ['a', 'b'] }))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.redirectUrl).toBe('https://secure.sandbox.tpay.com/?title=TR-TEST-123')

    const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, result.orderId))
    expect(order).toMatchObject({
      status: 'pending',
      email: 'anna@example.com',
      firstName: 'Anna',
      userId: null,
      totalAmount: '48.99',
      invoiceRequested: false,
    })

    const items = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id))
    expect(items.map((i) => ({ productId: i.productId, title: i.titleSnapshot, price: i.unitPrice }))).toEqual(
      expect.arrayContaining([
        { productId: a.id, title: 'Ebook A', price: '29.00' },
        { productId: b.id, title: 'Ebook B', price: '19.99' },
      ])
    )
    expect(items).toHaveLength(2)

    const [tx] = await db.select().from(transactions).where(eq(transactions.shopOrderId, order.id))
    expect(tx).toMatchObject({
      userId: null,
      item: SHOP_TRANSACTION_ITEM,
      amount: '48.99',
      status: 'pending',
      tpayTitle: `Zamówienie ${order.orderNumber}`,
      payerEmail: 'anna@example.com',
      payerName: 'Anna',
      tpayTransactionId: 'TR-TEST-123',
    })

    expect(tpay.createTransaction).toHaveBeenCalledTimes(1)
    expect(tpay.createTransaction).toHaveBeenCalledWith({
      amount: 48.99,
      description: `Zamówienie ${order.orderNumber}`,
      payerEmail: 'anna@example.com',
      payerName: 'Anna',
      successUrl: `${SITE_URL}/sklep/platnosc/sukces?order=${order.id}`,
      errorUrl: `${SITE_URL}/sklep/platnosc/blad?order=${order.id}`,
      notificationUrl: `${SITE_URL}/api/sklep/platnosc/callback`,
      crc: tx.id,
    })
  })

  it('assigns increasing order numbers in the ZAM-YYYY-NNNNN format', async () => {
    await createProduct(db)

    const first = await service.createOrder(input())
    const second = await service.createOrder(input())
    if (!first.ok || !second.ok) throw new Error('expected ok')

    const rows = await db.select().from(shopOrders)
    const byId = new Map(rows.map((r) => [r.id, r.orderNumber]))
    const n1 = byId.get(first.orderId)!
    const n2 = byId.get(second.orderId)!
    expect(n1).toMatch(/^ZAM-\d{4}-\d{5,}$/)
    expect(n2).toMatch(/^ZAM-\d{4}-\d{5,}$/)
    expect(Number(n2.split('-')[2])).toBeGreaterThan(Number(n1.split('-')[2]))
  })

  it('takes prices from the database, not from the client', async () => {
    const product = await createProduct(db, { price: '29.00' })
    await db.update(products).set({ price: '39.50' }).where(eq(products.id, product.id))

    const result = await service.createOrder(input())
    if (!result.ok) throw new Error('expected ok')

    const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, result.orderId))
    const [item] = await db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id))
    expect(order.totalAmount).toBe('39.50')
    expect(item.unitPrice).toBe('39.50')
    expect(tpay.createTransaction.mock.calls[0][0].amount).toBe(39.5)
  })

  it('returns CART_CHANGED with removedSlugs for an archived product and creates nothing', async () => {
    await createProduct(db, { slug: 'a' })
    await createProduct(db, { slug: 'old', status: 'archived' })

    const result = await service.createOrder(input({ slugs: ['a', 'old'] }))

    expect(result).toMatchObject({ ok: false, code: 'CART_CHANGED', removedSlugs: ['old'] })
    expect(await countRows()).toEqual({ orders: 0, items: 0, transactions: 0 })
    expect(tpay.createTransaction).not.toHaveBeenCalled()
  })

  it('returns EMPTY_CART for an empty cart', async () => {
    const result = await service.createOrder(input({ slugs: [] }))

    expect(result).toMatchObject({ ok: false, code: 'EMPTY_CART' })
    expect(await countRows()).toEqual({ orders: 0, items: 0, transactions: 0 })
  })

  it('returns ACCOUNT_EXISTS when creating an account for an e-mail that has one, creating nothing', async () => {
    await createProduct(db)
    await createUser(db, { email: 'anna@example.com', role: 'customer' })

    const result = await service.createOrder(input({ createAccountPasswordHash: CLIENT_PASSWORD_HASH }))

    expect(result).toMatchObject({ ok: false, code: 'ACCOUNT_EXISTS', message: 'Masz już konto – zaloguj się' })
    expect(await countRows()).toEqual({ orders: 0, items: 0, transactions: 0 })
    expect(await db.select().from(users)).toHaveLength(1)
    expect(tpay.createTransaction).not.toHaveBeenCalled()
  })

  it('creates an unverified customer account (bcrypt over the client hash) without linking it to the order', async () => {
    await createProduct(db)

    const result = await service.createOrder(
      input({ email: 'nowa@example.com', firstName: 'Ola', createAccountPasswordHash: CLIENT_PASSWORD_HASH })
    )
    if (!result.ok) throw new Error('expected ok')

    const [user] = await db.select().from(users).where(eq(users.email, 'nowa@example.com'))
    expect(user).toMatchObject({ role: 'customer', status: 'active', emailVerifiedAt: null, firstName: 'Ola' })
    expect(user.passwordHash).not.toBe(CLIENT_PASSWORD_HASH)
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/)
    expect(await bcrypt.compare(CLIENT_PASSWORD_HASH, user.passwordHash)).toBe(true)

    const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, result.orderId))
    expect(order.userId).toBeNull()
    const [tx] = await db.select().from(transactions).where(eq(transactions.shopOrderId, order.id))
    expect(tx.userId).toBeNull()
  })

  it('logged in: uses the session e-mail and links the order and transaction to the user', async () => {
    await createProduct(db)
    const user = await createUser(db, { email: 'konto@example.com', role: 'customer' })

    const result = await service.createOrder(
      input({
        email: 'inny@example.com',
        sessionUser: { id: user.id, email: 'Konto@Example.com' },
        createAccountPasswordHash: CLIENT_PASSWORD_HASH, // ignorowane przy zalogowanej sesji
      })
    )
    if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result)}`)

    const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, result.orderId))
    expect(order.email).toBe('konto@example.com')
    expect(order.userId).toBe(user.id)
    const [tx] = await db.select().from(transactions).where(eq(transactions.shopOrderId, order.id))
    expect(tx.userId).toBe(user.id)
    expect(tx.payerEmail).toBe('konto@example.com')
    expect(tpay.createTransaction.mock.calls[0][0].payerEmail).toBe('konto@example.com')
    expect(await db.select().from(users)).toHaveLength(1)
  })

  it('logged in: returns ALREADY_OWNED when a product is in a paid order of that user', async () => {
    const product = await createProduct(db)
    const user = await createUser(db, { email: 'konto@example.com', role: 'customer' })
    await createPaidOrder(db, { email: 'konto@example.com', userId: user.id, productIds: [product.id] })

    const result = await service.createOrder(input({ sessionUser: { id: user.id, email: user.email } }))

    expect(result).toMatchObject({
      ok: false,
      code: 'ALREADY_OWNED',
      message: expect.stringContaining('/konto/zakupy'),
    })
    expect(await countRows()).toMatchObject({ orders: 1, transactions: 0 })
  })

  it('guest: is not blocked by an earlier paid order for the same e-mail', async () => {
    const product = await createProduct(db)
    await createPaidOrder(db, { email: 'anna@example.com', productIds: [product.id] })

    const result = await service.createOrder(input())

    expect(result.ok).toBe(true)
  })

  it('marks order and transaction failed and returns PAYMENT_INIT_FAILED when Tpay throws', async () => {
    await createProduct(db)
    tpay.createTransaction.mockRejectedValueOnce(new Error('Tpay API error: 500'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await service.createOrder(input())

    errorSpy.mockRestore()
    expect(result).toMatchObject({ ok: false, code: 'PAYMENT_INIT_FAILED' })
    const [order] = await db.select().from(shopOrders)
    const [tx] = await db.select().from(transactions)
    expect(order.status).toBe('failed')
    expect(tx.status).toBe('failed')
    expect(tx.completedAt).not.toBeNull()
    expect(tx.tpayTransactionId).toBeNull()
  })

  it('persists consents, invoice data and only the hash of the checkout secret', async () => {
    await createProduct(db)
    const now = new Date('2026-11-05T12:00:00Z')

    const result = await service.createOrder(
      input({ invoice: { companyName: 'Firma Sp. z o.o.', nip: '1234567890', address: 'ul. Zdrowa 1, 00-001 Warszawa' } }),
      now
    )
    if (!result.ok) throw new Error('expected ok')

    const [order] = await db.select().from(shopOrders).where(eq(shopOrders.id, result.orderId))
    expect(order).toMatchObject({
      termsVersion: SHOP_TERMS_VERSION,
      termsAcceptedAt: now,
      digitalContentConsentAt: now,
      digitalContentConsentText: DIGITAL_CONTENT_CONSENT_TEXT,
      invoiceRequested: true,
      invoiceCompanyName: 'Firma Sp. z o.o.',
      invoiceNip: '1234567890',
      invoiceAddress: 'ul. Zdrowa 1, 00-001 Warszawa',
    })
    expect(order.orderNumber).toMatch(/^ZAM-2026-/)
    expect(result.checkoutSecret).toMatch(/^[0-9a-f]{64}$/)
    expect(order.checkoutSecretHash).toBe(await hashToken(result.checkoutSecret))
    expect(order.checkoutSecretHash).not.toBe(result.checkoutSecret)
  })
})
