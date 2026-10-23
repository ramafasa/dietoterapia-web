/**
 * /konto/zakupy (Task 6.4): mapowanie zakupów na widok – data w czasie polskim, „potwierdzenie w drodze”,
 * okładka po slugu, link pobrania z konta.
 */
import { describe, it, expect } from 'vitest'
import { accountDownloadHref, buildPurchaseViews, formatPurchaseDate } from '@/lib/shop/purchasesView'
import type { UserPurchase } from '@/lib/repositories/shopOrderRepository'

const ITEM_ID = '11111111-1111-4111-8111-111111111111'

function purchase(overrides: Partial<UserPurchase> = {}): UserPurchase {
  return {
    id: 'order-1',
    orderNumber: 'ZAM-2026-00001',
    paidAt: new Date('2026-11-01T10:00:00Z'),
    createdAt: new Date('2026-10-31T09:00:00Z'),
    confirmationSentAt: new Date('2026-11-01T10:01:00Z'),
    items: [{ id: ITEM_ID, title: 'Proteinowa Piekarnia', slug: 'proteinowa-piekarnia' }],
    ...overrides,
  }
}

describe('purchasesView', () => {
  it('formatPurchaseDate: day in Europe/Warsaw, Polish month name', () => {
    expect(formatPurchaseDate(new Date('2026-11-01T10:00:00Z'))).toBe('1 listopada 2026')
    // 23:30 UTC 31 grudnia = 00:30 1 stycznia w Polsce
    expect(formatPurchaseDate(new Date('2026-12-31T23:30:00Z'))).toBe('1 stycznia 2027')
  })

  it('accountDownloadHref points at the account download endpoint', () => {
    expect(accountDownloadHref(ITEM_ID)).toBe(`/api/konto/zakupy/${ITEM_ID}/download`)
  })

  it('maps a confirmed order: ready, date from paidAt, cover by slug, download link', () => {
    const cover = { src: 'cover.jpg' }
    const [view] = buildPurchaseViews([purchase()], new Map([['proteinowa-piekarnia', cover]]))
    expect(view).toEqual({
      id: 'order-1',
      orderNumber: 'ZAM-2026-00001',
      dateLabel: '1 listopada 2026',
      dateIso: '2026-11-01T10:00:00.000Z',
      ready: true,
      items: [
        {
          id: ITEM_ID,
          title: 'Proteinowa Piekarnia',
          cover,
          downloadHref: `/api/konto/zakupy/${ITEM_ID}/download`,
        },
      ],
    })
  })

  it('confirmation not sent yet → not ready', () => {
    const [view] = buildPurchaseViews([purchase({ confirmationSentAt: null })], new Map())
    expect(view.ready).toBe(false)
  })

  it('missing paidAt → createdAt; unknown slug → cover null; order preserved', () => {
    const views = buildPurchaseViews(
      [purchase({ id: 'a', paidAt: null }), purchase({ id: 'b' })],
      new Map<string, string>()
    )
    expect(views.map((v) => v.id)).toEqual(['a', 'b'])
    expect(views[0].dateLabel).toBe('31 października 2026')
    expect(views[0].items[0].cover).toBeNull()
  })

  it('empty input → empty list', () => {
    expect(buildPurchaseViews([], new Map())).toEqual([])
  })
})
