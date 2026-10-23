import { describe, it, expect } from 'vitest'
import { safeNextPath, postLoginRedirect } from '@/lib/safeRedirect'
import { homeFor, ROLE_HOME } from '@/lib/roleHome'

describe('safeNextPath', () => {
  it.each([
    ['/sklep/konto/abc', '/sklep/konto/abc'],
    ['/konto/zakupy', '/konto/zakupy'],
    ['/konto/zakupy?tab=1&x=a%20b', '/konto/zakupy?tab=1&x=a%20b'],
    ['/sklep/konto/abc#top', '/sklep/konto/abc#top'],
    ['/', '/'],
    ['/a/./b/../c', '/a/c'],
    ['/%2F%2Fevil.com', '/%2F%2Fevil.com'], // zakodowane "/" zostaje częścią ścieżki – ten sam origin
  ])('accepts %s → %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    '//evil.com',
    '//evil.com/sklep',
    '/\\evil.com',
    '\\\\evil.com',
    '/\\/evil.com',
    'https://evil.com',
    'http://localhost/konto',
    'HTTPS://evil.com',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    ' javascript:alert(1)',
    'data:text/html,hi',
    'evil.com',
    'konto/zakupy',
    '%2F%2Fevil.com',
    '%2f%2fevil.com',
    '/\t/evil.com',
    '/\n/evil.com',
    '/\r//evil.com',
    '/..//evil.com',
    '/./..//evil.com',
  ])('rejects %j', (input) => {
    expect(safeNextPath(input as string | null | undefined)).toBeNull()
  })

  it('rejects overly long values', () => {
    expect(safeNextPath(`/${'a'.repeat(3000)}`)).toBeNull()
  })
})

describe('homeFor', () => {
  it.each([
    ['dietitian', '/dietetyk/dashboard'],
    ['customer', '/konto/zakupy'],
    ['patient', '/pacjent/waga'],
    [undefined, '/'],
    [null, '/'],
    ['admin', '/'],
  ])('%s → %s', (role, expected) => {
    expect(homeFor(role)).toBe(expected)
  })
})

describe('postLoginRedirect', () => {
  it('uses valid next', () => {
    expect(postLoginRedirect('customer', '/sklep/konto/abc')).toBe('/sklep/konto/abc')
  })

  it('falls back to role home when next is missing or unsafe', () => {
    expect(postLoginRedirect('customer', null)).toBe('/konto/zakupy')
    expect(postLoginRedirect('customer', '//evil.com')).toBe('/konto/zakupy')
    expect(postLoginRedirect('dietitian', 'https://evil.com')).toBe('/dietetyk/dashboard')
    expect(postLoginRedirect('patient', 'javascript:alert(1)')).toBe('/pacjent/waga')
    expect(postLoginRedirect(undefined, null)).toBe('/')
  })

  it('uses the role map passed by LoginForm (roleRedirects prop)', () => {
    const map = { ...ROLE_HOME, customer: '/custom/konto', patient: '/custom/pacjent' }
    expect(postLoginRedirect('customer', null, map)).toBe('/custom/konto')
    expect(postLoginRedirect('patient', undefined, map)).toBe('/custom/pacjent')
    expect(postLoginRedirect('dietitian', null, map)).toBe('/dietetyk/dashboard')
    expect(postLoginRedirect('customer', '/sklep/konto/abc', map)).toBe('/sklep/konto/abc')
  })
})
