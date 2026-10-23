/**
 * Maskuje e-mail do wyświetlenia na stronie dostępnej z linku (np. /sklep/pobierz/{token}):
 * pierwsza litera lokalnej części + „***” + pełna domena, np. `anna@gmail.com` → `a***@gmail.com`.
 * Nieprawidłowy adres → `***`.
 */
export function maskEmail(email: string | null | undefined): string {
  if (typeof email !== 'string') return '***'
  const trimmed = email.trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return '***'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1)
  return `${Array.from(local)[0]}***@${domain}`
}
