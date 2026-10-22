/**
 * Integration Tests: PzkPurchaseService.processPaymentCallback
 *
 * Real PostgreSQL via Testcontainers. Tpay signature verification and e-mail
 * sending are mocked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/email', () => ({
  sendPzkPurchaseConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendPzkPurchaseNotificationEmail: vi.fn().mockResolvedValue(undefined),
}))

import { eq } from 'drizzle-orm'
import type { Database } from '@/db'
import { transactions, pzkModuleAccess } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createPatient } from '../../fixtures/users'
import { PzkPurchaseService } from '@/lib/services/pzkPurchaseService'
import { TpayService } from '@/lib/services/tpayService'
import { sendPzkPurchaseConfirmationEmail, sendPzkPurchaseNotificationEmail } from '@/lib/email'

describe('Integration: PzkPurchaseService.processPaymentCallback', () => {
  let db: Database
  let service: PzkPurchaseService

  beforeAll(async () => {
    const result = await startTestDatabase()
    db = result.db
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(db)
    vi.stubEnv('TPAY_CLIENT_ID', 'test-client-id')
    vi.stubEnv('TPAY_CLIENT_SECRET', 'test-client-secret')
    vi.spyOn(TpayService.prototype, 'verifyWebhookSignature').mockResolvedValue(true)
    vi.mocked(sendPzkPurchaseConfirmationEmail).mockClear()
    vi.mocked(sendPzkPurchaseNotificationEmail).mockClear()
    service = new PzkPurchaseService(db)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  async function createTransaction(userId: string, item: string) {
    const [tx] = await db
      .insert(transactions)
      .values({
        userId,
        item,
        amount: '349.00',
        status: 'pending',
        tpayTitle: item,
        payerEmail: 'payer@example.com',
      })
      .returning()
    return tx
  }

  function callbackParams(transactionId: string) {
    return {
      transactionId,
      tpayTransactionId: `TR-${transactionId.slice(0, 8)}`,
      status: 'success' as const,
      signature: 'header.payload.signature',
      rawPayload: {},
      rawBody: 'tr_status=TRUE',
    }
  }

  it('ignores a non-PZK (SHOP_ORDER) transaction: stays pending, no access, no e-mail', async () => {
    const patient = await createPatient(db)
    const tx = await createTransaction(patient.id, 'SHOP_ORDER')

    await expect(service.processPaymentCallback(callbackParams(tx.id))).resolves.toBeUndefined()

    const [after] = await db.select().from(transactions).where(eq(transactions.id, tx.id))
    expect(after.status).toBe('pending')
    expect(after.tpayTransactionId).toBeNull()
    expect(after.completedAt).toBeNull()

    const access = await db.select().from(pzkModuleAccess).where(eq(pzkModuleAccess.userId, patient.id))
    expect(access).toHaveLength(0)

    expect(sendPzkPurchaseConfirmationEmail).not.toHaveBeenCalled()
    expect(sendPzkPurchaseNotificationEmail).not.toHaveBeenCalled()
  })

  it('still rejects an invalid signature before looking at the transaction', async () => {
    vi.spyOn(TpayService.prototype, 'verifyWebhookSignature').mockResolvedValue(false)
    const patient = await createPatient(db)
    const tx = await createTransaction(patient.id, 'SHOP_ORDER')

    await expect(service.processPaymentCallback(callbackParams(tx.id))).rejects.toThrow(
      'Invalid webhook signature'
    )
  })

  it('processes a PZK_MODULE_1 transaction: success + module access + e-mails', async () => {
    const patient = await createPatient(db)
    const tx = await createTransaction(patient.id, 'PZK_MODULE_1')

    await service.processPaymentCallback(callbackParams(tx.id))

    const [after] = await db.select().from(transactions).where(eq(transactions.id, tx.id))
    expect(after.status).toBe('success')

    const access = await db.select().from(pzkModuleAccess).where(eq(pzkModuleAccess.userId, patient.id))
    expect(access.map((a) => a.module)).toEqual([1])

    expect(sendPzkPurchaseConfirmationEmail).toHaveBeenCalledTimes(1)
    expect(sendPzkPurchaseNotificationEmail).toHaveBeenCalledTimes(1)
  })
})
