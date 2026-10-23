/**
 * Integration Tests: Product Repository (sklep)
 *
 * Tests ProductRepository operations with real PostgreSQL database.
 * Uses Testcontainers for isolated database instances.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Database } from '@/db'
import * as schema from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createProduct } from '../../fixtures/shop'
import { ProductRepository } from '@/lib/repositories/productRepository'

const DAY = 24 * 60 * 60 * 1000
const now = new Date('2026-10-22T12:00:00.000Z')
const daysAgo = (days: number) => new Date(now.getTime() - days * DAY)

describe('Integration: Product Repository', () => {
  let db: Database
  let repository: ProductRepository

  beforeAll(async () => {
    const result = await startTestDatabase()
    db = result.db
    repository = new ProductRepository(db)
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(db)
  })

  async function addPrice(productId: string, price: string, validFrom: Date) {
    await db.insert(schema.productPriceHistory).values({ productId, price, validFrom })
  }

  describe('findActiveBySlugs()', () => {
    it('returns [] for empty input', async () => {
      await createProduct(db, { slug: 'a' })
      expect(await repository.findActiveBySlugs([])).toEqual([])
    })

    it('returns only active products matching slugs', async () => {
      await createProduct(db, { slug: 'active-1' })
      await createProduct(db, { slug: 'active-2' })
      await createProduct(db, { slug: 'draft', status: 'draft' })
      await createProduct(db, { slug: 'archived', status: 'archived' })

      const result = await repository.findActiveBySlugs(['active-1', 'draft', 'archived', 'missing'])

      expect(result.map((p) => p.slug)).toEqual(['active-1'])
    })
  })

  describe('findBySlug()', () => {
    it('returns null for missing slug', async () => {
      expect(await repository.findBySlug('missing')).toBeNull()
    })

    it('returns product regardless of status (draft)', async () => {
      const draft = await createProduct(db, { slug: 'draft', status: 'draft' })
      const result = await repository.findBySlug('draft')
      expect(result?.id).toBe(draft.id)
      expect(result?.status).toBe('draft')
    })
  })

  describe('listActive()', () => {
    it('returns only active products', async () => {
      await createProduct(db, { slug: 'active-1' })
      await createProduct(db, { slug: 'active-2' })
      await createProduct(db, { slug: 'draft', status: 'draft' })
      await createProduct(db, { slug: 'archived', status: 'archived' })

      const result = await repository.listActive()

      expect(result.map((p) => p.slug).sort()).toEqual(['active-1', 'active-2'])
    })
  })

  describe('lowestPriceInLast30Days()', () => {
    let productId: string

    beforeEach(async () => {
      productId = (await createProduct(db, { slug: 'omnibus' })).id
    })

    it('returns null when there is no history', async () => {
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBeNull()
    })

    it('returns the price in force at window start when only an old entry exists', async () => {
      await addPrice(productId, '39.00', daysAgo(60))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('39.00')
    })

    it('returns in-window price when lower than price at window start', async () => {
      await addPrice(productId, '39.00', daysAgo(40))
      await addPrice(productId, '29.00', daysAgo(10))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('29.00')
    })

    it('counts the price in force at window start when it is lower', async () => {
      await addPrice(productId, '19.00', daysAgo(40))
      await addPrice(productId, '29.00', daysAgo(10))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('19.00')
    })

    it('ignores entries older than the latest entry before the window', async () => {
      await addPrice(productId, '9.00', daysAgo(90))
      await addPrice(productId, '39.00', daysAgo(40))
      await addPrice(productId, '29.00', daysAgo(10))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('29.00')
    })

    it('ignores future entries', async () => {
      await addPrice(productId, '39.00', daysAgo(10))
      await addPrice(productId, '9.00', new Date(now.getTime() + DAY))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('39.00')
    })

    it('compares numerically, not lexicographically', async () => {
      await addPrice(productId, '29.00', daysAgo(20))
      await addPrice(productId, '100.00', daysAgo(10))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('29.00')
    })

    it('ignores history of other products', async () => {
      const other = await createProduct(db, { slug: 'other' })
      await addPrice(other.id, '1.00', daysAgo(5))
      await addPrice(productId, '29.00', daysAgo(5))
      expect(await repository.lowestPriceInLast30Days(productId, now)).toBe('29.00')
    })
  })
})
