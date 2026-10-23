/**
 * Nawigacja nagłówka – czysta logika (bez Astro), żeby dało się ją testować.
 *
 * Header.astro wybiera typ nawigacji z roli zalogowanego użytkownika (`navTypeFor`),
 * a linki panelu bierze z `panelNavLinks`. Strony `/konto/*` (Task 6.4/6.5) nie muszą nic
 * przekazywać – nagłówek sam pokaże nawigację klientki dla `customer`, a pacjentce/dietetyczce ich własną.
 */
import { homeFor } from './roleHome'

export type NavType = 'marketing' | 'dietitian' | 'patient' | 'customer'

export interface NavLink {
  href: string
  label: string
  /** Wyróżnienie (font-bold), np. PZK. */
  emphasized?: boolean
}

export interface NavOptions {
  pzkEnabled: boolean
  sklepEnabled: boolean
  /** Pacjentka ma ≥1 opłacone zamówienie w sklepie (link „Moje e-booki”). */
  hasPaidShopOrder?: boolean
}

/** Nieznana rola i gość → nawigacja marketingowa. */
export function navTypeFor(role?: string | null): NavType {
  if (role === 'dietitian') return 'dietitian'
  if (role === 'patient') return 'patient'
  if (role === 'customer') return 'customer'
  return 'marketing'
}

/**
 * Od jakiej szerokości nawigacja mieści się w jednej linii (poniżej – hamburger).
 * Marketing (8 pozycji + CTA) i pacjentka (do 5 linków, w tym długi „Przestrzeń Zdrowej Kobiety”) – xl,
 * dietetyk i klientka sklepu (3 krótkie linki) – lg.
 */
export function desktopBreakpointFor(navType: NavType): 'lg' | 'xl' {
  return navType === 'dietitian' || navType === 'customer' ? 'lg' : 'xl'
}

/** Linki nawigacji panelu (dietetyk / pacjent / klientka sklepu). Dla `marketing` – pusta lista. */
export function panelNavLinks(navType: NavType, options: NavOptions): NavLink[] {
  switch (navType) {
    case 'dietitian':
      return [
        { href: '/dietetyk/dashboard', label: 'Dashboard' },
        { href: '/dietetyk/zaproszenia', label: 'Zaproszenia' },
        { href: '/dietetyk/zamowienia', label: 'Zamówienia' },
      ]
    case 'patient':
      return [
        { href: '/pacjent/waga', label: 'Dashboard' },
        { href: '/pacjent/waga/historia', label: 'Historia' },
        { href: '/pacjent/ustawienia', label: 'Ustawienia' },
        ...(options.hasPaidShopOrder ? [{ href: '/konto/zakupy', label: 'Moje e-booki' }] : []),
        ...(options.pzkEnabled
          ? [{ href: '/pacjent/pzk', label: 'Przestrzeń Zdrowej Kobiety', emphasized: true }]
          : []),
      ]
    case 'customer':
      // Bez Wagi i PZK – customer nie ma dostępu do /pacjent/* (RBAC przekierowuje na /konto/zakupy).
      return [
        { href: '/konto/zakupy', label: 'Moje zakupy' },
        { href: '/konto/ustawienia', label: 'Ustawienia' },
        ...(options.sklepEnabled ? [{ href: '/sklep', label: 'Sklep' }] : []),
      ]
    case 'marketing':
      return []
  }
}

/**
 * Przycisk „Strefa pacjenta” w nawigacji marketingowej.
 * - gość: `/logowanie`, tylko przy FF_STREFA_PACJENTA,
 * - zalogowany: zawsze `homeFor(role)` (bez odbijania się od RBAC); dla nieznanej roli `homeFor` daje `/`,
 *   więc przycisk nie ma sensu i go nie pokazujemy.
 */
export function patientZoneLink(
  user: { role?: string | null } | null | undefined,
  strefaPacjentaEnabled: boolean
): string | null {
  if (!user) return strefaPacjentaEnabled ? '/logowanie' : null
  const home = homeFor(user.role)
  return home === '/' ? null : home
}
