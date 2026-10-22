import { describe, it, expect, afterEach } from 'vitest'
import type { APIContext } from 'astro'
import { isShopSalesPath, checkShopFeatureEnabled } from '@/lib/shop/guards'

describe('shop guards', () => {
  describe('isShopSalesPath', () => {
    it.each([
      '/sklep',
      '/sklep/',
      '/sklep/proteinowa-piekarnia',
      '/sklep/koszyk',
      '/api/sklep/cart/quote',
      '/api/sklep/orders',
      '/api/sklep/orders/', // pusta końcówka = tworzenie zamówienia
    ])('treats %s as a sales path', (pathname) => {
      expect(isShopSalesPath(pathname)).toBe(true)
    })

    it.each([
      '/sklep/pobierz/abc',
      '/sklep/konto/abc',
      '/sklep/wyslij-link',
      '/sklep/platnosc/sukces',
      '/sklep/platnosc/blad',
      '/api/sklep/pobierz/abc/item-1',
      '/api/sklep/konto/abc',
      '/api/sklep/resend-link',
      '/api/sklep/platnosc/callback',
      '/api/sklep/orders/abc/status',
      '/api/sklep/orders/abc/items/item-1/download',
    ])('treats delivery path %s as always-on (not sales)', (pathname) => {
      expect(isShopSalesPath(pathname)).toBe(false)
    })

    it.each(['/sklepik', '/sklepy/x', '/api/sklepik', '/', '/pzk/kup', '/regulamin-sklepu'])(
      'ignores non-shop path %s',
      (pathname) => {
        expect(isShopSalesPath(pathname)).toBe(false)
      }
    )

    it('matches always-on prefixes only on segment boundaries', () => {
      expect(isShopSalesPath('/sklep/wyslij-linkx')).toBe(true)
      expect(isShopSalesPath('/sklep/pobierzx')).toBe(true)
      expect(isShopSalesPath('/api/sklep/resend-linkx')).toBe(true)
      expect(isShopSalesPath('/api/sklep/platnosc/callbackx')).toBe(true)
      expect(isShopSalesPath('/api/sklep/ordersx')).toBe(true)
    })
  })

  describe('checkShopFeatureEnabled', () => {
    const original = process.env.FF_SKLEP
    afterEach(() => {
      if (original === undefined) delete process.env.FF_SKLEP
      else process.env.FF_SKLEP = original
    })

    it('returns enveloped JSON 404 when FF_SKLEP is off', async () => {
      process.env.FF_SKLEP = 'false'
      const res = checkShopFeatureEnabled({} as APIContext)
      expect(res).not.toBeNull()
      expect(res!.status).toBe(404)
      expect(res!.headers.get('Content-Type')).toBe('application/json')
      expect(await res!.json()).toEqual({
        data: null,
        error: { code: 'not_found', message: 'Nie znaleziono zasobu' },
      })
    })

    it('returns null when FF_SKLEP is on', () => {
      process.env.FF_SKLEP = 'true'
      expect(checkShopFeatureEnabled({} as APIContext)).toBeNull()
    })
  })
})
