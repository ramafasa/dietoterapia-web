/**
 * Integration Tests: ShopOrderRepository.findPaidOrdersWithItemsForUser (/konto/zakupy, Task 6.4)
 *
 * Only the user's paid, non-anonymised orders; newest first; items with product slug, ordered by title.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from '@/db';
import { ShopOrderRepository } from '@/lib/repositories/shopOrderRepository';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createUser } from '../../helpers/fixtures';
import { createProduct, createPaidOrder } from '../../fixtures';

describe('Integration: ShopOrderRepository.findPaidOrdersWithItemsForUser', () => {
  let db: Database;

  beforeAll(async () => {
    db = (await startTestDatabase()).db;
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  it('returns only paid, non-anonymised orders of the user, newest first, with slugs', async () => {
    const user = await createUser(db, { email: 'anna@example.com', role: 'customer' });
    const other = await createUser(db, { email: 'ola@example.com', role: 'customer' });
    const bread = await createProduct(db, { slug: 'proteinowa-piekarnia', title: 'Proteinowa Piekarnia' });
    const soups = await createProduct(db, { slug: 'zupy', title: 'Ala zupy' });

    const older = await createPaidOrder(db, {
      email: user.email,
      userId: user.id,
      productIds: [bread.id],
      paidAt: new Date('2026-01-10T10:00:00Z'),
    });
    const newer = await createPaidOrder(db, {
      email: user.email,
      userId: user.id,
      productIds: [bread.id, soups.id],
      paidAt: new Date('2026-03-10T10:00:00Z'),
      confirmationSentAt: null,
    });

    // excluded: other statuses, anonymised, not linked (same e-mail), other user
    for (const status of ['pending', 'failed', 'expired'] as const) {
      await createPaidOrder(db, { email: user.email, userId: user.id, productIds: [bread.id], status, paidAt: null });
    }
    await createPaidOrder(db, {
      email: user.email,
      userId: user.id,
      productIds: [bread.id],
      anonymizedAt: new Date(),
    });
    await createPaidOrder(db, { email: user.email, productIds: [bread.id] });
    await createPaidOrder(db, { email: other.email, userId: other.id, productIds: [bread.id] });

    const purchases = await new ShopOrderRepository(db).findPaidOrdersWithItemsForUser(user.id);

    expect(purchases.map((p) => p.id)).toEqual([newer.order.id, older.order.id]);
    expect(purchases[0]).toMatchObject({
      orderNumber: newer.order.orderNumber,
      confirmationSentAt: null,
    });
    expect(purchases[0].paidAt?.toISOString()).toBe('2026-03-10T10:00:00.000Z');
    expect(purchases[0].items).toEqual([
      { id: newer.items.find((i) => i.productId === soups.id)!.id, title: 'Ala zupy', slug: 'zupy' },
      {
        id: newer.items.find((i) => i.productId === bread.id)!.id,
        title: 'Proteinowa Piekarnia',
        slug: 'proteinowa-piekarnia',
      },
    ]);
    expect(purchases[1].items).toEqual([
      { id: older.items[0].id, title: 'Proteinowa Piekarnia', slug: 'proteinowa-piekarnia' },
    ]);
    expect(purchases[1].confirmationSentAt).toBeInstanceOf(Date);
  });

  it('empty array when the user has no purchases', async () => {
    const user = await createUser(db, { email: 'anna@example.com', role: 'customer' });
    expect(await new ShopOrderRepository(db).findPaidOrdersWithItemsForUser(user.id)).toEqual([]);
  });
});
