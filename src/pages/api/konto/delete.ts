import type { APIRoute } from 'astro'
import { db } from '@/db'
import { clearSessionCookie } from '@/lib/auth'
import { ok, fail, ErrorResponses, jsonResponse as json } from '@/lib/api/response'
import { AccountDeletionService } from '@/lib/services/accountDeletionService'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

const LOG = '[POST /api/konto/delete]'

const FORBIDDEN = fail(
  'forbidden',
  'Usunięcie konta jest dostępne tylko dla kont sklepu. Skontaktuj się z nami: dietoterapia@paulinamaciak.pl'
)

/**
 * POST /api/konto/delete – usunięcie własnego konta przez klientkę sklepu (Task 6.5).
 *
 * Body (JSON): `{ email: string }` – potwierdzenie wpisaniem adresu e-mail konta (bez wielkości liter,
 * przycięte). Tylko `role === 'customer'`; pacjentka i dietetyczka → 403 (konto pacjentki usuwa
 * dietetyczka). Szczegóły transakcji: AccountDeletionService.
 *
 * Responses (envelope { data, error }, Cache-Control: no-store):
 * - 200 { deleted: true, redirectTo: '/' } – konto usunięte, sesje usunięte (kaskada), ciasteczko wyczyszczone
 * - 400 validation_error – zły JSON / brak e-maila / e-mail nie pasuje (nic się nie zmienia)
 * - 401 unauthorized     – brak sesji (także gdy konto zniknęło w międzyczasie – ciasteczko czyścimy)
 * - 403 forbidden        – rola inna niż customer
 * - 415 unsupported_media_type – Content-Type inny niż application/json (np. zwykły formularz)
 * - 409 conflict         – konto ma dane, których nie odpinamy automatycznie (np. transakcja PZK, znane FK)
 * - 500 internal_server_error (także nieoczekiwany błąd DB)
 *
 * Tylko POST (inne metody nie są eksportowane – nic nie usuwają). CSRF: middleware (Origin == Host).
 * Nie logujemy e-maila.
 */
export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const user = locals.user
  if (!user) return json(ErrorResponses.UNAUTHORIZED, 401)
  if (user.role !== 'customer') {
    return json(FORBIDDEN, 403)
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!/^application\/json(\s*;|$)/i.test(contentType.trim())) {
    return json(fail('unsupported_media_type', 'Wymagany Content-Type: application/json'), 415)
  }

  let email: string
  try {
    const body: unknown = await request.json()
    const value = (body as { email?: unknown } | null)?.email
    if (typeof value !== 'string' || value.trim() === '') throw new Error('missing email')
    email = value
  } catch {
    return json(ErrorResponses.BAD_REQUEST('Wpisz adres e-mail swojego konta'), 400)
  }

  try {
    const outcome = await new AccountDeletionService(db).deleteCustomerAccount(user.id, email)
    switch (outcome.result) {
      case 'deleted':
        clearSessionCookie(cookies)
        return json(ok({ deleted: true, redirectTo: '/' }), 200)
      case 'email_mismatch':
        return json(
          ErrorResponses.BAD_REQUEST('Adres e-mail nie zgadza się z adresem konta', { field: 'email' }),
          400
        )
      case 'forbidden':
        return json(FORBIDDEN, 403)
      case 'not_found':
        clearSessionCookie(cookies)
        return json(ErrorResponses.UNAUTHORIZED, 401)
      case 'conflict':
        return json(
          fail('conflict', 'Nie mogę usunąć tego konta automatycznie. Napisz na dietoterapia@paulinamaciak.pl – usunę je ręcznie.'),
          409
        )
    }
  } catch (error) {
    console.error(`${LOG} Error:`, { userId: user.id, ...dbErrorLog(error) })
    return json(ErrorResponses.INTERNAL_SERVER_ERROR, 500)
  }
}
