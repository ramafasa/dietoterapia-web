/**
 * Integration Tests: ShopPaymentService.processNotification – webhook Tpay sklepu
 *
 * Real PostgreSQL via Testcontainers. Tpay (JWS) i mailer wstrzykiwane w konstruktorze; ostatni blok
 * – domyślny mailer (prawdziwy ShopMailService), zamockowany tylko transport nodemailer.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database } from '@/db'
import { events, shopDownloadTokens, shopOrders, transactions } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createUser } from '../../helpers/fixtures'
import { createProduct, createPaidOrder } from '../../fixtures/shop'
import {
  ShopPaymentService,
  ShopWebhookError,
  type ShopPaymentNotification,
} from '@/lib/services/shopPaymentService'
import type { ShopMailer } from '@/lib/shop/mailer'
import type { TpayService } from '@/lib/services/tpayService'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { SHOP_TRANSACTION_ITEM } from '@/lib/shop/constants'

const sendMail = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }))

const NOW = new Date('2026-11-05T12:00:00Z')
const HOUR_MS = 60 * 60 * 1000

let db: Database
let tpay: { verifyWebhookSignature: Mock<TpayService['verifyWebhookSignature']> }
let mailer: { [K in keyof ShopMailer]: ReturnType<typeof vi.fn> }
let service: ShopPaymentService

beforeAll(async () => {
  const result = await startTestDatabase()
  db = result.db
})

afterAll(async () => {
  await stopTestDatabase()
})

beforeEach(async () => {
  await cleanDatabase(db)
  tpay = { verifyWebhookSignature: vi.fn<TpayService['verifyWebhookSignature']>().mockResolvedValue(true) }
  mailer = {
    sendOrderConfirmation: vi.fn().mockResolvedValue(true),
    notifyOwner: vi.fn().mockResolvedValue(undefined),
    notifyOwnerAmountMismatch: vi.fn().mockResolvedValue(undefined),
    notifyCustomerLatePayment: vi.fn().mockResolvedValue(true),
    notifyOwnerLatePayment: vi.fn().mockResolvedValue(true),
    notifyOwnerUnexpectedPayment: vi.fn().mockResolvedValue(undefined),
    notifyOwnerUnknownPayment: vi.fn().mockResolvedValue(undefined),
    sendAccountLink: vi.fn().mockResolvedValue(true),
    sendDownloadLinks: vi.fn().mockResolvedValue(true),
  }
  service = new ShopPaymentService(db, { tpay, mailer: mailer as unknown as ShopMailer, now: () => NOW })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Zamówienie + transakcja tak, jak zostawia je checkout (pending, id Tpay już zapisane). */
async function pendingOrder(
  opts: {
    orderStatus?: string
    trxStatus?: string
    userId?: string | null
    accountRequested?: boolean
    createdAt?: Date
  } = {}
) {
  const product = await createProduct(db)
  const { order, items } = await createPaidOrder(db, {
    email: 'anna@example.com',
    productIds: [product.id],
    userId: opts.userId ?? null,
    status: opts.orderStatus ?? 'pending',
    paidAt: null,
    confirmationSentAt: null,
    accountRequested: opts.accountRequested ?? false,
    createdAt: opts.createdAt ?? new Date(NOW.getTime() - HOUR_MS), // świeże zamówienie (< 24 h)
  })
  const [trx] = await db
    .insert(transactions)
    .values({
      userId: opts.userId ?? null,
      shopOrderId: order.id,
      item: SHOP_TRANSACTION_ITEM,
      amount: order.totalAmount,
      status: opts.trxStatus ?? 'pending',
      tpayTransactionId: 'TPAY-INIT-1',
      tpayTitle: `Zamówienie ${order.orderNumber}`,
      payerEmail: order.email,
    })
    .returning()
  return { order, items, trx }
}

function notification(transactionId: string, overrides: Partial<ShopPaymentNotification> = {}): ShopPaymentNotification {
  return {
    transactionId,
    tpayTransactionId: 'TR-ABC-123',
    isSuccess: true,
    amount: '29.00',
    signature: 'header.payload.signature',
    rawBody: 'tr_status=TRUE',
    ...overrides,
  }
}

async function getOrder(id: string) {
  const [row] = await db.select().from(shopOrders).where(eq(shopOrders.id, id))
  return row
}

async function getTrx(id: string) {
  const [row] = await db.select().from(transactions).where(eq(transactions.id, id))
  return row
}

describe('Integration: ShopPaymentService.processNotification', () => {
  it('invalid signature: throws, nothing changes', async () => {
    const { order, trx } = await pendingOrder()
    tpay.verifyWebhookSignature.mockResolvedValue(false)

    await expect(service.processNotification(notification(trx.id))).rejects.toMatchObject({
      code: 'invalid_signature',
    })

    expect(tpay.verifyWebhookSignature).toHaveBeenCalledWith('header.payload.signature', 'tr_status=TRUE')
    expect((await getOrder(order.id)).status).toBe('pending')
    expect((await getTrx(trx.id)).status).toBe('pending')
    expect(await db.select().from(shopDownloadTokens)).toHaveLength(0)
    expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
  })

  it('PZK transaction (no shopOrderId) with valid signature → unknown_transaction, untouched, owner alerted', async () => {
    const patient = await createUser(db, { email: 'p@example.com' })
    const [pzk] = await db
      .insert(transactions)
      .values({
        userId: patient.id,
        item: 'PZK_MODULE_1',
        amount: '349.00',
        status: 'pending',
        tpayTitle: 'PZK Moduł 1',
        payerEmail: 'p@example.com',
      })
      .returning()

    const result = await service.processNotification(notification(pzk.id, { amount: '349.00' }))

    expect(result).toEqual({ outcome: 'unknown_transaction', orderId: null })
    expect((await getTrx(pzk.id)).status).toBe('pending')
    expect(mailer.notifyOwnerUnknownPayment).toHaveBeenCalledWith({
      trCrc: pzk.id,
      tpayTransactionId: 'TR-ABC-123',
      amount: '349.00',
    })
  })

  it('unknown / non-UUID transaction → unknown_transaction; tr_crc truncated to 64 chars; alert only on success', async () => {
    const unknown = await service.processNotification(notification('11111111-1111-4111-8111-111111111111'))
    expect(unknown).toEqual({ outcome: 'unknown_transaction', orderId: null })

    const long = 'x'.repeat(500)
    expect((await service.processNotification(notification(long))).outcome).toBe('unknown_transaction')
    expect(mailer.notifyOwnerUnknownPayment).toHaveBeenCalledTimes(2)
    expect(mailer.notifyOwnerUnknownPayment.mock.calls[1][0].trCrc.length).toBeLessThanOrEqual(65)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(long)

    await service.processNotification(notification('not-a-uuid', { isSuccess: false }))
    expect(mailer.notifyOwnerUnknownPayment).toHaveBeenCalledTimes(2)
  })

  it('invalid signature log truncates tr_crc', async () => {
    tpay.verifyWebhookSignature.mockResolvedValue(false)
    const long = 'y'.repeat(500)
    await expect(service.processNotification(notification(long))).rejects.toBeInstanceOf(ShopWebhookError)
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(long)
  })

  it('success: order paid, transaction success, 1 download token, mails, confirmationSentAt, event', async () => {
    const { order, items, trx } = await pendingOrder({ accountRequested: true })

    const result = await service.processNotification(notification(trx.id))

    expect(result).toEqual({ outcome: 'paid', orderId: order.id })

    const o = await getOrder(order.id)
    expect(o.status).toBe('paid')
    expect(o.paidAt).toEqual(NOW)
    expect(o.confirmationSentAt).toEqual(NOW)

    const t = await getTrx(trx.id)
    expect(t.status).toBe('success')
    expect(t.tpayTransactionId).toBe('TR-ABC-123')
    expect(t.completedAt).toEqual(NOW)

    const tokens = await db.select().from(shopDownloadTokens)
    expect(tokens).toHaveLength(1)
    expect(tokens[0].orderId).toBe(order.id)

    expect(mailer.sendOrderConfirmation).toHaveBeenCalledTimes(1)
    const [mOrder, mItems, mToken, mLink] = mailer.sendOrderConfirmation.mock.calls[0]
    expect(mOrder).toMatchObject({ id: order.id, status: 'paid', email: 'anna@example.com' })
    expect(mItems.map((i: { id: string }) => i.id)).toEqual(items.map((i) => i.id))
    expect(await new ShopTokenService(db).validateDownloadToken(mToken, NOW)).toEqual({ orderId: order.id })
    expect(mLink).toMatchObject({ kind: 'create', emphasized: true })

    expect(mailer.notifyOwner).toHaveBeenCalledTimes(1)
    expect(mailer.notifyOwner.mock.calls[0][0]).toMatchObject({ id: order.id, status: 'paid' })
    expect(mailer.notifyOwner.mock.calls[0][1]).toHaveLength(1)
    expect(mailer.notifyOwner.mock.calls[0][2]).toEqual({ confirmationSent: true, tpayTransactionId: 'TR-ABC-123' })
    // Mail do właścicielki dopiero po próbie potwierdzenia
    expect(mailer.sendOrderConfirmation.mock.invocationCallOrder[0]).toBeLessThan(
      mailer.notifyOwner.mock.invocationCallOrder[0]
    )
    expect(mailer.notifyCustomerLatePayment).not.toHaveBeenCalled()

    const ev = await db.select().from(events).where(eq(events.eventType, 'shop_order_paid'))
    expect(ev).toHaveLength(1)
    expect(ev[0].properties).toMatchObject({ orderId: order.id, transactionId: trx.id })
  })

  it('logged-in order → accountLink none', async () => {
    const user = await createUser(db, { email: 'anna@example.com', role: 'customer' })
    const { trx } = await pendingOrder({ userId: user.id })

    await service.processNotification(notification(trx.id))

    expect(mailer.sendOrderConfirmation.mock.calls[0][3]).toEqual({ kind: 'none' })
  })

  it.each([
    ['returns false', () => mailer.sendOrderConfirmation.mockResolvedValue(false)],
    ['throws', () => mailer.sendOrderConfirmation.mockRejectedValue(new Error('SMTP down'))],
  ])('confirmation %s: order paid, confirmationSentAt NULL, resolves', async (_label, arrange) => {
    arrange()
    const { order, trx } = await pendingOrder()

    await expect(service.processNotification(notification(trx.id))).resolves.toMatchObject({ outcome: 'paid' })

    const o = await getOrder(order.id)
    expect(o.status).toBe('paid')
    expect(o.confirmationSentAt).toBeNull()
    expect(mailer.notifyOwner).toHaveBeenCalledTimes(1)
    expect(mailer.notifyOwner.mock.calls[0][2]).toMatchObject({ confirmationSent: false })
  })

  it('post-payment failures (token, owner mail) never throw', async () => {
    const { order, trx } = await pendingOrder()
    const failing = new ShopPaymentService(db, {
      tpay,
      mailer: mailer as unknown as ShopMailer,
      tokens: { createDownloadToken: vi.fn().mockRejectedValue(new Error('db')) },
      now: () => NOW,
    })
    mailer.notifyOwner.mockRejectedValue(new Error('smtp'))

    await expect(failing.processNotification(notification(trx.id))).resolves.toMatchObject({ outcome: 'paid' })
    expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
    expect(mailer.notifyOwner.mock.calls[0][2]).toMatchObject({ confirmationSent: false })
    expect((await getOrder(order.id)).confirmationSentAt).toBeNull()
  })

  it('duplicate notification: already_processed, no second token, no second mails', async () => {
    const { order, trx } = await pendingOrder()

    await service.processNotification(notification(trx.id))
    const second = await service.processNotification(notification(trx.id))

    expect(second).toEqual({ outcome: 'already_processed', orderId: order.id })
    expect(await db.select().from(shopDownloadTokens)).toHaveLength(1)
    expect(mailer.sendOrderConfirmation).toHaveBeenCalledTimes(1)
    expect(mailer.notifyOwner).toHaveBeenCalledTimes(1)
  })

  it('concurrent duplicate notifications: exactly one processes', async () => {
    const { trx } = await pendingOrder()

    const results = await Promise.all([
      service.processNotification(notification(trx.id)),
      service.processNotification(notification(trx.id)),
      service.processNotification(notification(trx.id)),
    ])

    expect(results.map((r) => r.outcome).sort()).toEqual(['already_processed', 'already_processed', 'paid'])
    expect(await db.select().from(shopDownloadTokens)).toHaveLength(1)
    expect(mailer.sendOrderConfirmation).toHaveBeenCalledTimes(1)
    expect(mailer.notifyOwner).toHaveBeenCalledTimes(1)
  })

  it.each([['30.00'], ['29,00'], [undefined]])(
    'amount mismatch (%s): order + transaction failed, owner notified once, no customer mail',
    async (amount) => {
      const { order, trx } = await pendingOrder()

      const result = await service.processNotification(notification(trx.id, { amount }))
      const retry = await service.processNotification(notification(trx.id, { amount }))

      expect(result).toEqual({ outcome: 'amount_mismatch', orderId: order.id })
      expect(retry.outcome).toBe('already_processed')
      expect((await getOrder(order.id)).status).toBe('failed')
      expect((await getTrx(trx.id)).status).toBe('failed')
      expect(mailer.notifyOwnerAmountMismatch).toHaveBeenCalledTimes(1)
      expect(mailer.notifyOwnerAmountMismatch.mock.calls[0][1]).toEqual({
        expected: '29.00',
        received: amount ?? '',
        tpayTransactionId: 'TR-ABC-123',
      })
      expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
      expect(mailer.notifyOwner).not.toHaveBeenCalled()
      expect(await db.select().from(shopDownloadTokens)).toHaveLength(0)
    }
  )

  it('equivalent amount format ("29" vs "29.00") is accepted', async () => {
    const { trx } = await pendingOrder()
    expect((await service.processNotification(notification(trx.id, { amount: '29' }))).outcome).toBe('paid')
  })

  it('tr_status FALSE: order + transaction failed, no customer mail, no token', async () => {
    const { order, trx } = await pendingOrder()

    const result = await service.processNotification(notification(trx.id, { isSuccess: false }))

    expect(result).toEqual({ outcome: 'failed', orderId: order.id })
    expect((await getOrder(order.id)).status).toBe('failed')
    const t = await getTrx(trx.id)
    expect(t.status).toBe('failed')
    expect(t.completedAt).toEqual(NOW)
    expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
    expect(mailer.notifyCustomerLatePayment).not.toHaveBeenCalled()
    expect(await db.select().from(shopDownloadTokens)).toHaveLength(0)
  })

  describe('late payment (order expired after 24h)', () => {
    it('order stays expired, transaction success, both late-payment mails once; retry → no mails', async () => {
      const { order, trx } = await pendingOrder({ orderStatus: 'expired', trxStatus: 'cancelled' })

      const result = await service.processNotification(notification(trx.id))
      const retry = await service.processNotification(notification(trx.id))

      expect(result).toEqual({ outcome: 'late_payment', orderId: order.id })
      expect(retry.outcome).toBe('already_processed')

      const o = await getOrder(order.id)
      expect(o.status).toBe('expired')
      expect(o.paidAt).toBeNull()
      expect(o.confirmationSentAt).toBeNull()
      const t = await getTrx(trx.id)
      expect(t.status).toBe('success')
      expect(t.tpayTransactionId).toBe('TR-ABC-123')

      expect(mailer.notifyCustomerLatePayment).toHaveBeenCalledTimes(1)
      expect(mailer.notifyCustomerLatePayment.mock.calls[0][0]).toMatchObject({ id: order.id })
      expect(mailer.notifyOwnerLatePayment).toHaveBeenCalledTimes(1)
      expect(mailer.notifyOwnerLatePayment.mock.calls[0][1]).toEqual({
        receivedAmount: '29.00',
        customerNotified: true,
        tpayTransactionId: 'TR-ABC-123',
      })
      // Klientka pierwsza, potem właścicielka (z informacją, czy klientka dostała mail)
      expect(mailer.notifyCustomerLatePayment.mock.invocationCallOrder[0]).toBeLessThan(
        mailer.notifyOwnerLatePayment.mock.invocationCallOrder[0]
      )
      expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
      expect(await db.select().from(shopDownloadTokens)).toHaveLength(0)

      const ev = await db.select().from(events).where(eq(events.eventType, 'shop_order_late_payment'))
      expect(ev).toHaveLength(1)
      expect(ev[0].properties).toMatchObject({ orderId: order.id, customerNotified: true, ownerNotified: true })
    })

    it('late-payment event survives mail failures (flags stay false)', async () => {
      mailer.notifyCustomerLatePayment.mockRejectedValue(new Error('smtp'))
      mailer.notifyOwnerLatePayment.mockRejectedValue(new Error('smtp'))
      const { order, trx } = await pendingOrder({ orderStatus: 'expired', trxStatus: 'cancelled' })

      await service.processNotification(notification(trx.id))

      const ev = await db.select().from(events).where(eq(events.eventType, 'shop_order_late_payment'))
      expect(ev).toHaveLength(1)
      expect(ev[0].properties).toMatchObject({
        orderId: order.id,
        receivedAmount: '29.00',
        customerNotified: false,
        ownerNotified: false,
      })
    })

    it('customer mail not sent → warning, event customerNotified=false', async () => {
      mailer.notifyCustomerLatePayment.mockResolvedValue(false)
      const { order, trx } = await pendingOrder({ orderStatus: 'expired', trxStatus: 'cancelled' })

      await service.processNotification(notification(trx.id))

      expect(vi.mocked(console.warn).mock.calls.some((c) => String(c[0]).includes('customer NOT notified'))).toBe(true)
      expect(mailer.notifyOwnerLatePayment.mock.calls[0][1]).toMatchObject({ customerNotified: false })
      const [ev] = await db.select().from(events).where(eq(events.eventType, 'shop_order_late_payment'))
      expect(ev.properties).toMatchObject({ orderId: order.id, customerNotified: false, ownerNotified: true })
    })

    it('pending order older than 24 h (cron not run yet) → expired + late payment, also on retry only once', async () => {
      const { order, trx } = await pendingOrder({ createdAt: new Date(NOW.getTime() - 25 * HOUR_MS) })

      const results = await Promise.all([
        service.processNotification(notification(trx.id)),
        service.processNotification(notification(trx.id)),
      ])

      expect(results.map((r) => r.outcome).sort()).toEqual(['already_processed', 'late_payment'])
      const o = await getOrder(order.id)
      expect(o.status).toBe('expired')
      expect(o.paidAt).toBeNull()
      expect((await getTrx(trx.id)).status).toBe('success')
      expect(mailer.notifyCustomerLatePayment).toHaveBeenCalledTimes(1)
      expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
      expect(await db.select().from(shopDownloadTokens)).toHaveLength(0)
    })

    it('pending order 23 h old → normal payment', async () => {
      const { order, trx } = await pendingOrder({ createdAt: new Date(NOW.getTime() - 23 * HOUR_MS) })

      expect((await service.processNotification(notification(trx.id))).outcome).toBe('paid')
      expect((await getOrder(order.id)).status).toBe('paid')
      expect(mailer.notifyCustomerLatePayment).not.toHaveBeenCalled()
    })

    it('concurrent late-payment notifications → mails exactly once', async () => {
      const { trx } = await pendingOrder({ orderStatus: 'expired', trxStatus: 'cancelled' })

      const results = await Promise.all([
        service.processNotification(notification(trx.id)),
        service.processNotification(notification(trx.id)),
      ])

      expect(results.map((r) => r.outcome).sort()).toEqual(['already_processed', 'late_payment'])
      expect(mailer.notifyCustomerLatePayment).toHaveBeenCalledTimes(1)
      expect(mailer.notifyOwnerLatePayment).toHaveBeenCalledTimes(1)
    })

    it('order expired but transaction still pending → late payment', async () => {
      const { order, trx } = await pendingOrder({ orderStatus: 'expired', trxStatus: 'pending' })

      expect((await service.processNotification(notification(trx.id))).outcome).toBe('late_payment')
      expect((await getOrder(order.id)).status).toBe('expired')
      expect((await getTrx(trx.id)).status).toBe('success')
    })

    it('failure notification for an expired order → already_processed, no mails', async () => {
      const { trx } = await pendingOrder({ orderStatus: 'expired', trxStatus: 'cancelled' })

      const result = await service.processNotification(notification(trx.id, { isSuccess: false }))

      expect(result.outcome).toBe('already_processed')
      expect((await getTrx(trx.id)).status).toBe('cancelled')
      expect(mailer.notifyCustomerLatePayment).not.toHaveBeenCalled()
    })
  })

  describe('success after failed (e.g. FALSE then TRUE)', () => {
    it('matching amount → unexpected_payment: transaction success, order stays failed, owner mail once', async () => {
      const { order, trx } = await pendingOrder()
      await service.processNotification(notification(trx.id, { isSuccess: false }))

      const results = await Promise.all([
        service.processNotification(notification(trx.id)),
        service.processNotification(notification(trx.id)),
      ])
      const retry = await service.processNotification(notification(trx.id))

      expect(results.map((r) => r.outcome).sort()).toEqual(['already_processed', 'unexpected_payment'])
      expect(retry.outcome).toBe('already_processed')
      expect((await getOrder(order.id)).status).toBe('failed')
      expect((await getTrx(trx.id)).status).toBe('success')
      expect(mailer.notifyOwnerUnexpectedPayment).toHaveBeenCalledTimes(1)
      expect(mailer.notifyOwnerUnexpectedPayment.mock.calls[0][0]).toMatchObject({ id: order.id, status: 'failed' })
      expect(mailer.notifyOwnerUnexpectedPayment.mock.calls[0][1]).toEqual({
        receivedAmount: '29.00',
        tpayTransactionId: 'TR-ABC-123',
      })
      expect(mailer.sendOrderConfirmation).not.toHaveBeenCalled()
      expect(mailer.notifyOwnerAmountMismatch).not.toHaveBeenCalled()
      expect(await db.select().from(shopDownloadTokens)).toHaveLength(0)
      expect(await db.select().from(events).where(eq(events.eventType, 'shop_order_unexpected_payment'))).toHaveLength(1)
    })

    it('unexpected-payment event is written with the status change (even if the mail fails)', async () => {
      mailer.notifyOwnerUnexpectedPayment.mockRejectedValue(new Error('smtp'))
      const { order, trx } = await pendingOrder()
      await service.processNotification(notification(trx.id, { isSuccess: false }))

      await service.processNotification(notification(trx.id))

      const ev = await db.select().from(events).where(eq(events.eventType, 'shop_order_unexpected_payment'))
      expect(ev).toHaveLength(1)
      expect(ev[0].properties).toMatchObject({ orderId: order.id, transactionId: trx.id, receivedAmount: '29.00' })
    })

    it('mismatched amount → mismatch mail once (retry and concurrent duplicates included)', async () => {
      const { order, trx } = await pendingOrder()
      await service.processNotification(notification(trx.id, { isSuccess: false }))

      const results = await Promise.all([
        service.processNotification(notification(trx.id, { amount: '5.00' })),
        service.processNotification(notification(trx.id, { amount: '5.00' })),
      ])
      await service.processNotification(notification(trx.id, { amount: '5.00' }))

      expect(results.map((r) => r.outcome).sort()).toEqual(['already_processed', 'amount_mismatch'])
      expect(mailer.notifyOwnerAmountMismatch).toHaveBeenCalledTimes(1)
      expect(mailer.notifyOwnerAmountMismatch.mock.calls[0][1]).toEqual({
        expected: '29.00',
        received: '5.00',
        tpayTransactionId: 'TR-ABC-123',
      })
      expect(mailer.notifyOwnerUnexpectedPayment).not.toHaveBeenCalled()
      expect((await getOrder(order.id)).status).toBe('failed')
      expect((await getTrx(trx.id)).status).toBe('failed')
    })
  })
})

describe('Integration: webhook with the real ShopMailService (SMTP transport mocked)', () => {
  const ENV_KEYS = ['SMTP_USER', 'SMTP_PASS', 'SITE_URL', 'CONTACT_EMAIL', 'SHOP_OWNER_NOTIFICATION_EMAILS'] as const
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {}

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    Object.assign(process.env, {
      SMTP_USER: 'sklep@paulinamaciak.pl',
      SMTP_PASS: 'secret',
      SITE_URL: 'https://paulinamaciak.pl',
      CONTACT_EMAIL: 'kontakt@paulinamaciak.pl',
      SHOP_OWNER_NOTIFICATION_EMAILS: 'owner1@example.com, owner2@example.com',
    })
    sendMail.mockReset().mockResolvedValue({ messageId: 'x' })
  })

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key]
      else process.env[key] = savedEnv[key]
    }
  })

  it('paid order → confirmation with terms PDF sent, confirmationSentAt set, owner notified', async () => {
    const { order, trx } = await pendingOrder()
    const real = new ShopPaymentService(db, { tpay, now: () => NOW })

    await expect(real.processNotification(notification(trx.id))).resolves.toMatchObject({ outcome: 'paid' })

    expect((await getOrder(order.id)).confirmationSentAt).toEqual(NOW)
    expect(sendMail).toHaveBeenCalledTimes(2)
    const [confirmation, owner] = sendMail.mock.calls.map((c) => c[0])
    expect(confirmation.to).toBe('anna@example.com')
    expect(confirmation.subject).toBe(`Twoje zamówienie ${order.orderNumber} – potwierdzenie i e-book`)
    expect(confirmation.attachments).toHaveLength(1)
    expect(confirmation.attachments[0].filename).toBe(`Regulamin-sklepu-${order.termsVersion}.pdf`)
    expect(confirmation.html).toContain('https://paulinamaciak.pl/sklep/pobierz/')
    expect(owner.to).toBe('owner1@example.com, owner2@example.com')
    expect(owner.subject).toBe(`Nowe zamówienie ${order.orderNumber}`)
    expect(owner.text).toContain('TR-ABC-123')
  })

  it('SMTP failure → order paid, confirmationSentAt NULL, owner told the confirmation was NOT sent', async () => {
    sendMail.mockRejectedValueOnce(new Error('SMTP down'))
    const { order, trx } = await pendingOrder()
    const real = new ShopPaymentService(db, { tpay, now: () => NOW })

    await expect(real.processNotification(notification(trx.id))).resolves.toMatchObject({ outcome: 'paid' })

    expect((await getOrder(order.id)).confirmationSentAt).toBeNull()
    expect(sendMail).toHaveBeenCalledTimes(2)
    expect(sendMail.mock.calls[1][0].text).toContain('NIE zostało wysłane')
  })
})
