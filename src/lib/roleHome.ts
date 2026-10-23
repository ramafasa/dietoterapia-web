/**
 * Strona startowa zalogowanego użytkownika wg roli.
 *
 * Używane przez middleware RBAC (przekierowania z cudzych stref i z /logowanie)
 * oraz LoginForm (przekierowanie po zalogowaniu). Klientka sklepu (`customer`)
 * nigdy nie trafia do Wagi ani PZK – jej miejscem jest panel zakupów.
 */
export const ROLE_HOME = {
  dietitian: '/dietetyk/dashboard',
  customer: '/konto/zakupy',
  patient: '/pacjent/waga',
} as const

export function homeFor(role?: string | null): string {
  if (role === 'dietitian') return ROLE_HOME.dietitian
  if (role === 'customer') return ROLE_HOME.customer
  return ROLE_HOME.patient
}
