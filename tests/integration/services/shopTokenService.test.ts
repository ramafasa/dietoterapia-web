/**
 * Integration Tests: Shop Token Service – download tokens + account tokens (sklep)
 *
 * Real PostgreSQL via Testcontainers.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import * as schema from '@/db/schema'
import type { Database } from '@/db'
import { shopAccountTokens, shopDownloadTokens } from '@/db/schema'
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container'
import { createProduct, createPaidOrder } from '../../fixtures/shop'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { hashToken } from '@/lib/crypto'
import { ACCOUNT_TOKEN_TTL_DAYS, DOWNLOAD_TOKEN_TTL_DAYS } from '@/lib/shop/constants'

const DAY_MS = 24 * 60 * 60 * 1000

let db: Database
let container: StartedPostgreSqlContainer
let service: ShopTokenService

beforeAll(async () => {
  const result = await startTestDatabase()
  db = result.db
  container = result.container
  service = new ShopTokenService(db)
})

afterAll(async () => {
  await stopTestDatabase()
})

beforeEach(async () => {
  await cleanDatabase(db)
})

async function paidOrderId(): Promise<string> {
  const product = await createProduct(db)
  const { order } = await createPaidOrder(db, { email: 'anna@example.com', productIds: [product.id] })
  return order.id
}

describe('Integration: ShopTokenService – download tokens', () => {
  it('creates a 64-hex token, stores only its SHA-256 hash, expiry = now + TTL', async () => {
    const orderId = await paidOrderId()
    const now = new Date('2026-10-01T10:00:00Z')

    const raw = await service.createDownloadToken(orderId, now)

    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    const rows = await db.select().from(shopDownloadTokens)
    expect(rows).toHaveLength(1)
    expect(rows[0].tokenHash).not.toBe(raw)
    expect(rows[0].tokenHash).toBe(await hashToken(raw))
    expect(rows[0].orderId).toBe(orderId)
    expect(rows[0].expiresAt.getTime()).toBe(now.getTime() + DOWNLOAD_TOKEN_TTL_DAYS * DAY_MS)
    expect(rows[0].lastUsedAt).toBeNull()
  })

  it('valid token returns orderId and sets lastUsedAt (repeatable)', async () => {
    const orderId = await paidOrderId()
    const now = new Date('2026-10-01T10:00:00Z')
    const raw = await service.createDownloadToken(orderId, now)

    const usedAt = new Date(now.getTime() + 5 * DAY_MS)
    expect(await service.validateDownloadToken(raw, usedAt)).toEqual({ orderId })

    const [row] = await db.select().from(shopDownloadTokens)
    expect(row.lastUsedAt?.getTime()).toBe(usedAt.getTime())

    const later = new Date(now.getTime() + 6 * DAY_MS)
    expect(await service.validateDownloadToken(raw, later)).toEqual({ orderId })
    const [row2] = await db.select().from(shopDownloadTokens)
    expect(row2.lastUsedAt?.getTime()).toBe(later.getTime())
  })

  it('expired token (now + 31 days) → null; boundary now === expiresAt → null', async () => {
    const orderId = await paidOrderId()
    const now = new Date('2026-10-01T10:00:00Z')
    const raw = await service.createDownloadToken(orderId, now)

    expect(await service.validateDownloadToken(raw, new Date(now.getTime() + 31 * DAY_MS))).toBeNull()
    expect(
      await service.validateDownloadToken(raw, new Date(now.getTime() + DOWNLOAD_TOKEN_TTL_DAYS * DAY_MS))
    ).toBeNull()
    expect(
      await service.validateDownloadToken(raw, new Date(now.getTime() + DOWNLOAD_TOKEN_TTL_DAYS * DAY_MS - 1))
    ).toEqual({ orderId })
  })

  it('lastUsedAt update failure does not deny the download (logged without the token)', async () => {
    const orderId = await paidOrderId()
    const raw = await service.createDownloadToken(orderId)
    const failingUpdateDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === 'update') {
          return () => {
            throw new Error(`update failed for ${raw}`)
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(await new ShopTokenService(failingUpdateDb).validateDownloadToken(raw)).toEqual({ orderId })
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(raw)
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('wrong or malformed token → null', async () => {
    const orderId = await paidOrderId()
    const raw = await service.createDownloadToken(orderId)

    expect(await service.validateDownloadToken('f'.repeat(64))).toBeNull()
    expect(await service.validateDownloadToken('')).toBeNull()
    expect(await service.validateDownloadToken('abc')).toBeNull()
    expect(await service.validateDownloadToken(raw.toUpperCase())).toBeNull()
    expect(await service.validateDownloadToken(raw + '0')).toBeNull()
    expect(await service.validateDownloadToken(await hashToken(raw))).toBeNull()
  })
})

describe('Integration: ShopTokenService – account tokens', () => {
  it('creates token with lowercased email, stores only hash, expiry = now + TTL', async () => {
    const now = new Date('2026-10-01T10:00:00Z')

    const raw = await service.createAccountToken('  Anna@Example.COM ', now)

    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    const rows = await db.select().from(shopAccountTokens)
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('anna@example.com')
    expect(rows[0].tokenHash).not.toBe(raw)
    expect(rows[0].tokenHash).toBe(await hashToken(raw))
    expect(rows[0].expiresAt.getTime()).toBe(now.getTime() + ACCOUNT_TOKEN_TTL_DAYS * DAY_MS)
    expect(rows[0].usedAt).toBeNull()
  })

  it('peek does not consume (twice OK), then consume OK and sets usedAt', async () => {
    const raw = await service.createAccountToken('anna@example.com')

    expect(await service.peekAccountToken(raw)).toEqual({ email: 'anna@example.com' })
    expect(await service.peekAccountToken(raw)).toEqual({ email: 'anna@example.com' })

    const consumedAt = new Date()
    expect(await service.consumeAccountToken(raw, consumedAt)).toEqual({ email: 'anna@example.com' })
    const [row] = await db.select().from(shopAccountTokens)
    expect(row.usedAt?.getTime()).toBe(consumedAt.getTime())
  })

  it('consume twice → second null; peek after consume → null', async () => {
    const raw = await service.createAccountToken('anna@example.com')

    expect(await service.consumeAccountToken(raw)).toEqual({ email: 'anna@example.com' })
    expect(await service.consumeAccountToken(raw)).toBeNull()
    expect(await service.peekAccountToken(raw)).toBeNull()
  })

  it('expired → null for peek and consume (token stays unused)', async () => {
    const now = new Date('2026-10-01T10:00:00Z')
    const raw = await service.createAccountToken('anna@example.com', now)
    const expired = new Date(now.getTime() + 31 * DAY_MS)
    const boundary = new Date(now.getTime() + ACCOUNT_TOKEN_TTL_DAYS * DAY_MS)

    expect(await service.peekAccountToken(raw, expired)).toBeNull()
    expect(await service.consumeAccountToken(raw, expired)).toBeNull()
    expect(await service.peekAccountToken(raw, boundary)).toBeNull()
    expect(await service.consumeAccountToken(raw, boundary)).toBeNull()

    const [row] = await db.select().from(shopAccountTokens)
    expect(row.usedAt).toBeNull()
  })

  it('wrong or malformed token → null', async () => {
    const raw = await service.createAccountToken('anna@example.com')

    for (const bad of ['', 'abc', 'f'.repeat(64), raw.toUpperCase(), raw + '0', await hashToken(raw)]) {
      expect(await service.peekAccountToken(bad)).toBeNull()
      expect(await service.consumeAccountToken(bad)).toBeNull()
    }
    expect(await service.consumeAccountToken(raw)).toEqual({ email: 'anna@example.com' })
  })

  it('concurrent consumes on separate connections → exactly one wins', async () => {
    const raw = await service.createAccountToken('anna@example.com')
    // Główny klient testowy ma max: 1 połączenie (zapytania szłyby sekwencyjnie) –
    // osobna pula, żeby UPDATE-y faktycznie rywalizowały w Postgresie.
    const sql = postgres(container.getConnectionUri(), { max: 3 })
    try {
      const poolService = new ShopTokenService(drizzle(sql, { schema }) as unknown as Database)
      const results = await Promise.all([
        poolService.consumeAccountToken(raw),
        poolService.consumeAccountToken(raw),
        poolService.consumeAccountToken(raw),
      ])

      expect(results.filter((r) => r !== null)).toEqual([{ email: 'anna@example.com' }])
    } finally {
      await sql.end({ timeout: 5 })
    }
  })

  it('consume inside a rolled-back transaction leaves the token unused', async () => {
    const raw = await service.createAccountToken('anna@example.com')

    await expect(
      db.transaction(async (tx) => {
        const txService = new ShopTokenService(tx as unknown as Database)
        expect(await txService.consumeAccountToken(raw)).toEqual({ email: 'anna@example.com' })
        throw new Error('rollback')
      })
    ).rejects.toThrow('rollback')

    const [row] = await db.select().from(shopAccountTokens).where(eq(shopAccountTokens.email, 'anna@example.com'))
    expect(row.usedAt).toBeNull()
    expect(await service.consumeAccountToken(raw)).toEqual({ email: 'anna@example.com' })
  })
})
