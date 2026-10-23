/**
 * Stan tokenu konta /sklep/konto/{token} (Task 4.4) – czysta reguła decyzji, używana przez
 * ShopAccountService.resolveTokenState (a ten przez stronę przy GET i handleAccountToken przy POST):
 * - konto istnieje + sesja na e-mail tokenu → `attach`   (POST da `attached`)
 * - konto istnieje + brak sesji            → `login`    (POST da `login_required`)
 * - konto istnieje + sesja innego konta    → `switch_account` (POST da `login_required`)
 * - brak konta + sesja innego konta        → `different_account`
 * - brak konta + brak sesji                → `create`   (POST z hasłem da `created_and_logged_in`)
 * E-maile porównywane bez wielkości liter (jak w serwisie).
 */
export type AccountTokenPageState = 'create' | 'attach' | 'login' | 'switch_account' | 'different_account'

export function resolveAccountTokenPageState(input: {
  tokenEmail: string
  accountExists: boolean
  sessionEmail: string | null | undefined
}): AccountTokenPageState {
  const normalize = (email: string) => email.trim().toLowerCase()
  const hasSession = typeof input.sessionEmail === 'string'
  const sessionMatches = hasSession && normalize(input.sessionEmail as string) === normalize(input.tokenEmail)

  if (input.accountExists) {
    if (sessionMatches) return 'attach'
    return hasSession ? 'switch_account' : 'login'
  }
  return hasSession ? 'different_account' : 'create'
}

/** Ścieżka strony konta dla tokenu. */
export function accountTokenPagePath(raw: string): string {
  return `/sklep/konto/${encodeURIComponent(raw)}`
}

/** Logowanie z powrotem na stronę konta (`next` obsłuży LoginForm – Task 6.2). */
export function accountTokenLoginUrl(raw: string): string {
  return `/logowanie?next=${encodeURIComponent(accountTokenPagePath(raw))}`
}

/** Panel zakupów klientki (strona w Task 6.4). */
export const ACCOUNT_PURCHASES_PATH = '/konto/zakupy'
