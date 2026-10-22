import { isFeatureEnabled } from '@/lib/feature-flags'
import type { APIContext } from 'astro'

/**
 * Ścieżki dostarczenia, które działają zawsze – także przy FF_SKLEP=false.
 * Klientki, które już zapłaciły, muszą móc pobrać pliki, wejść na konto,
 * zobaczyć stronę płatności i status zamówienia; webhook Tpay nie może przepaść.
 * Dopasowanie po granicy segmentu: `base` albo `base/...`.
 */
const SHOP_ALWAYS_ON_BASES = [
  '/sklep/pobierz',
  '/sklep/konto',
  '/sklep/wyslij-link',
  '/sklep/platnosc',
  '/api/sklep/pobierz',
  '/api/sklep/konto',
  '/api/sklep/resend-link',
  '/api/sklep/platnosc/callback',
]

/**
 * Prefiks zasobów konkretnego zamówienia (status, pobranie pozycji) – po płatności.
 * UWAGA: wszystko pod /api/sklep/orders/<id>/… jest zawsze aktywne (middleware nie blokuje),
 * więc każdy przyszły endpoint SPRZEDAŻY pod tym prefiksem musi sam wywołać checkShopFeatureEnabled.
 */
const ORDER_RESOURCE_PREFIX = '/api/sklep/orders/'

function matchesBase(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`)
}

function isShopRoute(pathname: string): boolean {
  return matchesBase(pathname, '/sklep') || matchesBase(pathname, '/api/sklep')
}

function isShopAlwaysOnPath(pathname: string): boolean {
  if (SHOP_ALWAYS_ON_BASES.some((base) => matchesBase(pathname, base))) return true
  // `/api/sklep/orders/<id>/...` tak, ale `/api/sklep/orders` i `/api/sklep/orders/` (tworzenie) – nie
  return pathname.startsWith(ORDER_RESOURCE_PREFIX) && pathname.length > ORDER_RESOURCE_PREFIX.length
}

/**
 * Czy ścieżka należy do sprzedaży w sklepie (katalog, koszyk, wycena, tworzenie zamówienia)?
 * Te ścieżki są blokowane (404) przy FF_SKLEP=false. Ścieżki dostarczenia zwracają false.
 */
export function isShopSalesPath(pathname: string): boolean {
  return isShopRoute(pathname) && !isShopAlwaysOnPath(pathname)
}

/**
 * Guard function to check if the shop (FF_SKLEP) is enabled
 * Returns 404 response if feature is disabled
 *
 * Używać w endpointach sprzedaży (defence in depth – middleware też blokuje):
 * ```typescript
 * const disabledResponse = checkShopFeatureEnabled(context)
 * if (disabledResponse) return disabledResponse
 * ```
 *
 * @param context - Astro API context
 * @returns Response object with 404 status if feature is disabled, null otherwise
 */
export function checkShopFeatureEnabled(_context: APIContext): Response | null {
  if (!isFeatureEnabled('SKLEP')) {
    return new Response(
      JSON.stringify({ error: 'Not Found' }),
      {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }
    )
  }

  return null
}
