import { describe, it, expect } from 'vitest'
import { desktopBreakpointFor, navTypeFor, panelNavLinks, patientZoneLink } from '@/lib/navLinks'

const hrefs = (links: { href: string }[]) => links.map((l) => l.href)
const all = { pzkEnabled: true, sklepEnabled: true, hasPaidShopOrder: true }
const none = { pzkEnabled: false, sklepEnabled: false, hasPaidShopOrder: false }

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
  it('dietitian: Dashboard, Zaproszenia, Zamówienia (independent of flags)', () => {
    expect(panelNavLinks('dietitian', none)).toEqual([
      { href: '/dietetyk/dashboard', label: 'Dashboard' },
      { href: '/dietetyk/zaproszenia', label: 'Zaproszenia' },
      { href: '/dietetyk/zamowienia', label: 'Zamówienia' },
    ])
    expect(panelNavLinks('dietitian', all)).toEqual(panelNavLinks('dietitian', none))
  })

  it('patient without paid orders and flags: only Waga links', () => {
    expect(hrefs(panelNavLinks('patient', none))).toEqual([
      '/pacjent/waga',
      '/pacjent/waga/historia',
      '/pacjent/ustawienia',
    ])
  })

  it('patient with paid order: "Moje e-booki" before PZK (emphasized)', () => {
    const links = panelNavLinks('patient', all)
    expect(hrefs(links)).toEqual([
      '/pacjent/waga',
      '/pacjent/waga/historia',
      '/pacjent/ustawienia',
      '/konto/zakupy',
      '/pacjent/pzk',
    ])
    expect(links[3]).toEqual({ href: '/konto/zakupy', label: 'Moje e-booki' })
    expect(links[4].emphasized).toBe(true)
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
