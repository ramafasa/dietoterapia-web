import { describe, it, expect } from 'vitest'
import { formatOrderNumber } from '@/lib/shop/orderNumber'

describe('formatOrderNumber', () => {
  it('formats ZAM-RRRR-NNNNN with a zero-padded sequence', () => {
    expect(formatOrderNumber(1, new Date('2026-06-15T10:00:00Z'))).toBe('ZAM-2026-00001')
    expect(formatOrderNumber(12345, new Date('2026-06-15T10:00:00Z'))).toBe('ZAM-2026-12345')
  })

  it('does not truncate sequences above 99999', () => {
    expect(formatOrderNumber(123456, new Date('2026-06-15T10:00:00Z'))).toBe('ZAM-2026-123456')
  })

  it('uses the Europe/Warsaw year at the New Year boundary', () => {
    // 23:30 UTC 31 grudnia = 00:30 1 stycznia w Warszawie (CET, UTC+1)
    expect(formatOrderNumber(7, new Date('2026-12-31T23:30:00Z'))).toBe('ZAM-2027-00007')
    expect(formatOrderNumber(7, new Date('2026-12-31T22:30:00Z'))).toBe('ZAM-2026-00007')
  })

  it('accepts bigint-as-string from nextval()', () => {
    expect(formatOrderNumber('42', new Date('2026-06-15T10:00:00Z'))).toBe('ZAM-2026-00042')
  })

  it('rejects non-positive or non-integer sequences', () => {
    expect(() => formatOrderNumber(0, new Date())).toThrow()
    expect(() => formatOrderNumber(1.5, new Date())).toThrow()
    expect(() => formatOrderNumber('abc', new Date())).toThrow()
  })
})
