import { describe, it, expect } from 'vitest'
import { toGrosze, fromGrosze, sumPrices, formatPLN } from '@/lib/shop/money'

describe('money', () => {
  describe('toGrosze', () => {
    it('parses decimal strings to integer grosze', () => {
      expect(toGrosze('29.00')).toBe(2900)
      expect(toGrosze('0.10')).toBe(10)
      expect(toGrosze('29')).toBe(2900)
    })

    it('pads single-digit fractional part', () => {
      expect(toGrosze('29.5')).toBe(2950)
    })

    it('rejects malformed input', () => {
      expect(() => toGrosze('29,00')).toThrow()
      expect(() => toGrosze('-1.00')).toThrow()
      expect(() => toGrosze('')).toThrow()
      expect(() => toGrosze('29.001')).toThrow()
      expect(() => toGrosze('29.')).toThrow()
      expect(() => toGrosze('abc')).toThrow()
    })
  })

  describe('fromGrosze', () => {
    it('formats grosze as decimal string', () => {
      expect(fromGrosze(2900)).toBe('29.00')
      expect(fromGrosze(5)).toBe('0.05')
      expect(fromGrosze(0)).toBe('0.00')
    })

    it('rejects negative and non-integer values', () => {
      expect(() => fromGrosze(-1)).toThrow()
      expect(() => fromGrosze(1.5)).toThrow()
      expect(() => fromGrosze(Number.NaN)).toThrow()
    })

    it('round-trips with toGrosze', () => {
      expect(fromGrosze(toGrosze('349.99'))).toBe('349.99')
    })
  })

  describe('sumPrices', () => {
    it('sums without float errors', () => {
      expect(sumPrices(['0.10', '0.20'])).toBe('0.30')
    })

    it('returns 0.00 for empty list', () => {
      expect(sumPrices([])).toBe('0.00')
    })
  })

  describe('formatPLN', () => {
    it('formats decimal string with Polish comma and currency', () => {
      expect(formatPLN('29.00')).toBe('29,00 zł')
    })
  })
})
