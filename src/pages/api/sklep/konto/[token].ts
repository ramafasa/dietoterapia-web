import type { APIRoute } from 'astro'
import { db } from '@/db'
import { lucia } from '@/lib/auth'
import { ok, fail, ErrorResponses, jsonResponse as json } from '@/lib/api/response'
import { checkShopRateLimit, recordShopRequest } from '@/lib/rate-limit-public'
import { getClientIp } from '@/lib/rate-limit-pzk'
import { InvalidPasswordHashError, ShopAccountService } from '@/lib/services/shopAccountService'
import { ACCOUNT_PURCHASES_PATH } from '@/lib/shop/accountTokenView'
import { dbErrorLog } from '@/lib/shop/safeLog'

export const prerender = false

const LOG = '[POST /api/sklep/konto/[token]]'

/**
 * POST /api/sklep/konto/[token] – akcja ze strony /sklep/konto/{token} (link konta z maila, Task 4.4).
 *
 * Body (JSON, opcjonalne): `{ passwordHash?: string }` – SHA-256 hasła z klienta (hashPasswordClient).
 * Bez hasła: przypięcie zakupów do zalogowanego konta (sesja na e-mail tokenu).
 *
 * Responses (envelope { data, error }, zawsze Cache-Control: no-store):
 * - 201 { result: 'created_and_logged_in', redirectTo } – konto `customer` założone, sesja Lucia ustawiona
 * - 200 { result: 'attached', count }                   – zamówienia przypięte do zalogowanego konta
 * - 409 login_required    – konto z tym e-mailem istnieje (brak sesji / sesja innego konta); token niezużyty
 * - 409 different_account – brak konta, ale zalogowana na INNE konto; token niezużyty
 * - 422 password_required – brak konta i brak passwordHash
 * - 400 validation_error  – zły JSON / passwordHash nie jest 64 znakami hex (InvalidPasswordHashError)
 * - 404 not_found         – token nieważny / wygasły / zużyty
 * - 429 rate_limit_exceeded (limit sklepu: 60 żądań / 10 min / IP) + Retry-After
 * - 500 internal_server_error
 *
 * Limit: checkShopRateLimit (ten sam licznik IP co wycena koszyka). Token ma 256 bitów, więc limit nie
 * chroni przed zgadywaniem, tylko przed zalewem żądań (bcrypt i tak liczony dopiero po ważnym peeku).
 * Formularz 5/h (checkPublicRateLimit) byłby za ciasny dla literówek i ponownych kliknięć.
 *
 * CSRF: middleware (Origin == Host). Bez FF_SKLEP (ścieżka dostarczenia – guards.ts).
 * Nie logujemy tokenu, hasła/hasha ani e-maila; istniejących sesji nie unieważniamy.
 */
export const POST: APIRoute = async ({ params, request, locals, cookies }) => {
  const raw = params.token ?? ''

  const ip = getClientIp(request)
  const rateLimit = checkShopRateLimit(ip)
  if (!rateLimit.allowed) {
    const retryAfter = rateLimit.retryAfterSeconds ?? 60
    return json(
      fail('rate_limit_exceeded', 'Zbyt wiele prób. Spróbuj ponownie za chwilę.', { retryAfter }),
      429,
      { 'Retry-After': String(retryAfter) }
    )
  }
  recordShopRequest(ip)

  // Body: puste albo obiekt JSON z opcjonalnym passwordHash (string)
  let passwordHash: string | undefined
  try {
    const text = await request.text()
    const body: unknown = text.trim() === '' ? {} : JSON.parse(text)
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('not an object')
    const value = (body as { passwordHash?: unknown }).passwordHash
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('bad passwordHash')
    passwordHash = typeof value === 'string' && value !== '' ? value : undefined
  } catch {
    return json(ErrorResponses.BAD_REQUEST('Nieprawidłowe dane formularza'), 400)
  }

  const user = locals.user
  const sessionUser = user ? { id: user.id, email: user.email, role: user.role } : null

  try {
    const outcome = await new ShopAccountService(db).handleAccountToken(raw, { sessionUser, passwordHash })

    switch (outcome.result) {
      case 'created_and_logged_in': {
        // Jak w /api/auth/login: nowa sesja Lucia + ciasteczko
        const session = await lucia.createSession(outcome.userId, {})
        const sessionCookie = lucia.createSessionCookie(session.id)
        cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
        return json(ok({ result: outcome.result, redirectTo: ACCOUNT_PURCHASES_PATH }), 201)
      }
      case 'attached':
        return json(ok({ result: outcome.result, count: outcome.count }), 200)
      case 'login_required':
        return json(fail('login_required', 'Masz już konto – zaloguj się, aby przypisać zakupy.'), 409)
      case 'different_account':
        return json(
          fail('different_account', 'Jesteś zalogowana na inne konto – wyloguj się, aby założyć nowe.'),
          409
        )
      case 'password_required':
        return json(fail('password_required', 'Ustaw hasło, aby założyć konto.'), 422)
      case 'invalid':
        return json(ErrorResponses.NOT_FOUND('Link wygasł lub został już użyty'), 404)
    }
  } catch (error) {
    if (error instanceof InvalidPasswordHashError) {
      return json(ErrorResponses.BAD_REQUEST('Nieprawidłowe dane formularza'), 400)
    }
    console.error(`${LOG} Error:`, { userId: sessionUser?.id, ...dbErrorLog(error) })
    return json(ErrorResponses.INTERNAL_SERVER_ERROR, 500)
  }
}
