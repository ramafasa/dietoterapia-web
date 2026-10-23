import { describe, expect, it } from 'vitest'
import { maskEmail } from '@/lib/shop/maskEmail'

describe('maskEmail', () => {
  it('keeps the first letter and the domain', () => {
    expect(maskEmail('anna@gmail.com')).toBe('a***@gmail.com')
  })

  it('handles a one-letter local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com')
  })

  it('trims whitespace', () => {
    expect(maskEmail('  zosia.kowalska@wp.pl ')).toBe('z***@wp.pl')
  })

  it('uses the last @ (local part with quoted @)', () => {
    expect(maskEmail('"a@b"@example.com')).toBe('"***@example.com')
  })

  it('keeps a multi-byte first character intact', () => {
    expect(maskEmail('łucja@example.com')).toBe('ł***@example.com')
  })

  it.each([['', ], ['no-at-sign'], ['@example.com'], ['anna@'], [null], [undefined]])(
    'returns *** for invalid input %j',
    (value) => {
      expect(maskEmail(value as string | null | undefined)).toBe('***')
    }
  )
})
