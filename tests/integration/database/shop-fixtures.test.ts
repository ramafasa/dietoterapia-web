/**
 * Integration Tests: Shop fixtures + cleanDatabase
 *
 * Verifies shop test fixtures (products, paid orders) and that cleanDatabase
 * removes shop rows and transactions.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createUser } from '../../helpers/fixtures';
import { createProduct, createPaidOrder } from '../../fixtures';

describe('Integration: Shop fixtures', () => {
  let db: Database;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  it('createProduct uses sensible defaults', async () => {
    const product = await createProduct(db);

    expect(product.id).toBeDefined();
    expect(product.slug).toBe('proteinowa-piekarnia');
    expect(product.type).toBe('ebook');
    expect(product.title).toBe('Proteinowa Piekarnia');
    expect(product.price).toBe('29.00');
    expect(product.currency).toBe('PLN');
    expect(product.status).toBe('active');
    expect(product.fileObjectKey).toBe('products/ebooks/test.pdf');
    expect(product.fileName).toBe('proteinowa-piekarnia.pdf');
  });

  it('createPaidOrder creates a paid order with items, total and ZAM number', async () => {
    const p1 = await createProduct(db);
    const p2 = await createProduct(db, { slug: 'drugi-ebook', title: 'Drugi E-book', price: '19.99' });

    const { order, items } = await createPaidOrder(db, {
      email: 'Anna.Nowak@Example.com',
      productIds: [p1.id, p2.id],
    });

    expect(order.status).toBe('paid');
    expect(order.email).toBe('anna.nowak@example.com');
    expect(order.userId).toBeNull();
    expect(order.totalAmount).toBe('48.99');
    expect(order.orderNumber).toMatch(new RegExp(`^ZAM-${new Date().getFullYear()}-\\d{5}$`));
    expect(order.paidAt).toBeInstanceOf(Date);
    expect(order.confirmationSentAt).toBeInstanceOf(Date);
    expect(order.termsVersion).toBe('2026-11-01');

    expect(items).toHaveLength(2);
    const byProduct = Object.fromEntries(items.map((i) => [i.productId, i]));
    expect(byProduct[p1.id]).toMatchObject({ orderId: order.id, titleSnapshot: 'Proteinowa Piekarnia', unitPrice: '29.00' });
    expect(byProduct[p2.id]).toMatchObject({ orderId: order.id, titleSnapshot: 'Drugi E-book', unitPrice: '19.99' });
  });

  it('createPaidOrder accepts overrides (confirmation not sent yet, linked user)', async () => {
    const user = await createUser(db, { email: 'klient@example.com', role: 'customer' });
    const product = await createProduct(db);

    const { order } = await createPaidOrder(db, {
      email: user.email,
      productIds: [product.id],
      userId: user.id,
      confirmationSentAt: null,
    });

    expect(order.userId).toBe(user.id);
    expect(order.confirmationSentAt).toBeNull();
  });

  it('two orders get distinct order numbers', async () => {
    const product = await createProduct(db);

    const { order: a } = await createPaidOrder(db, { email: 'a@example.com', productIds: [product.id] });
    const { order: b } = await createPaidOrder(db, { email: 'b@example.com', productIds: [product.id] });

    expect(a.orderNumber).not.toBe(b.orderNumber);
  });

  it('cleanDatabase removes shop rows and transactions', async () => {
    const user = await createUser(db, { email: 'kupujacy@example.com' });
    const product = await createProduct(db);
    const { order } = await createPaidOrder(db, { email: 'kupujacy@example.com', productIds: [product.id] });

    await db.insert(schema.productPriceHistory).values({ productId: product.id, price: product.price });
    await db.insert(schema.shopDownloadTokens).values({
      orderId: order.id,
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(schema.shopAccountTokens).values({
      email: order.email,
      tokenHash: 'b'.repeat(64),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await db.insert(schema.transactions).values([
      {
        shopOrderId: order.id,
        item: 'SHOP_ORDER',
        amount: order.totalAmount,
        status: 'success',
        tpayTitle: order.orderNumber,
        payerEmail: order.email,
      },
      {
        userId: user.id,
        item: 'PZK_MODULE_1',
        amount: '349.00',
        status: 'pending',
        tpayTitle: 'PZK Moduł 1',
        payerEmail: user.email,
      },
    ]);

    await cleanDatabase(db);

    expect(await db.select().from(schema.transactions)).toHaveLength(0);
    expect(await db.select().from(schema.shopDownloadTokens)).toHaveLength(0);
    expect(await db.select().from(schema.shopAccountTokens)).toHaveLength(0);
    expect(await db.select().from(schema.shopOrderItems)).toHaveLength(0);
    expect(await db.select().from(schema.shopOrders)).toHaveLength(0);
    expect(await db.select().from(schema.productPriceHistory)).toHaveLength(0);
    expect(await db.select().from(schema.products)).toHaveLength(0);
    expect(await db.select().from(schema.users)).toHaveLength(0);
  });

  it('createUser supports role customer with emailVerifiedAt null', async () => {
    const user = await createUser(db, { email: 'customer@example.com', role: 'customer', emailVerifiedAt: null });

    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, user.id));
    expect(row.role).toBe('customer');
    expect(row.emailVerifiedAt).toBeNull();
  });

  it('createUser passes emailVerifiedAt through', async () => {
    const verifiedAt = new Date('2026-10-01T10:00:00Z');
    const user = await createUser(db, { email: 'verified@example.com', role: 'customer', emailVerifiedAt: verifiedAt });

    expect(user.emailVerifiedAt?.toISOString()).toBe(verifiedAt.toISOString());
  });
});
