/**
 * AddToCartButton (Task 2.6 + 7.1): dodanie do koszyka + Meta Pixel AddToCart (tylko przy nowym produkcie).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddToCartButton from '@/components/sklep/AddToCartButton'
import { getCart } from '@/lib/shop/cart'

type Win = Window & { fbq?: unknown }

describe('AddToCartButton – Meta Pixel', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    delete (window as Win).fbq
  })

  it('tracks AddToCart with slug + price (no PII) only the first time', () => {
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    render(<AddToCartButton slug="proteinowa-piekarnia" title="Proteinowa Piekarnia" price="29.00" />)
    const add = screen.getByRole('button', { name: /Dodaj do koszyka/ })
    fireEvent.click(add)
    fireEvent.click(add)
    expect(getCart()).toEqual(['proteinowa-piekarnia'])
    expect(fbq).toHaveBeenCalledTimes(1)
    expect(fbq).toHaveBeenCalledWith('track', 'AddToCart', {
      value: 29,
      currency: 'PLN',
      content_ids: ['proteinowa-piekarnia'],
      content_type: 'product',
    })
  })

  it('works without fbq (no marketing consent)', () => {
    render(<AddToCartButton slug="proteinowa-piekarnia" title="Proteinowa Piekarnia" price="29.00" />)
    fireEvent.click(screen.getByRole('button', { name: /Dodaj do koszyka/ }))
    expect(getCart()).toEqual(['proteinowa-piekarnia'])
  })
})
