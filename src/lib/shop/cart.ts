// Koszyk: tylko slugi w localStorage. Ceny zawsze z /api/sklep/cart/quote.
// Każdy e-book najwyżej raz, bez ilości. Funkcje wywoływać tylko w przeglądarce —
// import modułu na serwerze (SSR) jest bezpieczny, bo nic nie dotyka `window` na top-level.
const KEY = 'sklep:cart:v1'
const EVENT = 'sklep:cart-changed'

/** Slugi w koszyku. Zwraca [] przy uszkodzonych danych lub niedostępnym localStorage (np. Safari private). */
export function getCart(): string[] {
  try {
    const raw = localStorage.getItem(KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((s): s is string => typeof s === 'string'))]
  } catch {
    return []
  }
}

function save(slugs: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(slugs))
  } catch {
    // localStorage niedostępny/pełny — powiadamiamy i tak, żeby UI w tej karcie był spójny
  }
  window.dispatchEvent(new CustomEvent<string[]>(EVENT, { detail: slugs }))
}

export function addToCart(slug: string) {
  const cart = getCart()
  if (!cart.includes(slug)) save([...cart, slug])
}

export function removeFromCart(slug: string) {
  save(getCart().filter((s) => s !== slug))
}

export function clearCart() {
  save([])
}

/** Subskrypcja zmian koszyka (ta karta + inne karty przez `storage`). Zwraca funkcję odsubskrybowania. */
export function onCartChange(cb: (slugs: string[]) => void): () => void {
  const onLocal = (e: Event) => cb((e as CustomEvent<string[]>).detail)
  // inne karty; key === null oznacza localStorage.clear()
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb(getCart())
  }
  window.addEventListener(EVENT, onLocal)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onLocal)
    window.removeEventListener('storage', onStorage)
  }
}
