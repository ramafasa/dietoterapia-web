import { describe, it, expect, vi, afterEach } from 'vitest'

// Strażnik SSR: import modułu nie może dotykać window/localStorage na top-level.
// (środowisko node odpada — wspólny tests/setup/test-setup.ts używa `window` na top-level.)
describe('cart (SSR)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('can be imported without window/localStorage', async () => {
    vi.resetModules()
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('localStorage', undefined)
    const mod = await import('@/lib/shop/cart')
    expect(typeof mod.getCart).toBe('function')
    expect(mod.getCart()).toEqual([]) // brak localStorage → [] zamiast wyjątku
  })
})
