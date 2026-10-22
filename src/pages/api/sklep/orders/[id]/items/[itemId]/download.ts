import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ShopOrderRepository } from '@/lib/repositories/shopOrderRepository'
import { ShopDownloadService } from '@/lib/services/shopDownloadService'
import { isUuid, readCheckoutCookie } from '@/lib/shop/checkoutCookie'
import { downloadError, downloadNotFound, downloadRedirect } from '@/lib/shop/downloadResponse'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

/**
 * GET /api/sklep/orders/[id]/items/[itemId]/download – pobranie ze strony sukcesu płatności.
 *
 * Dostęp przez httpOnly cookie CHECKOUT_COOKIE (src/lib/shop/checkoutCookie.ts, 24 h).
 * Bez FF_SKLEP (ścieżka dostarczenia). Brak / zły / cudzy cookie → 404 (nie zdradzamy zamówienia).
 *
 * - 302 → presigned URL, 404 → brak dostępu, 500 → błąd bazy / storage
 */
export const GET: APIRoute = async ({ params, cookies }) => {
  const orderId = params.id
  try {
    if (!isUuid(orderId)) return downloadNotFound()

    const repository = new ShopOrderRepository(db)
    const result = await readCheckoutCookie(cookies, orderId, (id) => repository.findById(id))
    if (result.status !== 'valid') return downloadNotFound()

    const url = await new ShopDownloadService(db).getDownloadUrl(result.order.id, params.itemId ?? '', 'checkout')
    return url ? downloadRedirect(url) : downloadNotFound()
  } catch (error) {
    console.error('[GET /api/sklep/orders/[id]/items/[itemId]/download] Error:', { orderId, ...dbErrorLog(error) })
    return downloadError()
  }
}
