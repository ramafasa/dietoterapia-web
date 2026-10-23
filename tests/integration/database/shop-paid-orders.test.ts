/**
 * Integration Tests: ShopOrderRepository.hasPaidOrderForUser
 *
 * Header link „Moje e-booki” for patients – only paid orders of this user count,
 * DB errors return false (never break the header).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Database } from '@/db';
import { ShopOrderRepository } from '@/lib/repositories/shopOrderRepository';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createUser } from '../../helpers/fixtures';
import { createProduct, createPaidOrder } from '../../fixtures';

describe('Integration: ShopOrderRepository.hasPaidOrderForUser', () => {
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

  it('true when the user has a paid order', async () => {
    const user = await createUser(db, { email: 'pacjentka@example.com', role: 'patient' });
    const product = await createProduct(db);
    await createPaidOrder(db, { email: user.email, userId: user.id, productIds: [product.id] });

    expect(await new ShopOrderRepository(db).hasPaidOrderForUser(user.id)).toBe(true);
  });

  it('false without orders, with only non-paid orders, or with paid orders of others / not linked', async () => {
    const user = await createUser(db, { email: 'pacjentka@example.com', role: 'patient' });
    const other = await createUser(db, { email: 'inna@example.com', role: 'patient' });
    const product = await createProduct(db);
    const repo = new ShopOrderRepository(db);

    expect(await repo.hasPaidOrderForUser(user.id)).toBe(false);

    for (const status of ['pending', 'failed', 'expired'] as const) {
      await createPaidOrder(db, {
        email: user.email,
        userId: user.id,
        productIds: [product.id],
        status,
        paidAt: null,
        confirmationSentAt: null,
      });
    }
    // Paid, same e-mail, but not linked to the account (userId NULL) – not counted
    await createPaidOrder(db, { email: user.email, productIds: [product.id] });
    // Paid order of another user
    await createPaidOrder(db, { email: other.email, userId: other.id, productIds: [product.id] });

    expect(await repo.hasPaidOrderForUser(user.id)).toBe(false);
    expect(await repo.hasPaidOrderForUser(other.id)).toBe(true);
  });

  it('DB error → false and safe log (no throw)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failingDb = {
      select: () => {
        throw Object.assign(new Error('select ... where email = $1 secret@example.com'), { code: '57P01' });
      },
    } as unknown as Database;

    await expect(new ShopOrderRepository(failingDb).hasPaidOrderForUser('u-1')).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalledWith('[ShopOrderRepository] Error checking paid orders:', {
      userId: 'u-1',
      name: 'Error',
      code: '57P01',
      constraint: undefined,
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('secret@example.com');
    errorSpy.mockRestore();
  });
});
