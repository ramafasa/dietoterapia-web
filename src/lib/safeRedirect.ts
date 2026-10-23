import { homeFor, ROLE_HOME, type RoleRedirects } from '@/lib/roleHome'

/** Sztuczny origin do parsowania ścieżek względnych (bez dostępu do window/Astro.url). */
const PARSE_ORIGIN = 'http://localhost'

// Backslash (przeglądarki traktują go jak "/") i znaki sterujące (parser URL usuwa \t \n \r,
// więc "/\t/evil.com" stałoby się "//evil.com") – odrzucamy od razu.
const FORBIDDEN_CHARS = /[\\\u0000-\u001f\u007f]/

function isLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !FORBIDDEN_CHARS.test(value)
}

/**
 * Bezpieczny cel przekierowania z parametru `?next=` (ochrona przed open redirect).
 *
 * Przyjmuje tylko ścieżki względne na tym samym originie: zaczynające się od "/",
 * nie od "//" ani "/\", bez schematu (`https:`, `javascript:` itp.) i znaków sterujących.
 * Zwraca znormalizowaną ścieżkę (pathname + query + hash) albo `null`.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  if (!isLocalPath(raw)) return null

  let parsed: URL
  try {
    parsed = new URL(raw, PARSE_ORIGIN)
  } catch {
    return null
  }
  if (parsed.origin !== PARSE_ORIGIN) return null

  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`
  // Normalizacja kropek może dać "//…" (np. "/..//evil.com") – sprawdzamy wynik jeszcze raz.
  return isLocalPath(normalized) ? normalized : null
}

/**
 * Dokąd po zalogowaniu: poprawny `next`, a jeśli go nie ma – strona startowa roli
 * (z mapy `redirects`, domyślnie `ROLE_HOME`; nieznana rola → `/`).
 */
export function postLoginRedirect(
  role: string | null | undefined,
  next?: string | null,
  redirects: RoleRedirects = ROLE_HOME,
): string {
  return safeNextPath(next) ?? homeFor(role, redirects)
}
