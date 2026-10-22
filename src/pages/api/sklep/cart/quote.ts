import type { APIRoute } from 'astro'
import { z } from 'zod'
import { db } from '@/db'
import { ok, fail, ErrorResponses, jsonResponse as json } from '@/lib/api/response'
import { checkShopFeatureEnabled } from '@/lib/shop/guards'
import { checkShopRateLimit, recordShopRequest } from '@/lib/rate-limit-public'
import { getClientIp } from '@/lib/rate-limit-pzk'
import { ShopCheckoutService, MAX_CART_ITEMS } from '@/lib/services/shopCheckoutService'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

/**
 * POST /api/sklep/cart/quote - wycena koszyka
 *
 * Koszyk w localStorage trzyma tylko slugi; ten endpoint zwraca autorytatywne ceny.
 * Publiczny (bez logowania), chroniony przez CSRF middleware (Origin == Host) i limit IP.
 *
 * Body: { slugs: string[] } – max 20, każdy /^[a-z0-9-]{1,100}$/
 *
 * Responses (envelope { data, error }):
 * - 200: { data: CartQuote, error: null }
 * - 400: validation_error – zły JSON / slug / >20 slugów
 * - 404: not_found – FF_SKLEP=false
 * - 429: rate_limit_exceeded (60 req / 10 min / IP) + Retry-After (sekundy)
 * - 500: internal_server_error
 */

const quoteRequestSchema = z.object({
  slugs: z.array(z.string().regex(/^[a-z0-9-]{1,100}$/)).max(MAX_CART_ITEMS),
})

export const POST: APIRoute = async (context) => {
  // Feature flag (defence in depth – middleware też blokuje)
  const disabledResponse = checkShopFeatureEnabled(context)
  if (disabledResponse) return disabledResponse

  const { request } = context

  try {
    // 1. Rate limit per IP (liczymy każde żądanie, także niepoprawne)
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

    // 2. Parse + validate body
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json(ErrorResponses.BAD_REQUEST('Nieprawidłowe dane koszyka'), 400)
    }

    const validation = quoteRequestSchema.safeParse(body)
    if (!validation.success) {
      return json(
        ErrorResponses.BAD_REQUEST('Nieprawidłowe dane koszyka', { issues: validation.error.issues }),
        400
      )
    }

    // 3. Wycena
    const service = new ShopCheckoutService(db)
    const quote = await service.quoteCart(validation.data.slugs)

    return json(ok(quote), 200)
  } catch (error) {
    console.error('[POST /api/sklep/cart/quote] Error:', dbErrorLog(error))
    return json(ErrorResponses.INTERNAL_SERVER_ERROR, 500)
  }
}
