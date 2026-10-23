import type { APIRoute } from 'astro'
import { db } from '@/db'
import {
  checkPublicRateLimit,
  checkShopAccountLinkEmailLimit,
  recordPublicRequest,
  recordShopAccountLinkEmail,
} from '@/lib/rate-limit-public'
import { getClientIp } from '@/lib/rate-limit-pzk'
import { ShopOrderRepository } from '@/lib/repositories/shopOrderRepository'
import { ShopAccountService } from '@/lib/services/shopAccountService'
import { ShopMailService } from '@/lib/services/shopMailService'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { ACCOUNT_LINK_SENT_PARAM, ACCOUNT_LINK_SENT_VALUE } from '@/lib/shop/constants'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

const LOG = '[POST /api/sklep/pobierz/[token]/account-link]'

/**
 * POST /api/sklep/pobierz/[token]/account-link – formularz „Załóż konto” na /sklep/pobierz/{token}.
 *
 * Nowy token konta (createAccountToken przez resolveAccountLinkForOrder: `create` albo `attach`) idzie
 * WYŁĄCZNIE mailem na order.email – link do pobrania mógł zostać przekazany dalej, więc własność
 * skrzynki musi potwierdzić mail. Token konta nigdy nie trafia do odpowiedzi ani logów.
 *
 * Limity: checkShopAccountLinkEmailLimit(order.email) (2/h, własny licznik – nie zużywa limitu „Wyślij link
 * ponownie”) + checkPublicRateLimit(ip) (5/h). Po przekroczeniu
 * – ta sama odpowiedź, bez wysyłki. Odpowiedź nie zdradza, czy mail faktycznie wyszedł.
 *
 * CSRF: middleware sprawdza Origin (formularz z naszej strony). Bez FF_SKLEP (ścieżka dostarczenia).
 *
 * Odpowiedź: 303 → /sklep/pobierz/{token}?konto=wyslano (gdy zamówienie nie ma konta – strona pokazuje
 * komunikat), w pozostałych przypadkach (nieważny token, zamówienie z userId) 303 → /sklep/pobierz/{token}.
 */
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const raw = params.token ?? ''
  const pagePath = `/sklep/pobierz/${encodeURIComponent(raw)}`
  const sentPath = `${pagePath}?${ACCOUNT_LINK_SENT_PARAM}=${ACCOUNT_LINK_SENT_VALUE}`

  let orderId: string | undefined
  try {
    const token = await new ShopTokenService(db).validateDownloadToken(raw)
    if (!token) return redirect(pagePath, 303)
    orderId = token.orderId

    const order = await new ShopOrderRepository(db).findById(token.orderId)
    if (!order || order.userId) return redirect(pagePath, 303)
    if (order.status !== 'paid' || order.anonymizedAt) return redirect(sentPath, 303)

    const ip = getClientIp(request)
    if (!checkPublicRateLimit(ip).allowed || !checkShopAccountLinkEmailLimit(order.email).allowed) {
      console.warn(`${LOG} Rate limit – account link not sent`, { orderId })
      return redirect(sentPath, 303)
    }
    recordPublicRequest(ip)
    recordShopAccountLinkEmail(order.email)

    const link = await new ShopAccountService(db).resolveAccountLinkForOrder(order)
    if (link.kind !== 'none') {
      const sent = await new ShopMailService(db).sendAccountLink(order.email, link)
      if (!sent) console.warn(`${LOG} Account link e-mail not sent`, { orderId })
    }
    return redirect(sentPath, 303)
  } catch (error) {
    // Celowo: po wczytaniu tokenu błąd (DB, mailer) daje ten sam komunikat „wysłałam” – odpowiedź
    // nie może zdradzać, czy mail faktycznie wyszedł. Klientka może ponowić / użyć „Wyślij link ponownie”.
    console.error(`${LOG} Error:`, { orderId, ...dbErrorLog(error) })
    return redirect(orderId ? sentPath : pagePath, 303)
  }
}
