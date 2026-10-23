/**
 * LoginForm: link „Utwórz nowe konto” (rejestracja pacjenta) zależy od `showSignupLink`.
 * `/logowanie` przekazuje `showSignupLink={isFeatureEnabled('STREFA_PACJENTA')}` – logowanie działa zawsze,
 * tylko rejestracja jest ukryta przy FF_STREFA_PACJENTA=false (decyzja 2026-10-23).
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import LoginForm from '@/components/LoginForm'

describe('LoginForm – link rejestracji', () => {
  afterEach(() => cleanup())

  it('domyślnie pokazuje link „Utwórz nowe konto”', () => {
    render(<LoginForm />)
    expect(screen.getByText('Utwórz nowe konto')).toBeTruthy()
  })

  it('showSignupLink=false (FF_STREFA_PACJENTA=false) – formularz jest, linku rejestracji nie ma', () => {
    render(<LoginForm showSignupLink={false} />)
    expect(screen.queryByText('Utwórz nowe konto')).toBeNull()
    expect(screen.getByText('Zaloguj się')).toBeTruthy()
    expect(screen.getByText('Zapomniałeś hasła?')).toBeTruthy()
  })
})
