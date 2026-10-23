/**
 * Strona startowa zalogowanego użytkownika wg roli.
 *
 * Używane przez middleware RBAC (przekierowania z cudzych stref i z /logowanie)
 * oraz LoginForm (przekierowanie po zalogowaniu, przez `postLoginRedirect`).
 * Klientka sklepu (`customer`) nigdy nie trafia do Wagi ani PZK – jej miejscem jest panel zakupów.
 */
export interface RoleRedirects {
  patient: string
  dietitian: string
  customer: string
}

export const ROLE_HOME: RoleRedirects = {
  dietitian: '/dietetyk/dashboard',
  customer: '/konto/zakupy',
  patient: '/pacjent/waga',
}

/** Neutralny cel dla nieznanej roli – publiczna strona, więc bez pętli przekierowań w strefach. */
export const UNKNOWN_ROLE_HOME = '/'

export function homeFor(role?: string | null, redirects: RoleRedirects = ROLE_HOME): string {
  if (role === 'dietitian') return redirects.dietitian
  if (role === 'customer') return redirects.customer
  if (role === 'patient') return redirects.patient
  return UNKNOWN_ROLE_HOME
}
