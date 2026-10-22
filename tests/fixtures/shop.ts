import { inArray, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import { products, shopOrderItems, shopOrders } from '@/db/schema';
import { sumPrices } from '@/lib/shop/money';

/**
 * Create a shop product (defaults: active e-book "Proteinowa Piekarnia" for 29.00 PLN)
 *
 * @example
 * ```ts
 * const product = await createProduct(db, { slug: 'inny-ebook', price: '39.00' });
 * ```
 */
export async function createProduct(
  db: Database,
  overrides: Partial<typeof products.$inferInsert> = {}
) {
  const [product] = await db
    .insert(products)
    .values({
      slug: 'proteinowa-piekarnia',
      type: 'ebook',
      title: 'Proteinowa Piekarnia',
      price: '29.00',
      status: 'active',
      fileObjectKey: 'products/ebooks/test.pdf',
      fileName: 'proteinowa-piekarnia.pdf',
      ...overrides,
    })
    .returning();

  return product;
}

type CreatePaidOrderOptions = {
  email: string;
  productIds: string[];
  userId?: string | null;
} & Partial<Omit<typeof shopOrders.$inferInsert, 'email' | 'userId'>>;

/**
 * Create a paid shop order with one item per product.
 * totalAmount = sum of product prices; orderNumber from shop_order_number_seq (ZAM-RRRR-NNNNN).
 * confirmationSentAt defaults to now – pass `null` to simulate "confirmation not sent yet".
 *
 * @example
 * ```ts
 * const { order, items } = await createPaidOrder(db, { email: 'anna@example.com', productIds: [product.id] });
 * ```
 */
export async function createPaidOrder(db: Database, options: CreatePaidOrderOptions) {
  const { email, productIds, userId = null, ...overrides } = options;

  const rows = await db.select().from(products).where(inArray(products.id, productIds));
  const orderedProducts = productIds.map((id) => {
    const product = rows.find((p) => p.id === id);
    if (!product) throw new Error(`createPaidOrder: product ${id} not found`);
    return product;
  });

  const now = new Date();
  const orderNumber = sql<string>`'ZAM-' || ${String(now.getFullYear())} || '-' || lpad(nextval('shop_order_number_seq')::text, 5, '0')`;

  const [order] = await db
    .insert(shopOrders)
    .values({
      orderNumber,
      email: email.toLowerCase(),
      userId,
      status: 'paid',
      totalAmount: sumPrices(orderedProducts.map((p) => p.price)),
      termsVersion: '2026-11-01',
      termsAcceptedAt: now,
      digitalContentConsentAt: now,
      digitalContentConsentText:
        'Żądam dostarczenia treści cyfrowej przed upływem terminu do odstąpienia od umowy i przyjmuję do wiadomości utratę prawa odstąpienia.',
      paidAt: now,
      confirmationSentAt: now,
      ...overrides,
    })
    .returning();

  const items = await db
    .insert(shopOrderItems)
    .values(
      orderedProducts.map((p) => ({
        orderId: order.id,
        productId: p.id,
        titleSnapshot: p.title,
        unitPrice: p.price,
      }))
    )
    .returning();

  return { order, items };
}
