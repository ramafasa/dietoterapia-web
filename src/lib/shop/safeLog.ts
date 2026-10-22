/**
 * Bezpieczne logowanie błędów w kodzie sklepu.
 *
 * Komunikaty błędów Drizzle zawierają treść zapytania i jego parametry (e-mail, dane do faktury,
 * hashe) – NIGDY nie logujemy `error` ani `error.message` z warstwy DB. Logujemy tylko kod
 * i nazwę ograniczenia Postgresa (+ identyfikatory dodawane przez wołającego).
 */
export function dbErrorLog(error: unknown): { name?: string; code?: string; constraint?: string } {
  const err = error as { name?: string; code?: string; constraint_name?: string; cause?: unknown } | null
  const cause = err?.cause as { code?: string; constraint_name?: string } | undefined
  return {
    name: error instanceof Error ? error.name : typeof error,
    code: cause?.code ?? err?.code,
    constraint: cause?.constraint_name ?? err?.constraint_name,
  }
}
