import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getCart, addToCart, removeFromCart, clearCart, onCartChange } from '@/lib/shop/cart'

const KEY = 'sklep:cart:v1'

describe('cart', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts empty', () => {
    expect(getCart()).toEqual([])
  })

  it('addToCart is idempotent (each e-book at most once)', () => {
    addToCart('a')
    addToCart('b')
    addToCart('a')
    expect(getCart()).toEqual(['a', 'b'])
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(['a', 'b'])
  })

  it('returns true when the write succeeds', () => {
    expect(addToCart('a')).toBe(true)
    expect(addToCart('a')).toBe(true) // już w koszyku — nic do zapisu
    expect(removeFromCart('a')).toBe(true)
    expect(clearCart()).toBe(true)
  })

  it('removeFromCart of a missing slug does not write or emit and returns true', () => {
    addToCart('a')
    const cb = vi.fn()
    const off = onCartChange(cb)
    const spy = vi.spyOn(localStorage, 'setItem')
    expect(removeFromCart('missing')).toBe(true)
    expect(cb).not.toHaveBeenCalled()
    expect(spy).not.toHaveBeenCalled()
    expect(getCart()).toEqual(['a'])
    off()
  })

  it('removeFromCart removes the slug', () => {
    addToCart('a')
    addToCart('b')
    removeFromCart('a')
    expect(getCart()).toEqual(['b'])
  })

  it('clearCart empties the cart', () => {
    addToCart('a')
    clearCart()
    expect(getCart()).toEqual([])
  })

  it('returns [] for corrupted JSON', () => {
    localStorage.setItem(KEY, '{not json')
    expect(getCart()).toEqual([])
  })

  it('returns [] for non-array JSON', () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }))
    expect(getCart()).toEqual([])
  })

  it('filters out non-string entries and duplicates', () => {
    localStorage.setItem(KEY, JSON.stringify(['a', 1, null, 'b', { x: 1 }, 'a']))
    expect(getCart()).toEqual(['a', 'b'])
  })

  it('returns [] when localStorage.getItem throws', () => {
    const spy = vi.fn(() => {
      throw new Error('SecurityError')
    })
    vi.stubGlobal('localStorage', { getItem: spy })
    expect(getCart()).toEqual([])
    expect(spy).toHaveBeenCalled()
  })

  it('addToCart does not throw when localStorage.setItem throws', () => {
    const spy = vi.fn(() => {
      throw new Error('QuotaExceededError')
    })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: spy })
    const cb = vi.fn()
    const off = onCartChange(cb)
    let result: boolean | undefined
    expect(() => {
      result = addToCart('a')
    }).not.toThrow()
    expect(spy).toHaveBeenCalled()
    expect(result).toBe(false)
    expect(cb).toHaveBeenCalledWith(['a'])
    off()
  })

  it('fires change callback with the new slugs', () => {
    const cb = vi.fn()
    const off = onCartChange(cb)
    addToCart('a')
    expect(cb).toHaveBeenLastCalledWith(['a'])
    addToCart('b')
    expect(cb).toHaveBeenLastCalledWith(['a', 'b'])
    removeFromCart('a')
    expect(cb).toHaveBeenLastCalledWith(['b'])
    clearCart()
    expect(cb).toHaveBeenLastCalledWith([])
    off()
  })

  it('does not fire when adding a slug already in the cart', () => {
    addToCart('a')
    const cb = vi.fn()
    const off = onCartChange(cb)
    addToCart('a')
    expect(cb).not.toHaveBeenCalled()
    off()
  })

  it('unsubscribe stops callbacks', () => {
    const cb = vi.fn()
    const off = onCartChange(cb)
    off()
    addToCart('a')
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(cb).not.toHaveBeenCalled()
  })

  it('storage event from another tab triggers callback with current cart', () => {
    const cb = vi.fn()
    const off = onCartChange(cb)
    localStorage.setItem(KEY, JSON.stringify(['x', 'y']))
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }))
    expect(cb).toHaveBeenCalledWith(['x', 'y'])
    off()
  })

  it('storage clear in another tab (key === null) triggers callback', () => {
    const cb = vi.fn()
    const off = onCartChange(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(cb).toHaveBeenCalledWith([])
    off()
  })

  it('ignores storage events for unrelated keys', () => {
    const cb = vi.fn()
    const off = onCartChange(cb)
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }))
    expect(cb).not.toHaveBeenCalled()
    off()
  })
})
