// Zdarzenia Meta Pixel sklepu (tylko w przeglądarce).
// fbq istnieje tylko po zgodzie na cookies marketingowe (MetaPixel.astro) – bez zgody to no-op.
// Do fbq trafiają wyłącznie dane produktu: slugi, kwota, waluta. NIGDY e-mail, imię ani dane do faktury.

export type PixelEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase'

export interface PixelParams {
  value: number
  currency: 'PLN'
  content_ids: string[] // slugi produktów
  content_type: 'product'
  num_items?: number
}

type Fbq = (command: 'track', event: PixelEvent, params: PixelParams) => void

/** Zwraca true, gdy zdarzenie trafiło do fbq (jest zgoda i fbq nie rzucił błędem). */
export function trackPixel(event: PixelEvent, params: PixelParams): boolean {
  if (typeof window === 'undefined') return false
  const fbq = (window as unknown as { fbq?: Fbq }).fbq
  if (typeof fbq !== 'function') return false
  try {
    // kopia – bez przypadkowych dodatkowych pól przekazanych przez wywołującego
    const safe: PixelParams = {
      value: params.value,
      currency: params.currency,
      content_ids: [...params.content_ids],
      content_type: params.content_type,
    }
    if (params.num_items !== undefined) safe.num_items = params.num_items
    fbq('track', event, safe)
    return true
  } catch {
    // błąd skryptu Meta nie może psuć zakupu
    return false
  }
}

/**
 * Purchase najwyżej raz na zamówienie w tej przeglądarce (odświeżenie strony sukcesu nie dubluje).
 * Znacznik w localStorage zapisywany TYLKO po wysłaniu zdarzenia: bez fbq (brak zgody) nic nie
 * zapisujemy. Zgoda w CookieBanner przeładowuje stronę (MetaPixel.astro inicjalizuje fbq tylko przy
 * ładowaniu – nie ma zdarzenia „Pixel gotowy” po zgodzie), więc strona sukcesu po przeładowaniu
 * odpyta status jeszcze raz i wyśle Purchase. Zwraca true, gdy zdarzenie poszło teraz.
 */
export function trackPurchaseOnce(orderId: string, params: PixelParams): boolean {
  const key = `sklep:purchase-tracked:${orderId}`
  try {
    if (localStorage.getItem(key)) return false
  } catch {
    // localStorage niedostępny – śledzimy i tak (lepiej ewentualny duplikat niż brak konwersji)
  }
  if (!trackPixel('Purchase', params)) return false
  try {
    localStorage.setItem(key, '1')
  } catch {
    // jw.
  }
  return true
}

/**
 * Wywołuje `cb` (raz), gdy skrypt MetaPixel.astro miał szansę utworzyć fbq. Inline-skrypt Pixela
 * w <head> inicjalizuje się na DOMContentLoaded (rejestruje listener wcześniej niż ten kod).
 * Skrypty modułowe (Astro <script>, wyspy) działają już przy readyState 'interactive', czasem
 * PRZED DOMContentLoaded, czasem po nim – stąd DOMContentLoaded albo `load` (zawsze po DCL),
 * co pierwsze. Gdy dokument jest 'complete', od razu.
 */
export function whenPixelReady(cb: () => void): void {
  if (typeof document === 'undefined') return
  // Pixel już zainicjalizowany albo dokument w pełni załadowany – nie ma na co czekać
  if (typeof (window as unknown as { fbq?: unknown }).fbq === 'function' || document.readyState === 'complete') {
    cb()
    return
  }
  let done = false
  const run = () => {
    if (done) return
    done = true
    document.removeEventListener('DOMContentLoaded', run)
    window.removeEventListener('load', run)
    cb()
  }
  document.addEventListener('DOMContentLoaded', run)
  window.addEventListener('load', run)
}

/** "29.00" → 29 (kwota dla Pixela; ceny w sklepie mają max 2 miejsca po przecinku). */
export function pixelValue(price: string): number {
  return Math.round(Number(price) * 100) / 100
}
