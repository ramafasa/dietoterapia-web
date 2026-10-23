/**
 * Integration Tests: Shop Download Service (sklep) – kto i kiedy dostaje presigned URL do e-booka.
 *
 * Real PostgreSQL via Testcontainers; presign wstrzyknięty (mock).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Database } from '@/db'
import { events, shopOrderItems } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createPaidOrder, createProduct } from '../../fixtures/shop'
import { createPatient } from '../../fixtures/users'
import { SHOP_DOWNLOAD_EVENT, ShopDownloadService } from '@/lib/services/shopDownloadService'
import { PRESIGN_TTL_SECONDS } from '@/lib/shop/constants'
import type { PresignUrlParams } from '@/lib/storage/s3-presign'

const PRESIGNED = 'https://r2.example.com/bucket/file.pdf?X-Amz-Signature=abc'

let db: Database
let presign: ReturnType<typeof vi.fn<(params: PresignUrlParams) => Promise<string>>>
let service: ShopDownloadService

beforeAll(async () => {
  db = (await startTestDatabase()).db
})

afterAll(async () => {
  await stopTestDatabase()
})

beforeEach(async () => {
  await cleanDatabase(db)
  presign = vi.fn(async (_params: PresignUrlParams) => PRESIGNED)
  service = new ShopDownloadService(db, { presign })
})

async function paidOrder(overrides: Record<string, unknown> = {}) {
  const product = await createProduct(db, {
    slug: `ebook-${Math.random().toString(36).slice(2)}`,
    fileObjectKey: 'products/ebooks/piekarnia.pdf',
    fileName: 'proteinowa-piekarnia.pdf',
  })
  const { order, items } = await createPaidOrder(db, {
    email: 'anna@example.com',
    productIds: [product.id],
    ...overrides,
  })
  return { product, order, item: items[0] }
}

describe('ShopDownloadService.getDownloadUrl', () => {
  it('returns the presigned URL for a paid, confirmed order (product file, TTL 300, product fileName)', async () => {
    const { order, item } = await paidOrder()

    const url = await service.getDownloadUrl(order.id, item.id, 'token')

    expect(url).toBe(PRESIGNED)
    expect(presign).toHaveBeenCalledWith({
      objectKey: 'products/ebooks/piekarnia.pdf',
      fileName: 'proteinowa-piekarnia.pdf',
      contentType: 'application/pdf',
      ttlSeconds: PRESIGN_TTL_SECONDS,
    })
    expect(PRESIGN_TTL_SECONDS).toBe(300)
  })

  it('records a shop_download event without the e-mail', async () => {
    const { order, item } = await paidOrder()

    await service.getDownloadUrl(order.id, item.id, 'checkout')

    const rows = await db.select().from(events).where(eq(events.eventType, SHOP_DOWNLOAD_EVENT))
    expect(rows).toHaveLength(1)
    expect(rows[0].properties).toEqual({ orderId: order.id, itemId: item.id, actor: 'checkout' })
    expect(JSON.stringify(rows[0])).not.toContain('anna@example.com')
  })

  it('denies a pending order', async () => {
    const { order, item } = await paidOrder({ status: 'pending', paidAt: null, confirmationSentAt: null })
    expect(await service.getDownloadUrl(order.id, item.id, 'token')).toBeNull()
    expect(presign).not.toHaveBeenCalled()
  })

  it('denies a paid order whose confirmation was not sent yet (confirmationSentAt NULL)', async () => {
    const { order, item } = await paidOrder({ confirmationSentAt: null })
    expect(await service.getDownloadUrl(order.id, item.id, 'token')).toBeNull()
    expect(presign).not.toHaveBeenCalled()
  })

  it.each(['failed', 'expired'])('denies a %s order even with confirmation sent', async (status) => {
    const { order, item } = await paidOrder({ status })
    expect(await service.getDownloadUrl(order.id, item.id, 'token')).toBeNull()
  })

  it('denies an anonymized order', async () => {
    const { order, item } = await paidOrder({ anonymizedAt: new Date() })
    expect(await service.getDownloadUrl(order.id, item.id, 'token')).toBeNull()
  })

  it('returns null for an item from another order', async () => {
    const a = await paidOrder()
    const b = await paidOrder({ email: 'ola@example.com' })

    expect(await service.getDownloadUrl(a.order.id, b.item.id, 'token')).toBeNull()
    expect(presign).not.toHaveBeenCalled()
    expect(await db.select().from(events)).toHaveLength(0)
  })

  it('prefers item.fileObjectKey over the product file', async () => {
    const { order, item } = await paidOrder()
    await db
      .update(shopOrderItems)
      .set({ fileObjectKey: 'orders/watermarked/abc.pdf' })
      .where(eq(shopOrderItems.id, item.id))

    await service.getDownloadUrl(order.id, item.id, 'token')

    expect(presign).toHaveBeenCalledWith(
      expect.objectContaining({ objectKey: 'orders/watermarked/abc.pdf', fileName: 'proteinowa-piekarnia.pdf' })
    )
  })

  it('returns null for malformed ids without querying', async () => {
    expect(await service.getDownloadUrl('nope', 'nope', 'token')).toBeNull()
  })

  it('propagates presign errors (endpoint answers 500) and records no event', async () => {
    const { order, item } = await paidOrder()
    presign.mockRejectedValueOnce(new Error('R2 down'))

    await expect(service.getDownloadUrl(order.id, item.id, 'token')).rejects.toThrow('R2 down')
    expect(await db.select().from(events)).toHaveLength(0)
  })
})

describe('ShopDownloadService.getDownloadUrlForUser', () => {
  it('returns the URL for an item of the user\'s own paid order (actor account, userId on event)', async () => {
    const user = await createPatient(db, { email: 'anna@example.com' })
    const { order, item } = await paidOrder({ userId: user.id })

    expect(await service.getDownloadUrlForUser(user.id, item.id)).toBe(PRESIGNED)

    const [event] = await db.select().from(events).where(eq(events.eventType, SHOP_DOWNLOAD_EVENT))
    expect(event.userId).toBe(user.id)
    expect(event.properties).toEqual({ orderId: order.id, itemId: item.id, actor: 'account' })
  })

  it('denies another user\'s item', async () => {
    const owner = await createPatient(db, { email: 'anna@example.com' })
    const other = await createPatient(db, { email: 'ola@example.com' })
    const { item } = await paidOrder({ userId: owner.id })

    expect(await service.getDownloadUrlForUser(other.id, item.id)).toBeNull()
    expect(presign).not.toHaveBeenCalled()
  })

  it('denies a guest order item (no userId) even when the e-mail matches', async () => {
    const user = await createPatient(db, { email: 'anna@example.com' })
    const { item } = await paidOrder()

    expect(await service.getDownloadUrlForUser(user.id, item.id)).toBeNull()
  })

  it('denies the user\'s own order when the confirmation was not sent', async () => {
    const user = await createPatient(db, { email: 'anna@example.com' })
    const { item } = await paidOrder({ userId: user.id, confirmationSentAt: null })

    expect(await service.getDownloadUrlForUser(user.id, item.id)).toBeNull()
  })
})
