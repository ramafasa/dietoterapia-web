import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ok, fail, ErrorResponses, jsonResponse as json } from '@/lib/api/response'
import { checkShopFeatureEnabled } from '@/lib/shop/guards'
import { CHECKOUT_COOKIE, CHECKOUT_SECRET_TTL_HOURS } from '@/lib/shop/constants'
import { checkShopOrderRateLimit, recordShopOrderRequest } from '@/lib/rate-limit-public'
import { getClientIp } from '@/lib/rate-limit-pzk'
import {
  ShopCheckoutService,
  type CreateOrderErrorCode,
  type CreateOrderInput,
} from '@/lib/services/shopCheckoutService'
import { createOrderSchema } from '@/schemas/shop'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

/**
 * POST /api/sklep/orders - utworzenie zamówienia i rozpoczęcie płatności Tpay
 *
 * Publiczny (gość lub zalogowana osoba – dowolna rola; e-mail z sesji ma pierwszeństwo).
 * Chroniony przez CSRF middleware (Origin == Host) i limit IP (10 poprawnych zamówień / godzinę;
 * żądania odrzucone walidacją nie są liczone).
 *
 * Body: createOrderSchema (src/schemas/shop.ts)
 *
 * Sukces ustawia httpOnly cookie CHECKOUT_COOKIE = `${orderId}.${checkoutSecret}` (SameSite=Lax –
 * powrót z Tpay to nawigacja cross-site). Sekret NIGDY nie trafia do body ani do logów.
 *
 * Responses (envelope { data, error }, zawsze Cache-Control: no-store):
 * - 201: { data: { orderId, redirectUrl }, error: null }
 * - 400: validation_error – zły JSON / dane formularza, także pusta lista slugs (message = pierwszy błąd, details.issues = [{ path, message }])
 * - 404: not_found – FF_SKLEP=false
 * - 409: cart_changed (details.removedSlugs; details.reason = 'price_changed', gdy expectedTotal ≠ wycena) | already_owned (details.ownedSlugs, details.redirectUrl)
 * - 409: empty_cart – tylko obrona w głąb (pusty koszyk odrzuca już schemat → 400)
 * - 429: rate_limit_exceeded + Retry-After (sekundy)
 * - 502: payment_init_failed – Tpay nie przyjął transakcji
 * - 500: internal_server_error
 */

const CONFLICT_CODES: Record<Exclude<CreateOrderErrorCode, 'PAYMENT_INIT_FAILED'>, string> = {
  EMPTY_CART: 'empty_cart',
  CART_CHANGED: 'cart_changed',
  ALREADY_OWNED: 'already_owned',
}

export const POST: APIRoute = async (context) => {
  // Feature flag (defence in depth – middleware też blokuje)
  const disabledResponse = checkShopFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  const { request, cookies, locals } = context

  try {
    // 1. Rate limit per IP – sprawdzamy przed parsowaniem, ale liczymy tylko żądania, które przeszły
    //    walidację (poprawianie literówki w NIP-ie / e-mailu nie blokuje klientki)
    const ip = getClientIp(request)
    const rateLimit = checkShopOrderRateLimit(ip)
    if (!rateLimit.allowed) {
      const retryAfter = rateLimit.retryAfterSeconds ?? 60
      return json(
        fail('rate_limit_exceeded', 'Zbyt wiele prób złożenia zamówienia. Spróbuj ponownie później.', {
          retryAfter,
        }),
        429,
        { 'Retry-After': String(retryAfter) }
      )
    }

    // 2. Parse + validate body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json(ErrorResponses.BAD_REQUEST('Nieprawidłowe dane zamówienia'), 400)
    }

    const validation = createOrderSchema.safeParse(body)
    if (!validation.success) {
      const issues = validation.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
      return json(
        ErrorResponses.BAD_REQUEST(issues[0]?.message ?? 'Nieprawidłowe dane zamówienia', { issues }),
        400
      )
    }

    recordShopOrderRequest(ip)

    // 3. Zamówienie + Tpay
    const user = locals.user
    const service = new ShopCheckoutService(db)
    const result = await service.createOrder({
      // tsconfig bez strict → z.infer ma wszystkie pola opcjonalne; schemat gwarantuje kształt
      ...(validation.data as Omit<CreateOrderInput, 'sessionUser'>),
      sessionUser: user ? { id: user.id, email: user.email } : null,
    })

    if (result.ok === true) {
      const { orderId, redirectUrl, checkoutSecret } = result as Extract<typeof result, { ok: true }>
      cookies.set(CHECKOUT_COOKIE, `${orderId}.${checkoutSecret}`, {
        httpOnly: true,
        secure: import.meta.env.PROD,
        sameSite: 'lax', // powrót z Tpay = nawigacja cross-site top-level
        path: '/',
        maxAge: CHECKOUT_SECRET_TTL_HOURS * 3600,
      })
      return json(ok({ orderId, redirectUrl }), 201)
    }

    // 4. Błędy domenowe
    const failure = result as Extract<typeof result, { ok: false }>
    if (failure.code === 'PAYMENT_INIT_FAILED') {
      return json(fail('payment_init_failed', failure.message), 502)
    }

    const conflictCode = CONFLICT_CODES[failure.code]
    if (conflictCode) {
      const details =
        failure.code === 'CART_CHANGED'
          ? {
              removedSlugs: failure.removedSlugs ?? [],
              ...(failure.reason ? { reason: failure.reason } : {}),
            }
          : failure.code === 'ALREADY_OWNED'
            ? { ownedSlugs: failure.ownedSlugs ?? [], redirectUrl: '/konto/zakupy' }
            : undefined
      return json(fail(conflictCode, failure.message, details), 409)
    }

    console.error('[POST /api/sklep/orders] Unknown createOrder error code:', failure.code)
    return json(ErrorResponses.INTERNAL_SERVER_ERROR, 500)
  } catch (error) {
    // Bez error.message – drizzle wkleja do niego parametry zapytania (e-mail, dane do faktury)
    console.error('[POST /api/sklep/orders] Error:', dbErrorLog(error))
    return json(ErrorResponses.INTERNAL_SERVER_ERROR, 500)
  }
}
