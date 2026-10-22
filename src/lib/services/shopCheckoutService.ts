/**
 * Shop Checkout Service (sklep)
 *
 * Responsibilities:
 * - Quote a cart: the localStorage cart holds only slugs, prices come from the database
 * - (later) create an order and initiate a Tpay payment
 */

import type { Database } from '@/db'
import { ProductRepository } from '@/lib/repositories/productRepository'
import { sumPrices } from '@/lib/shop/money'

/** Maksymalna liczba różnych pozycji w koszyku branych pod uwagę przy wycenie. */
export const MAX_CART_ITEMS = 20

export interface CartQuoteItem {
  productId: string
  slug: string
  title: string
  price: string // decimal string, np. "29.00"
}

export interface CartQuote {
  items: CartQuoteItem[]
  removedSlugs: string[] // nieistniejące / nieaktywne – UI pokazuje komunikat i czyści koszyk
  total: string // decimal string; pusty koszyk → "0.00"
}

export class ShopCheckoutService {
  /**
   * @param db - Drizzle database
   * @param products - optional repository override (tests); defaults to ProductRepository(db)
   */
  constructor(
    private db: Database,
    private products: ProductRepository = new ProductRepository(db)
  ) {}

  /**
   * Authoritative cart quote.
   *
   * - duplicates collapsed, first-seen order preserved, at most MAX_CART_ITEMS slugs considered
   * - draft/archived/unknown slugs land in removedSlugs (input order)
   * - total summed in grosze (no float errors)
   */
  async quoteCart(slugs: string[]): Promise<CartQuote> {
    const unique = [...new Set(slugs)].slice(0, MAX_CART_ITEMS)
    const found = await this.products.findActiveBySlugs(unique)
    const bySlug = new Map(found.map((p) => [p.slug, p]))

    const items = unique.flatMap((slug) => {
      const p = bySlug.get(slug)
      return p ? [{ productId: p.id, slug: p.slug, title: p.title, price: p.price }] : []
    })

    return {
      items,
      removedSlugs: unique.filter((slug) => !bySlug.has(slug)),
      total: sumPrices(items.map((i) => i.price)),
    }
  }
}
