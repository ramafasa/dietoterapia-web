import type { APIRoute } from 'astro'
import { db } from '@/db'
import { ErrorResponses, jsonResponse } from '@/lib/api/response'
import { ShopDownloadService } from '@/lib/services/shopDownloadService'
import { downloadError, downloadNotFound, downloadRedirect } from '@/lib/shop/downloadResponse'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

/**
 * GET /api/konto/zakupy/[itemId]/download – pobranie e-booka z konta (/konto/zakupy).
 *
 * Wymaga sesji (dowolna rola – zakupy mogą mieć customer, patient i dietitian). Pozycja musi należeć
 * do zamówienia z userId === locals.user.id. Bez FF_SKLEP (ścieżka dostarczenia).
 *
 * - 302 → presigned URL, 401 → brak sesji, 404 → cudza / nieistniejąca pozycja albo plik niedostępny,
 *   500 → błąd bazy / storage
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user
  if (!user) return jsonResponse(ErrorResponses.UNAUTHORIZED, 401)

  try {
    const url = await new ShopDownloadService(db).getDownloadUrlForUser(user.id, params.itemId ?? '')
    return url ? downloadRedirect(url) : downloadNotFound()
  } catch (error) {
    console.error('[GET /api/konto/zakupy/[itemId]/download] Error:', { userId: user.id, ...dbErrorLog(error) })
    return downloadError()
  }
}
