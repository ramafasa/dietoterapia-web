import { describe, it, expect, vi } from 'vitest'
import {
  hashesEqual,
  isUuid,
  parseCheckoutCookie,
  readCheckoutCookie,
  verifyCheckoutSecret,
} from '@/lib/shop/checkoutCookie'
import { hashToken } from '@/lib/crypto'
import { CHECKOUT_COOKIE, CHECKOUT_SECRET_TTL_HOURS } from '@/lib/shop/constants'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ID = '22222222-2222-4222-8222-222222222222'
const SECRET = 'ab'.repeat(32)
const NOW = new Date('2026-11-05T12:00:00Z')

function cookiesWith(value?: string) {
  return {
    get: vi.fn((name: string) => (name === CHECKOUT_COOKIE && value !== undefined ? { value } : undefined)),
  } as any
}

async function orderFor(secret = SECRET, createdAt = new Date(NOW.getTime() - 60_000)) {
  return { checkoutSecretHash: await hashToken(secret), createdAt, extra: 'x' }
}

describe('parseCheckoutCookie', () => {
  it('parses `${uuid}.${64 hex}`', () => {
    expect(parseCheckoutCookie(`${ORDER_ID}.${SECRET}`)).toEqual({ orderId: ORDER_ID, secret: SECRET })
  })

  it('normalizes the order id to lowercase', () => {
    expect(parseCheckoutCookie(`${ORDER_ID.toUpperCase()}.${SECRET}`)?.orderId).toBe(ORDER_ID)
  })

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty', ''],
    ['no dot', `${ORDER_ID}${SECRET}`],
    ['too many parts', `${ORDER_ID}.${SECRET}.x`],
    ['bad uuid', `not-a-uuid.${SECRET}`],
    ['short secret', `${ORDER_ID}.${'a'.repeat(63)}`],
    ['long secret', `${ORDER_ID}.${'a'.repeat(65)}`],
    ['non-hex secret', `${ORDER_ID}.${'g'.repeat(64)}`],
    ['uppercase secret', `${ORDER_ID}.${SECRET.toUpperCase()}`],
    ['empty secret', `${ORDER_ID}.`],
  ])('returns null for %s', (_label, value) => {
    expect(parseCheckoutCookie(value as string | undefined)).toBeNull()
  })
})

describe('isUuid / hashesEqual', () => {
  it('validates uuids', () => {
    expect(isUuid(ORDER_ID)).toBe(true)
    expect(isUuid('abc')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
  })

  it('compares hashes (different lengths → false, no throw)', () => {
    expect(hashesEqual('abc', 'abc')).toBe(true)
    expect(hashesEqual('abc', 'abd')).toBe(false)
    expect(hashesEqual('abc', 'abcd')).toBe(false)
  })
})

describe('verifyCheckoutSecret', () => {
  it('accepts the matching secret within the TTL', async () => {
    expect(await verifyCheckoutSecret(SECRET, await orderFor(), NOW)).toBe(true)
  })

  it('rejects a wrong secret', async () => {
    expect(await verifyCheckoutSecret('cd'.repeat(32), await orderFor(), NOW)).toBe(false)
  })

  it('rejects when the order has no secret hash', async () => {
    expect(await verifyCheckoutSecret(SECRET, { checkoutSecretHash: null, createdAt: NOW }, NOW)).toBe(false)
  })

  it('rejects exactly at and after createdAt + TTL', async () => {
    const ttlMs = CHECKOUT_SECRET_TTL_HOURS * 3600 * 1000
    expect(await verifyCheckoutSecret(SECRET, await orderFor(SECRET, new Date(NOW.getTime() - ttlMs)), NOW)).toBe(false)
    expect(await verifyCheckoutSecret(SECRET, await orderFor(SECRET, new Date(NOW.getTime() - ttlMs + 1000)), NOW)).toBe(true)
  })
})

describe('readCheckoutCookie', () => {
  it('returns missing_or_invalid without a cookie and does not load the order', async () => {
    const load = vi.fn()
    expect(await readCheckoutCookie(cookiesWith(), ORDER_ID, load, NOW)).toEqual({ status: 'missing_or_invalid' })
    expect(load).not.toHaveBeenCalled()
  })

  it('returns missing_or_invalid for a malformed cookie without loading', async () => {
    const load = vi.fn()
    expect(await readCheckoutCookie(cookiesWith('garbage'), ORDER_ID, load, NOW)).toEqual({ status: 'missing_or_invalid' })
    expect(load).not.toHaveBeenCalled()
  })

  it('returns mismatch for a well-formed cookie of another order without loading', async () => {
    const load = vi.fn()
    expect(await readCheckoutCookie(cookiesWith(`${OTHER_ID}.${SECRET}`), ORDER_ID, load, NOW)).toEqual({
      status: 'mismatch',
    })
    expect(load).not.toHaveBeenCalled()
  })

  it('returns valid with the loaded order (loaded exactly once)', async () => {
    const order = await orderFor()
    const load = vi.fn().mockResolvedValue(order)
    const result = await readCheckoutCookie(cookiesWith(`${ORDER_ID}.${SECRET}`), ORDER_ID.toUpperCase(), load, NOW)
    expect(result).toEqual({ status: 'valid', order })
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith(ORDER_ID)
  })

  it('returns missing_or_invalid when the order does not exist', async () => {
    const load = vi.fn().mockResolvedValue(null)
    expect(await readCheckoutCookie(cookiesWith(`${ORDER_ID}.${SECRET}`), ORDER_ID, load, NOW)).toEqual({
      status: 'missing_or_invalid',
    })
  })

  it('returns missing_or_invalid for a wrong secret or an expired order', async () => {
    const wrong = vi.fn().mockResolvedValue(await orderFor('cd'.repeat(32)))
    expect((await readCheckoutCookie(cookiesWith(`${ORDER_ID}.${SECRET}`), ORDER_ID, wrong, NOW)).status).toBe(
      'missing_or_invalid'
    )

    const expired = vi.fn().mockResolvedValue(await orderFor(SECRET, new Date(NOW.getTime() - 25 * 3600 * 1000)))
    expect((await readCheckoutCookie(cookiesWith(`${ORDER_ID}.${SECRET}`), ORDER_ID, expired, NOW)).status).toBe(
      'missing_or_invalid'
    )
  })
})
