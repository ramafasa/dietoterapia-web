/**
 * Ciasteczko strony sukcesu (CHECKOUT_COOKIE = `${orderId}.${checkoutSecret}`, ustawiane przez
 * POST /api/sklep/orders). Jedno ciasteczko = ostatnie zamówienie w tej przeglądarce.
 *
 * Ważne, gdy: format poprawny (uuid + 64 hex), orderId z ciasteczka == żądany orderId,
 * hashToken(secret) == order.checkoutSecretHash (porównanie w stałym czasie)
 * ORAZ order.createdAt + CHECKOUT_SECRET_TTL_HOURS > now.
 *
 * Sekret NIGDY nie trafia do logów ani odpowiedzi.
 */

import { timingSafeEqual } from 'crypto'
import type { AstroCookies } from 'astro'
import { hashToken } from '@/lib/crypto'
import { CHECKOUT_COOKIE, CHECKOUT_SECRET_TTL_HOURS } from '@/lib/shop/constants'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SECRET_RE = /^[0-9a-f]{64}$/ // randomBytes(32).toString('hex') – zawsze małe litery

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Minimum, którego potrzebuje weryfikacja – loader może zwrócić więcej (wynik trafia do `order`). */
export interface CheckoutVerifiableOrder {
  checkoutSecretHash: string | null
  createdAt: Date
}

/**
 * - `valid`: ciasteczko pasuje do zamówienia (zwraca wczytane zamówienie),
 * - `mismatch`: ciasteczko wygląda poprawnie, ale dotyczy INNEGO zamówienia (np. dwa zamówienia
 *   w dwóch kartach) – UI pokazuje „Link do pobrania wysłałam na Twój e-mail” zamiast błędu.
 *   Sekretu nie weryfikujemy (to wymagałoby drugiego odczytu) – wynik i tak nic nie zdradza
 *   o żądanym zamówieniu,
 * - `missing_or_invalid`: brak / zły format / nieznane zamówienie / zły sekret / wygasło.
 */
export type CheckoutCookieResult<T> =
  | { status: 'valid'; order: T }
  | { status: 'mismatch' }
  | { status: 'missing_or_invalid' }

export interface ParsedCheckoutCookie {
  orderId: string
  secret: string
}

/** Czysty parser wartości ciasteczka (bez DB). orderId zwracany małymi literami. */
export function parseCheckoutCookie(value: string | undefined | null): ParsedCheckoutCookie | null {
  if (typeof value !== 'string') return null
  const parts = value.split('.')
  if (parts.length !== 2) return null
  const [orderId, secret] = parts
  if (!UUID_RE.test(orderId) || !SECRET_RE.test(secret)) return null
  return { orderId: orderId.toLowerCase(), secret }
}

/** Porównanie dwóch hashy hex w stałym czasie (różna długość → false). */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Czy sekret pasuje do zamówienia i nie wygasł (bez DB). */
export async function verifyCheckoutSecret(
  secret: string,
  order: CheckoutVerifiableOrder,
  now: Date = new Date()
): Promise<boolean> {
  if (!order.checkoutSecretHash) return false
  const expiresAt = order.createdAt.getTime() + CHECKOUT_SECRET_TTL_HOURS * 3600 * 1000
  if (expiresAt <= now.getTime()) return false
  return hashesEqual(await hashToken(secret), order.checkoutSecretHash.toLowerCase())
}

/**
 * Odczyt + weryfikacja ciasteczka dla `orderId`.
 *
 * `loadOrder` jest wołany najwyżej raz i tylko wtedy, gdy ciasteczko dotyczy tego zamówienia
 * (brak / inny orderId → zero odczytów DB). Endpoint wczytuje w nim od razu wszystko, czego
 * potrzebuje do odpowiedzi, więc całe żądanie to jeden odczyt.
 */
export async function readCheckoutCookie<T extends CheckoutVerifiableOrder>(
  cookies: Pick<AstroCookies, 'get'>,
  orderId: string,
  loadOrder: (orderId: string) => Promise<T | null>,
  now: Date = new Date()
): Promise<CheckoutCookieResult<T>> {
  const parsed = parseCheckoutCookie(cookies.get(CHECKOUT_COOKIE)?.value)
  if (!parsed) return { status: 'missing_or_invalid' }
  if (parsed.orderId !== orderId.toLowerCase()) return { status: 'mismatch' }

  const order = await loadOrder(parsed.orderId)
  if (!order) return { status: 'missing_or_invalid' }
  if (!(await verifyCheckoutSecret(parsed.secret, order, now))) return { status: 'missing_or_invalid' }

  return { status: 'valid', order }
}
