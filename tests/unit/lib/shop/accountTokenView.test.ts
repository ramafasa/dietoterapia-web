import { describe, it, expect } from 'vitest'
import {
  accountTokenLoginUrl,
  accountTokenPagePath,
  resolveAccountTokenPageState,
} from '@/lib/shop/accountTokenView'

describe('resolveAccountTokenPageState (mirror of handleAccountToken)', () => {
  const tokenEmail = 'anna@example.com'

  it('no account, no session → create', () => {
    expect(resolveAccountTokenPageState({ tokenEmail, accountExists: false, sessionEmail: null })).toBe('create')
  })

  it('no account, other session → different_account', () => {
    expect(
      resolveAccountTokenPageState({ tokenEmail, accountExists: false, sessionEmail: 'ola@example.com' })
    ).toBe('different_account')
  })

  it('account exists, matching session (case-insensitive) → attach', () => {
    expect(
      resolveAccountTokenPageState({ tokenEmail, accountExists: true, sessionEmail: ' Anna@Example.COM ' })
    ).toBe('attach')
  })

  it('account exists, no session → login', () => {
    expect(resolveAccountTokenPageState({ tokenEmail, accountExists: true, sessionEmail: undefined })).toBe('login')
  })

  it('account exists, other session → switch_account', () => {
    expect(
      resolveAccountTokenPageState({ tokenEmail, accountExists: true, sessionEmail: 'ola@example.com' })
    ).toBe('switch_account')
  })
})

describe('account token URLs', () => {
  it('builds the page path and the login URL with an encoded next', () => {
    const token = 'ab'.repeat(32)
    expect(accountTokenPagePath(token)).toBe(`/sklep/konto/${token}`)
    expect(accountTokenLoginUrl(token)).toBe(`/logowanie?next=%2Fsklep%2Fkonto%2F${token}`)
  })

  it('encodes unexpected characters in the token', () => {
    expect(accountTokenPagePath('a/b?c')).toBe('/sklep/konto/a%2Fb%3Fc')
  })
})
