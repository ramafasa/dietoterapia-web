import { useEffect, useState } from 'react'
import { getCart, onCartChange } from '@/lib/shop/cart'

/** „Koszyk” / „Koszyk, 1 produkt” / „Koszyk, 3 produkty” / „Koszyk, 5 produktów” */
export function cartLabel(count: number): string {
  if (count <= 0) return 'Koszyk'
  const mod10 = count % 10
  const mod100 = count % 100
  const noun =
    count === 1
      ? 'produkt'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'produkty'
        : 'produktów'
  return `Koszyk, ${count} ${noun}`
}

/**
 * Ikona koszyka w nagłówku. SSR i pierwszy render: 0 (localStorage niedostępny na serwerze),
 * faktyczny stan dopiero w useEffect – bez rozjazdu hydratacji.
 */
export default function CartIcon() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    setCount(getCart().length)
    return onCartChange((slugs) => setCount(slugs.length))
  }, [])

  return (
    <a
      href="/sklep/koszyk"
      aria-label={cartLabel(count)}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-neutral-dark transition-colors hover:bg-neutral-light hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
        />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 font-body text-xs font-semibold leading-none text-white"
        >
          {count}
        </span>
      )}
    </a>
  )
}
