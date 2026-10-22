/**
 * Integration Tests: Shop Checkout Service – quoteCart (sklep)
 *
 * Real PostgreSQL via Testcontainers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Database } from '@/db'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createProduct } from '../../fixtures/shop'
import { ShopCheckoutService } from '@/lib/services/shopCheckoutService'

describe('Integration: ShopCheckoutService.quoteCart', () => {
  let db: Database
  let service: ShopCheckoutService

  beforeAll(async () => {
    const result = await startTestDatabase()
    db = result.db
    service = new ShopCheckoutService(db)
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(db)
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
