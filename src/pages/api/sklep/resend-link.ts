import type { APIRoute } from 'astro'
import { z } from 'zod'
import { db } from '@/db'
import { ok, fail, ErrorResponses, jsonResponse as json } from '@/lib/api/response'
import {
  checkEmailRateLimit,
  checkPublicRateLimit,
  recordEmailSent,
  recordPublicRequest,
} from '@/lib/rate-limit-public'
import { getClientIp } from '@/lib/rate-limit-pzk'
import { ShopResendService } from '@/lib/services/shopResendService'
import { RESEND_LINK_MESSAGE } from '@/lib/shop/resendLink'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

const LOG = '[POST /api/sklep/resend-link]'

// Ta sama normalizacja co e-mail w createOrderSchema (src/schemas/shop.ts)
const resendLinkSchema = z.object({
  email: z
    .string({ required_error: 'Podaj adres e-mail' })
    .trim()
    .toLowerCase()
    .email('Podaj poprawny adres e-mail')
    .max(255, 'Adres e-mail jest za długi'),
})

/**
 * POST /api/sklep/resend-link – „Wyślij link ponownie” (Task 4.5, /sklep/wyslij-link).
 *
 * Nowe linki do pobrania dla wszystkich opłaconych zamówień z tym e-mailem + sekcja konta, jednym
 * mailem (ShopResendService). Działa także po usunięciu konta (decyzja 15) i przy FF_SKLEP=false
 * (ścieżka dostarczenia – guards.ts). CSRF: middleware (Origin == Host).
 *
 * Ochrona przed enumeracją: każde poprawne żądanie dostaje TĘ SAMĄ odpowiedź 200 (bajt w bajt),
 * czy zamówienia są, czy nie, czy limit e-maila przekroczony, czy mail wyszedł, czy był błąd.
 *
 * Limity:
 * - IP: checkPublicRateLimit (5/h, licznik wspólny z formularzami kontaktowymi). Przekroczenie → 429
 *   + Retry-After – limit IP nic nie mówi o e-mailu, a klientka wie, że ma odczekać. Liczone są tylko
 *   żądania z poprawnym e-mailem (literówka nie zużywa limitu).
 * - e-mail: checkEmailRateLimit (2/h, licznik wspólny z innymi mailami do tego adresu). Przekroczenie →
 *   ta sama odpowiedź 200, nic nie wysyłamy. Liczone przy KAŻDYM żądaniu (także bez zamówień), żeby
 *   licznik nie zdradzał istnienia zamówień i chronił skrzynkę przed zalewem.
 *
 * Ryzyko resztkowe: czas odpowiedzi (z zamówieniami: inserty tokenów + wysyłka maila) jest dłuższy niż
 * bez nich. Ograniczone limitami (5 prób/h z IP); pełna eliminacja wymagałaby wysyłki w tle.
 *
 * Responses (envelope { data, error }, Cache-Control: no-store):
 * - 200: { data: { message: RESEND_LINK_MESSAGE }, error: null }
 * - 400: validation_error – zły JSON / e-mail (nic nie zdradza o zamówieniach)
 * - 429: rate_limit_exceeded + Retry-After (sekundy)
 */
export const POST: APIRoute = async ({ request }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(ErrorResponses.BAD_REQUEST('Podaj poprawny adres e-mail'), 400)
  }

  const validation = resendLinkSchema.safeParse(body)
  if (!validation.success) {
    return json(ErrorResponses.BAD_REQUEST(validation.error.issues[0]?.message ?? 'Podaj poprawny adres e-mail'), 400)
  }
  const { email } = validation.data

  const ip = getClientIp(request)
  const ipLimit = checkPublicRateLimit(ip)
  if (!ipLimit.allowed) {
    const retryAfter = (ipLimit.retryAfter ?? 60) * 60
    return json(
      fail('rate_limit_exceeded', 'Zbyt wiele prób. Spróbuj ponownie później.', { retryAfter }),
      429,
      { 'Retry-After': String(retryAfter) }
    )
  }
  recordPublicRequest(ip)

  if (!checkEmailRateLimit(email).allowed) {
    console.warn(`${LOG} E-mail rate limit – nothing sent`)
    return json(ok({ message: RESEND_LINK_MESSAGE }), 200)
  }
  recordEmailSent(email)

  try {
    await new ShopResendService(db).resend(email)
  } catch (error) {
    console.error(`${LOG} Error:`, dbErrorLog(error))
  }
  return json(ok({ message: RESEND_LINK_MESSAGE }), 200)
}
