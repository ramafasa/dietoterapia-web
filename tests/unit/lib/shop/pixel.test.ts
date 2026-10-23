import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { trackPixel, trackPurchaseOnce, whenPixelReady, pixelValue, type PixelParams } from '@/lib/shop/pixel'

const PARAMS: PixelParams = {
  value: 29,
  currency: 'PLN',
  content_ids: ['proteinowa-piekarnia'],
  content_type: 'product',
}

type Win = Window & { fbq?: unknown }

describe('shop pixel', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    delete (window as Win).fbq
    vi.restoreAllMocks()
  })

  it('trackPixel: no-op without fbq (no consent)', () => {
    expect(() => trackPixel('ViewContent', PARAMS)).not.toThrow()
  })

  it('trackPixel: calls fbq("track", event, params)', () => {
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    trackPixel('AddToCart', { ...PARAMS, num_items: 1 })
    expect(fbq).toHaveBeenCalledWith('track', 'AddToCart', { ...PARAMS, num_items: 1 })
  })

  it('trackPixel: passes only whitelisted fields (no PII smuggled in params)', () => {
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    trackPixel('InitiateCheckout', { ...PARAMS, email: 'anna@example.com' } as unknown as PixelParams)
    const sent = fbq.mock.calls[0][2]
    expect(Object.keys(sent).sort()).toEqual(['content_ids', 'content_type', 'currency', 'value'])
    expect(JSON.stringify(fbq.mock.calls)).not.toContain('@')
  })

  it('trackPixel: fbq throwing does not propagate', () => {
    ;(window as Win).fbq = () => {
      throw new Error('blocked')
    }
    expect(() => trackPixel('ViewContent', PARAMS)).not.toThrow()
  })

  it('trackPurchaseOnce: Purchase only once per order', () => {
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    trackPurchaseOnce('order-1', PARAMS)
    trackPurchaseOnce('order-1', PARAMS)
    trackPurchaseOnce('order-2', PARAMS)
    expect(fbq).toHaveBeenCalledTimes(2)
    expect(fbq).toHaveBeenNthCalledWith(1, 'track', 'Purchase', PARAMS)
    expect(localStorage.getItem('sklep:purchase-tracked:order-1')).toBe('1')
  })

  it('trackPurchaseOnce: localStorage throwing → still tracks, no crash', () => {
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(() => trackPurchaseOnce('order-3', PARAMS)).not.toThrow()
    expect(fbq).toHaveBeenCalledTimes(1)
  })

  it('whenPixelReady: immediately when fbq already exists', () => {
    ;(window as Win).fbq = vi.fn()
    const cb = vi.fn()
    whenPixelReady(cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('whenPixelReady: waits for DOMContentLoaded / load while document is not complete, runs once', () => {
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('interactive')
    const cb = vi.fn()
    whenPixelReady(cb)
    expect(cb).not.toHaveBeenCalled()
    document.dispatchEvent(new Event('DOMContentLoaded'))
    window.dispatchEvent(new Event('load'))
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('pixelValue: decimal string → number', () => {
    expect(pixelValue('29.00')).toBe(29)
    expect(pixelValue('58.5')).toBe(58.5)
  })
})
