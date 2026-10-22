import { useState } from 'react'
import toast from 'react-hot-toast'
import { addToCart } from '@/lib/shop/cart'

const CART_URL = '/sklep/koszyk'
const SAVE_ERROR = 'Nie udało się zapisać koszyka. Sprawdź, czy przeglądarka nie blokuje danych witryny.'

interface Props {
  slug: string
  title: string
}

/**
 * Przyciski zakupu na stronie produktu (jedna wyspa, żeby nie hydratować dwóch):
 * - „Kup teraz” → dodaje do koszyka i przechodzi do /sklep/koszyk
 * - „Dodaj do koszyka i kontynuuj zakupy” → dodaje, pokazuje toast, zostaje na stronie
 */
export default function AddToCartButton({ slug, title }: Props) {
  // 'buy-now' zostaje ustawione do końca nawigacji – blokuje ponowne kliknięcia
  const [pending, setPending] = useState<'buy-now' | 'add' | null>(null)

  const handleBuyNow = () => {
    if (pending) return
    setPending('buy-now')
    if (!addToCart(slug)) {
      toast.error(SAVE_ERROR)
      setPending(null)
      return
    }
    window.location.assign(CART_URL)
  }

  const handleAdd = () => {
    if (pending) return
    setPending('add')
    if (addToCart(slug)) {
      toast.success('Dodano do koszyka')
    } else {
      toast.error(SAVE_ERROR)
    }
    setPending(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleBuyNow}
        disabled={pending !== null}
        aria-busy={pending === 'buy-now'}
        aria-label={`Kup teraz: ${title}`}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-body text-lg font-semibold text-white shadow-soft transition-all duration-200 hover:bg-primary-dark hover:shadow-soft-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-70"
      >
        {pending === 'buy-now' ? (
          <>
            <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Przechodzę do koszyka…
          </>
        ) : (
          'Kup teraz'
        )}
      </button>
      <button
        type="button"
        onClick={handleAdd}
        disabled={pending !== null}
        aria-label={`Dodaj do koszyka i kontynuuj zakupy: ${title}`}
        className="inline-flex w-full items-center justify-center rounded-xl border-2 border-primary/30 bg-white px-6 py-3 font-body font-semibold text-primary transition-colors duration-200 hover:border-primary hover:bg-primary/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Dodaj do koszyka i kontynuuj zakupy
      </button>
    </div>
  )
}
