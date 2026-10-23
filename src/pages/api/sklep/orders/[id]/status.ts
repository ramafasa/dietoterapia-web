import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ok, fail, ErrorResponses, jsonResponse as json } from '@/lib/api/response'
import { checkShopRateLimit, recordShopRequest } from '@/lib/rate-limit-public'
import { getClientIp } from '@/lib/rate-limit-pzk'
import {
  ShopOrderRepository,
  type ShopOrderStatus,
  type ShopOrderStatusView,
} from '@/lib/repositories/shopOrderRepository'
import { isUuid, readCheckoutCookie } from '@/lib/shop/checkoutCookie'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

export type AccountState = 'none' | 'exists' | 'link_sent'

export interface OrderStatusDto {
  status: ShopOrderStatus
  confirmationSent: boolean
  orderNumber: string
  email: string
  items: { id: string; title: string; slug: string }[] // slug → Meta Pixel content_ids (strona sukcesu)
  total: string // "29.00" (PLN)
  accountState: AccountState
}

/**
 * GET /api/sklep/orders/[id]/status - status zamówienia dla strony sukcesu (/sklep/platnosc/sukces)
 *
 * Dostęp wyłącznie przez httpOnly cookie CHECKOUT_COOKIE (`${orderId}.${secret}`, 24 h od utworzenia
 * zamówienia) – patrz src/lib/shop/checkoutCookie.ts. Bez sesji, bez FF_SKLEP (ścieżka dostarczenia,
 * zawsze aktywna: zapłacone zamówienie musi być widoczne także po wyłączeniu sklepu).
 *
 * Limit: wspólny licznik sklepu checkShopRateLimit (60 req / 10 min / IP, razem z wyceną koszyka).
 * Strona sukcesu odpytuje co 3 s przez maks. 60 s (Task 7.3) = 20 żądań; nawet 2 min (40) mieści się
 * w limicie. Po 429 UI pokazuje komunikat „link przyjdzie mailem” (jak przy timeoucie).
 *
 * accountState (sens dopiero po opłaceniu, zwracany zawsze):
 * - 'none'      – zamówienie ma userId (zakup zalogowanej osoby),
 * - 'exists'    – istnieje konto z e-mailem zamówienia (bez wielkości liter) → mail mówi „zaloguj się”,
 * - 'link_sent' – brak konta → mail zawiera „Ustaw hasło i załóż konto”.
 * Liczony na żywo przy każdym żądaniu (nie zapamiętany z chwili wysyłki maila): jeśli kupująca założy
 * konto w trakcie odpytywania, kolejne odpowiedzi zmienią się z 'link_sent' na 'exists'.
 *
 * Responses (envelope { data, error }, zawsze Cache-Control: no-store):
 * - 200: { data: OrderStatusDto, error: null }
 * - 404: not_found – zły uuid / brak ciasteczka / zły sekret / wygasło / brak zamówienia
 *        (jedna odpowiedź – nie zdradzamy istnienia zamówienia)
 * - 404: cookie_mismatch – ciasteczko poprawne w formie, ale dla INNEGO zamówienia (np. dwa zamówienia
 *        w dwóch kartach). Nic nie mówi o żądanym zamówieniu (ciasteczko należy do tej przeglądarki);
 *        UI pokazuje „Link do pobrania wysłaliśmy na Twój e-mail” zamiast błędu.
 * - 429: rate_limit_exceeded + Retry-After (sekundy)
 * - 500: internal_server_error
 */
export const GET: APIRoute = async ({ params, cookies, request }) => {
  try {
    const ip = getClientIp(request)
    const rateLimit = checkShopRateLimit(ip)
    if (!rateLimit.allowed) {
      const retryAfter = rateLimit.retryAfterSeconds ?? 60
      return json(
        fail('rate_limit_exceeded', 'Zbyt wiele zapytań. Spróbuj ponownie za chwilę.', { retryAfter }),
        429,
        { 'Retry-After': String(retryAfter) }
      )
    }
    recordShopRequest(ip)

    const orderId = params.id
    if (!isUuid(orderId)) return json(ErrorResponses.NOT_FOUND(), 404)

    const repository = new ShopOrderRepository(db)
    const result = await readCheckoutCookie(cookies, orderId, (id) => repository.findStatusView(id))

    if (result.status === 'mismatch') {
      return json(fail('cookie_mismatch', 'To zamówienie nie jest powiązane z tą przeglądarką'), 404)
    }
    if (result.status !== 'valid') return json(ErrorResponses.NOT_FOUND(), 404)

    return json(ok(toDto(result.order)), 200)
  } catch (error) {
    console.error('[GET /api/sklep/orders/[id]/status] Error:', { orderId: params.id, ...dbErrorLog(error) })
    return json(ErrorResponses.INTERNAL_SERVER_ERROR, 500)
  }
}

/** Jawna lista pól – checkoutSecretHash, userId, createdAt itp. nie trafiają do odpowiedzi. */
function toDto(order: ShopOrderStatusView): OrderStatusDto {
  return {
    status: order.status,
    confirmationSent: order.confirmationSentAt != null,
    orderNumber: order.orderNumber,
    email: order.email,
    items: order.items.map((item) => ({ id: item.id, title: item.title, slug: item.slug })),
    total: order.totalAmount,
    accountState: order.userId ? 'none' : order.accountExists ? 'exists' : 'link_sent',
  }
}
