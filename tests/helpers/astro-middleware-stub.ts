/**
 * Stub wirtualnego modułu `astro:middleware` (dostępny tylko w runtime Astro).
 * Podpięty aliasem w vitest.config.ts, żeby testy mogły importować prawdziwe middleware.
 * W Astro `defineMiddleware` to funkcja tożsamościowa (służy tylko do typowania).
 */
export function defineMiddleware<T>(fn: T): T {
  return fn
}

export function sequence(...handlers: unknown[]): unknown {
  throw new Error(`sequence() is not supported in tests (got ${handlers.length} handlers)`)
}
