/**
 * Praca po wysłaniu odpowiedzi (np. „Wyślij link ponownie” – czas odpowiedzi nie może zdradzać,
 * czy są zamówienia).
 *
 * `waitUntil` z @vercel/functions: na Vercelu funkcja żyje, dopóki obietnica się nie rozstrzygnie.
 * Poza Vercelem (astro dev, vitest) kontekstu żądania nie ma i waitUntil nic nie robi – obietnica i tak
 * już działa (Node trzyma proces), tylko nikt na nią nie czeka. Dlatego błędy łapiemy tutaj: nigdy
 * nieobsłużone odrzucenie.
 *
 * Testy: `flushBackgroundTasks()` czeka na wszystkie uruchomione zadania (zamiast sleepów).
 */

import { waitUntil } from '@vercel/functions'

const pending = new Set<Promise<void>>()

export function runInBackground(label: string, task: () => Promise<unknown>): void {
  const guarded = Promise.resolve()
    .then(task)
    .then(
      () => undefined,
      (error: unknown) => {
        // Bez treści błędu – może zawierać dane (e-mail, SQL); szczegóły loguje samo zadanie.
        console.error(`${label} Background task failed`, { name: error instanceof Error ? error.name : typeof error })
      }
    )
    .finally(() => pending.delete(guarded))
  pending.add(guarded)
  try {
    waitUntil(guarded)
  } catch {
    // waitUntil rzuca tylko dla nie-obietnicy – zadanie i tak działa
  }
}

/** Czeka, aż wszystkie zadania w tle się zakończą (także te uruchomione w trakcie czekania). */
export async function flushBackgroundTasks(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending])
}
