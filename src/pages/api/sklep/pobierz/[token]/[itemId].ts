import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ShopDownloadService } from '@/lib/services/shopDownloadService'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { downloadError, downloadNotFound, downloadRedirect } from '@/lib/shop/downloadResponse'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

/**
 * GET /api/sklep/pobierz/[token]/[itemId] – pobranie pozycji z linku w mailu.
 *
 * Bez FF_SKLEP (ścieżka dostarczenia, guards.ts). Token NIGDY nie trafia do logów.
 * Dostęp (status 'paid', wysłane potwierdzenie, pozycja z tego zamówienia) sprawdza ShopDownloadService.
 *
 * - 302 → presigned URL (TTL 5 min), Cache-Control: no-store, Referrer-Policy: no-referrer
 * - 404 → nieważny / wygasły token albo plik niedostępny (jedna odpowiedź)
 * - 500 → błąd bazy / storage
 */
export const GET: APIRoute = async ({ params }) => {
  let orderId: string | undefined
  try {
    const token = await new ShopTokenService(db).validateDownloadToken(params.token ?? '')
    if (!token) return downloadNotFound()
    orderId = token.orderId

    const url = await new ShopDownloadService(db).getDownloadUrl(token.orderId, params.itemId ?? '', 'token')
    return url ? downloadRedirect(url) : downloadNotFound()
  } catch (error) {
    console.error('[GET /api/sklep/pobierz/[token]/[itemId]] Error:', { orderId, ...dbErrorLog(error) })
    return downloadError()
  }
}
