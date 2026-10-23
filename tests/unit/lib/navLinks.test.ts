import { describe, it, expect } from 'vitest'
import { activeNavHref, desktopBreakpointFor, matchesPathBase, navTypeFor, panelNavLinks, patientZoneLink } from '@/lib/navLinks'

const hrefs = (links: { href: string }[]) => links.map((l) => l.href)
const all = { sklepEnabled: true, hasPaidShopOrder: true }
const none = { sklepEnabled: false, hasPaidShopOrder: false }

describe('navTypeFor', () => {
  it.each([
    ['dietitian', 'dietitian'],
    ['patient', 'patient'],
    ['customer', 'customer'],
    ['admin', 'marketing'],
    ['', 'marketing'],
    [null, 'marketing'],
    [undefined, 'marketing'],
  ] as const)('%s → %s', (role, expected) => {
    expect(navTypeFor(role)).toBe(expected)
  })
})

describe('panelNavLinks', () => {
  it('dietitian: Dashboard, Zaproszenia, Zamówienia (with FF_SKLEP)', () => {
    expect(panelNavLinks('dietitian', all)).toEqual([
      { href: '/dietetyk/dashboard', label: 'Dashboard' },
      { href: '/dietetyk/zaproszenia', label: 'Zaproszenia' },
      { href: '/dietetyk/zamowienia', label: 'Zamówienia' },
    ])
  })

  it('dietitian: no Zamówienia without FF_SKLEP', () => {
    expect(hrefs(panelNavLinks('dietitian', none))).toEqual(['/dietetyk/dashboard', '/dietetyk/zaproszenia'])
  })

  it('patient without paid orders and flags: only Waga links', () => {
    expect(hrefs(panelNavLinks('patient', none))).toEqual([
      '/pacjent/waga',
      '/pacjent/waga/historia',
      '/pacjent/ustawienia',
    ])
  })

  it('patient with paid order: "Moje e-booki", no PZK (removed from the menu)', () => {
    const links = panelNavLinks('patient', all)
    expect(hrefs(links)).toEqual([
      '/pacjent/waga',
      '/pacjent/waga/historia',
      '/pacjent/ustawienia',
      '/konto/zakupy',
    ])
    expect(links[3]).toEqual({ href: '/konto/zakupy', label: 'Moje e-booki' })
  })

  it('patient: "Moje e-booki" does not depend on FF_SKLEP (delivery is always on)', () => {
    expect(hrefs(panelNavLinks('patient', { ...none, hasPaidShopOrder: true }))).toContain('/konto/zakupy')
  })

  it('customer: Moje zakupy, Ustawienia, Sklep (with FF_SKLEP) – no Waga, no PZK', () => {
    const links = panelNavLinks('customer', all)
    expect(links).toEqual([
      { href: '/konto/zakupy', label: 'Moje zakupy' },
      { href: '/konto/ustawienia', label: 'Ustawienia' },
      { href: '/sklep', label: 'Sklep' },
    ])
    expect(links.some((l) => l.href.startsWith('/pacjent') || l.href.includes('pzk'))).toBe(false)
  })

  it('customer: no Sklep link without FF_SKLEP', () => {
    expect(hrefs(panelNavLinks('customer', none))).toEqual(['/konto/zakupy', '/konto/ustawienia'])
  })

  it('marketing: no panel links', () => {
    expect(panelNavLinks('marketing', all)).toEqual([])
  })
})

describe('patientZoneLink', () => {
  it('guest: /logowanie only with FF_STREFA_PACJENTA', () => {
    expect(patientZoneLink(null, true)).toBe('/logowanie')
    expect(patientZoneLink(undefined, false)).toBeNull()
  })

  it.each([true, false])('logged in (flag=%s): homeFor(role)', (flag) => {
    expect(patientZoneLink({ role: 'customer' }, flag)).toBe('/konto/zakupy')
    expect(patientZoneLink({ role: 'patient' }, flag)).toBe('/pacjent/waga')
    expect(patientZoneLink({ role: 'dietitian' }, flag)).toBe('/dietetyk/dashboard')
  })

  it('logged in with unknown role: hidden (homeFor would be /)', () => {
    expect(patientZoneLink({ role: 'admin' }, true)).toBeNull()
  })
})

describe('desktopBreakpointFor', () => {
  it.each([
    ['marketing', 'xl'],
    ['patient', 'xl'],
    ['dietitian', 'lg'],
    ['customer', 'lg'],
  ] as const)('%s → %s', (navType, expected) => {
    expect(desktopBreakpointFor(navType)).toBe(expected)
  })
})

describe('matchesPathBase', () => {
  it.each([
    ['/konto', '/konto', true],
    ['/konto/zakupy', '/konto', true],
    ['/kontakt', '/konto', false],
    ['/konto/zakupy-x', '/konto/zakupy', false],
  ] as const)('%s on %s → %s', (path, base, expected) => {
    expect(matchesPathBase(path, base)).toBe(expected)
  })
})

describe('activeNavHref', () => {
  const patient = ['/pacjent/waga', '/pacjent/waga/historia', '/pacjent/ustawienia', '/konto/zakupy']
  const dietitian = ['/dietetyk/dashboard', '/dietetyk/zaproszenia', '/dietetyk/zamowienia']
  const customer = ['/konto/zakupy', '/konto/ustawienia', '/sklep']
  const marketing = ['/', '/o-mnie', '/konsultacje', '/opinie', '/kontakt', '/sklep', '/logowanie']

  it.each([
    // podstrony podświetlają rodzica
    ['/dietetyk/zamowienia/abc-123', dietitian, '/dietetyk/zamowienia'],
    ['/konto/zakupy/123', customer, '/konto/zakupy'],
    ['/sklep/proteinowa-piekarnia', customer, '/sklep'],
    ['/pacjent/waga/historia/2026', patient, '/pacjent/waga/historia'],
    // najbardziej szczegółowy wygrywa (bez podwójnego podświetlenia)
    ['/pacjent/waga', patient, '/pacjent/waga'],
    ['/pacjent/waga/historia', patient, '/pacjent/waga/historia'],
    ['/pacjent/waga/welcome', patient, '/pacjent/waga'],
    // granica segmentu, końcowy ukośnik
    ['/dietetyk/zamowienia-archiwum', dietitian, null],
    ['/konto/zakupy/', customer, '/konto/zakupy'],
    ['/dietetyk/pacjenci/1', dietitian, null],
    // marketing: / tylko dokładnie, PZK poza menu
    ['/', marketing, '/'],
    ['/o-mnie', marketing, '/o-mnie'],
    ['/nieznana', marketing, null],
    ['/pzk/kup', marketing, null],
    ['/kontakt', marketing, '/kontakt'],
  ] as [string, string[], string | null][])('%s → %s', (path, hrefList, expected) => {
    expect(activeNavHref(path, hrefList)).toBe(expected)
  })
})
