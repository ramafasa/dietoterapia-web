import { describe, it, expect } from 'vitest'
import { createOrderSchema, isValidNip, MAX_ORDER_SLUGS } from '@/schemas/shop'
import { MAX_CART_ITEMS } from '@/lib/services/shopCheckoutService'

const VALID = {
  slugs: ['proteinowa-piekarnia'],
  email: 'anna@example.com',
  acceptTerms: true,
  acceptDigitalContent: true,
}

function messages(input: unknown): string[] {
  const result = createOrderSchema.safeParse(input)
  if (result.success) return []
  return result.error.issues.map((i) => i.message)
}

describe('isValidNip', () => {
  it('accepts a NIP with a correct checksum', () => {
    expect(isValidNip('8272247279')).toBe(true)
  })

  it('rejects a wrong check digit', () => {
    expect(isValidNip('8272247278')).toBe(false)
  })

  it('rejects a NIP whose weighted sum mod 11 is 10 (no valid check digit)', () => {
    // 5 * 2 = 10 → reszta 10, żadna cyfra kontrolna nie pasuje
    for (let d = 0; d <= 9; d++) expect(isValidNip(`020000000${d}`)).toBe(false)
  })

  it.each(['827224727', '82722472790', '827224727a', '', '827-224-72-79'])('rejects non-10-digit input %j', (nip) => {
    expect(isValidNip(nip)).toBe(false)
  })
})

describe('createOrderSchema', () => {
  it('accepts a minimal guest order', () => {
    const result = createOrderSchema.safeParse(VALID)
    expect(result.success).toBe(true)
  })

  it('normalizes e-mail (trim + lowercase)', () => {
    const result = createOrderSchema.parse({ ...VALID, email: '  Anna.Kowalska@Example.COM ' })
    expect(result.email).toBe('anna.kowalska@example.com')
  })

  it('rejects an invalid e-mail with a Polish message', () => {
    expect(messages({ ...VALID, email: 'nie-email' })).toContain('Podaj poprawny adres e-mail')
  })

  it('requires the terms consent', () => {
    expect(messages({ ...VALID, acceptTerms: false })).toEqual(['Zaakceptuj regulamin'])
    expect(messages({ ...VALID, acceptTerms: undefined })).toEqual(['Zaakceptuj regulamin'])
  })

  it('requires the digital content consent', () => {
    const msg = 'Ta zgoda jest wymagana do natychmiastowej wysyłki e-booka'
    expect(messages({ ...VALID, acceptDigitalContent: false })).toEqual([msg])
    expect(messages({ ...VALID, acceptDigitalContent: 'true' })).toEqual([msg])
  })

  it('trims firstName and turns an empty one into undefined', () => {
    expect(createOrderSchema.parse({ ...VALID, firstName: '  Anna ' }).firstName).toBe('Anna')
    expect(createOrderSchema.parse({ ...VALID, firstName: '' }).firstName).toBeUndefined()
    expect(createOrderSchema.parse({ ...VALID, firstName: '   ' }).firstName).toBeUndefined()
  })

  it('validates slugs (1..20, slug format)', () => {
    expect(messages({ ...VALID, slugs: [] })).toEqual(['Koszyk jest pusty'])
    expect(messages({ ...VALID, slugs: ['Zly/Slug'] })).toEqual(['Nieprawidłowy produkt w koszyku'])
    expect(createOrderSchema.safeParse({ ...VALID, slugs: Array.from({ length: 21 }, (_, i) => `p-${i}`) }).success).toBe(false)
    expect(createOrderSchema.safeParse({ ...VALID, slugs: Array.from({ length: 20 }, (_, i) => `p-${i}`) }).success).toBe(true)
  })

  it('keeps the slug limit in sync with the service', () => {
    expect(MAX_ORDER_SLUGS).toBe(MAX_CART_ITEMS)
  })

  describe('invoice', () => {
    const invoice = { companyName: 'Firma sp. z o.o.', nip: '8272247279', address: 'ul. Zdrowa 1, 00-001 Warszawa' }

    it.each(['8272247279', '827 224 72 79', '827-224-72-79', ' 827-22-47-279 '])('accepts NIP %j and strips separators', (nip) => {
      const result = createOrderSchema.parse({ ...VALID, invoice: { ...invoice, nip } })
      expect(result.invoice?.nip).toBe('8272247279')
    })

    it('rejects a NIP with a bad checksum', () => {
      const result = createOrderSchema.safeParse({ ...VALID, invoice: { ...invoice, nip: '8272247278' } })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Nieprawidłowy NIP')
        expect(result.error.issues[0].path).toEqual(['invoice', 'nip'])
      }
    })

    it('rejects a NIP whose checksum remainder is 10', () => {
      expect(messages({ ...VALID, invoice: { ...invoice, nip: '0200000000' } })).toEqual(['Nieprawidłowy NIP'])
    })

    it('requires company name and address', () => {
      expect(messages({ ...VALID, invoice: { ...invoice, companyName: ' ' } })).toEqual(['Podaj nazwę firmy'])
      expect(messages({ ...VALID, invoice: { ...invoice, address: 'ul.' } })).toEqual(['Podaj pełny adres firmy'])
    })
  })

  describe('createAccount', () => {
    it('accepts true/false and is optional', () => {
      expect(createOrderSchema.safeParse({ ...VALID, createAccount: true }).success).toBe(true)
      expect(createOrderSchema.safeParse({ ...VALID, createAccount: false }).success).toBe(true)
      expect(createOrderSchema.safeParse(VALID).success).toBe(true)
    })

    it('rejects non-boolean values', () => {
      expect(createOrderSchema.safeParse({ ...VALID, createAccount: 'yes' }).success).toBe(false)
    })

    it('no longer accepts a password hash at checkout (stripped)', () => {
      const result = createOrderSchema.safeParse({ ...VALID, createAccountPasswordHash: 'a'.repeat(64) })
      expect(result.success).toBe(true)
      expect(result.success && 'createAccountPasswordHash' in result.data).toBe(false)
    })
  })
})
