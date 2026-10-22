import type { Database } from '@/db'
import { products, productPriceHistory, type Product } from '@/db/schema'
import { and, asc, desc, eq, gte, inArray, lt, lte } from 'drizzle-orm'
import { toGrosze } from '@/lib/shop/money'

/**
 * Product Repository (sklep)
 *
 * Responsibilities:
 * - Query shop products (by slug, active listing)
 * - Omnibus: lowest price in the 30 days before a given moment
 */

const OMNIBUS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export class ProductRepository {
  constructor(private db: Database) {}

  /**
   * Find active products by slugs (draft/archived and unknown slugs are skipped).
   * Empty input returns [] without querying the database.
   */
  async findActiveBySlugs(slugs: string[]): Promise<Product[]> {
    if (slugs.length === 0) return []

    try {
      return await this.db
        .select()
        .from(products)
        .where(and(inArray(products.slug, slugs), eq(products.status, 'active')))
    } catch (error) {
      console.error('[ProductRepository] Error finding active products by slugs:', error)
      throw error
    }
  }

  /**
   * Find a product by slug regardless of status (the caller decides what to show).
   */
  async findBySlug(slug: string): Promise<Product | null> {
    try {
      const [product] = await this.db
        .select()
        .from(products)
        .where(eq(products.slug, slug))
        .limit(1)

      return product ?? null
    } catch (error) {
      console.error('[ProductRepository] Error finding product by slug:', error)
      throw error
    }
  }

  /**
   * List all active products, ordered by title.
   */
  async listActive(): Promise<Product[]> {
    try {
      return await this.db
        .select()
        .from(products)
        .where(eq(products.status, 'active'))
        .orderBy(asc(products.title))
    } catch (error) {
      console.error('[ProductRepository] Error listing active products:', error)
      throw error
    }
  }

  /**
   * Omnibus: lowest price in the 30 days before `now`.
   *
   * Considers the price in force at the window start (latest entry with validFrom < now - 30d)
   * plus every entry with now - 30d <= validFrom <= now. Future entries are ignored.
   * Prices are compared numerically (grosze), not as strings.
   *
   * @returns decimal string (e.g. "29.00") or null when the product has no price history
   */
  async lowestPriceInLast30Days(productId: string, now: Date = new Date()): Promise<string | null> {
    const windowStart = new Date(now.getTime() - OMNIBUS_WINDOW_MS)

    try {
      const [priceAtWindowStart] = await this.db
        .select({ price: productPriceHistory.price })
        .from(productPriceHistory)
        .where(
          and(
            eq(productPriceHistory.productId, productId),
            lt(productPriceHistory.validFrom, windowStart)
          )
        )
        .orderBy(desc(productPriceHistory.validFrom))
        .limit(1)

      const inWindow = await this.db
        .select({ price: productPriceHistory.price })
        .from(productPriceHistory)
        .where(
          and(
            eq(productPriceHistory.productId, productId),
            gte(productPriceHistory.validFrom, windowStart),
            lte(productPriceHistory.validFrom, now)
          )
        )

      const candidates = [...(priceAtWindowStart ? [priceAtWindowStart] : []), ...inWindow].map(
        (row) => row.price
      )
      if (candidates.length === 0) return null

      return candidates.reduce((lowest, price) => (toGrosze(price) < toGrosze(lowest) ? price : lowest))
    } catch (error) {
      console.error('[ProductRepository] Error computing lowest price in last 30 days:', error)
      throw error
    }
  }
}
