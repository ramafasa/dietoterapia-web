/**
 * Integration Tests: ShopAccountService.resolveAccountLinkForOrder (sklep)
 *
 * Real PostgreSQL via Testcontainers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Database } from '@/db'
import { shopAccountTokens } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createUser } from '../../helpers/fixtures'
import { createProduct, createPaidOrder } from '../../fixtures/shop'
import { ShopAccountService } from '@/lib/services/shopAccountService'
import { ShopTokenService } from '@/lib/services/shopTokenService'

let db: Database
let service: ShopAccountService

beforeAll(async () => {
  const result = await startTestDatabase()
  db = result.db
  service = new ShopAccountService(db)
})

afterAll(async () => {
  await stopTestDatabase()
})

beforeEach(async () => {
  await cleanDatabase(db)
})

async function order(overrides: { email?: string; userId?: string | null; accountRequested?: boolean } = {}) {
  const product = await createProduct(db)
  const { order } = await createPaidOrder(db, {
    email: overrides.email ?? 'anna@example.com',
    productIds: [product.id],
    userId: overrides.userId ?? null,
    accountRequested: overrides.accountRequested ?? false,
  })
  return order
}

describe('Integration: ShopAccountService.resolveAccountLinkForOrder', () => {
  it('order with userId → none, no token created', async () => {
    const user = await createUser(db, { email: 'anna@example.com', role: 'customer' })
    const o = await order({ userId: user.id })

    expect(await service.resolveAccountLinkForOrder(o)).toEqual({ kind: 'none' })
    expect(await db.select().from(shopAccountTokens)).toHaveLength(0)
  })

  it('existing account with that e-mail (case-insensitive) → attach + valid account token', async () => {
    await createUser(db, { email: 'Anna@Example.com', role: 'patient' })
    const o = await order()

    const link = await service.resolveAccountLinkForOrder(o)

    expect(link.kind).toBe('attach')
    if (link.kind !== 'attach') return
    expect(await new ShopTokenService(db).peekAccountToken(link.token)).toEqual({ email: 'anna@example.com' })
  })

  it.each([
    [false, false],
    [true, true],
  ])('no account → create + token, emphasized = accountRequested (%s)', async (accountRequested, emphasized) => {
    const o = await order({ accountRequested })

    const link = await service.resolveAccountLinkForOrder(o)

    expect(link).toMatchObject({ kind: 'create', emphasized })
    if (link.kind !== 'create') return
    expect(await new ShopTokenService(db).peekAccountToken(link.token)).toEqual({ email: 'anna@example.com' })
    expect(await db.select().from(shopAccountTokens)).toHaveLength(1)
  })
})
