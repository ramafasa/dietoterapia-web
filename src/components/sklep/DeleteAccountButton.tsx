import { useEffect, useId, useRef, useState } from 'react'

type Status = 'idle' | 'confirming' | 'loading' | 'done'

/** Ten sam warunek co na serwerze (AccountDeletionService.normalizeConfirmEmail). */
export function emailMatches(input: string, accountEmail: string): boolean {
  return input.trim().toLowerCase() === accountEmail.trim().toLowerCase()
}

interface Props {
  /** E-mail konta – do porównania przed wysłaniem (serwer i tak sprawdza z bazą) */
  accountEmail: string
}

/**
 * „Usuń konto” na /konto/ustawienia (Task 6.5, tylko rola `customer`).
 *
 * Krok 1: przycisk → panel z konsekwencjami i polem e-mail (potwierdzenie wpisaniem adresu konta).
 * Krok 2: POST /api/konto/delete { email } → 200: komunikat „Konto usunięte” (sesja już wyczyszczona)
 * z linkami na stronę główną i do „Wyślij link ponownie”. Błędy: 400 przy polu, 403/409 z komunikatem
 * serwera, 401 → strona logowania, reszta – ogólny komunikat.
 */
export default function DeleteAccountButton({ accountEmail }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  // Blokada podwójnego wysłania niezależna od cyklu renderowania (stan aktualizuje się asynchronicznie)
  const inFlight = useRef(false)
  // Po „Anuluj” fokus wraca na przycisk „Usuń konto” (nie przy pierwszym renderze)
  const returnFocus = useRef(false)
  const id = useId()
  const inputId = `${id}-email`
  const errorId = `${id}-error`
  const consequencesId = `${id}-consequences`

  useEffect(() => {
    if (status === 'confirming') inputRef.current?.focus()
    if (status === 'done') doneRef.current?.focus()
    if (status === 'idle' && returnFocus.current) {
      returnFocus.current = false
      triggerRef.current?.focus()
    }
  }, [status])

  function cancel() {
    if (inFlight.current) return
    returnFocus.current = true
    setStatus('idle')
    setEmail('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return
    if (!emailMatches(email, accountEmail)) {
      setError('Adres e-mail nie zgadza się z adresem konta')
      inputRef.current?.focus()
      return
    }
    inFlight.current = true
    setError(null)
    setStatus('loading')
    // Fokus zostaje na przycisku wysyłania (nie jest `disabled`, tylko aria-disabled)
    submitRef.current?.focus()

    try {
      const res = await fetch('/api/konto/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email }),
      })
      if (res.ok) {
        setStatus('done')
        return
      }
      if (res.status === 401) {
        window.location.assign('/logowanie?next=%2Fkonto%2Fustawienia')
        return
      }
      inFlight.current = false
      const body = await res.json().catch(() => null)
      const message: string | undefined = body?.error?.message
      setError(
        res.status === 400 || res.status === 403 || res.status === 409
          ? message ?? 'Nie udało się usunąć konta.'
          : 'Coś poszło nie tak. Spróbuj ponownie za chwilę.'
      )
      setStatus('confirming')
    } catch {
      inFlight.current = false
      setError('Brak połączenia. Sprawdź internet i spróbuj ponownie.')
      setStatus('confirming')
    }
  }

  if (status === 'done') {
    return (
      <div
        ref={doneRef}
        role="status"
        tabIndex={-1}
        className="rounded-xl bg-primary/5 p-6 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <p className="mb-2 font-heading text-lg font-semibold text-neutral-dark">Konto zostało usunięte</p>
        <p className="mb-4 font-body text-sm text-neutral-dark/80">
          Nastąpiło wylogowanie. Kupione e-booki nadal możesz pobrać – podaj adres e-mail z zamówienia w formularzu
          „Wyślij link ponownie”.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <a href="/" className="btn btn-primary inline-block text-center">
            Przejdź na stronę główną
          </a>
          <a href="/sklep/wyslij-link" className="btn btn-secondary inline-block text-center">
            Wyślij link ponownie
          </a>
        </div>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setStatus('confirming')}
        className="rounded-lg border-2 border-red-600 px-6 py-3 font-body font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
      >
        Usuń konto
      </button>
    )
  }

  const loading = status === 'loading'

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="rounded-xl border border-red-200 bg-red-50/50 p-6"
      aria-describedby={consequencesId}
      aria-busy={loading}
    >
      <h3 className="mb-3 font-heading text-lg font-semibold text-neutral-dark">Czy na pewno chcesz usunąć konto?</h3>
      <ul id={consequencesId} className="mb-5 list-disc space-y-2 pl-5 font-body text-sm text-neutral-dark/80">
        <li>Konto i hasło zostaną usunięte od razu i nastąpi wylogowanie. Tej operacji nie można cofnąć.</li>
        <li>
          Dane zamówień (m.in. numer, e-mail, kwota, dane do faktury) przechowuję przez 5 lat od końca roku zakupu, zgodnie z przepisami
          podatkowymi, regulaminem sklepu i polityką prywatności.
        </li>
        <li>
          Nie stracisz kupionych e-booków: link do pobrania wyślesz sobie w każdej chwili przez formularz{' '}
          <a href="/sklep/wyslij-link" className="font-semibold text-primary underline">
            „Wyślij link ponownie”
          </a>
          .
        </li>
        <li>Konto możesz później założyć ponownie linkiem z maila z zakupem.</li>
      </ul>

      <label htmlFor={inputId} className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
        Aby potwierdzić, wpisz adres e-mail swojego konta
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="email"
        name="email"
        autoComplete="off"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        readOnly={loading}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-white px-4 py-3 font-body focus:outline-none focus:ring-2 focus:ring-primary ${
          error ? 'border-red-500' : 'border-neutral-dark/20'
        }`}
      />
      {error && (
        <p id={errorId} role="alert" className="mt-2 font-body text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          ref={submitRef}
          type="submit"
          aria-disabled={loading}
          className="rounded-lg bg-red-600 px-6 py-3 font-body font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 aria-disabled:cursor-wait aria-disabled:opacity-50"
        >
          {loading ? 'Usuwanie…' : 'Usuń konto na zawsze'}
        </button>
        <button type="button" onClick={cancel} disabled={loading} className="btn btn-secondary disabled:opacity-50">
          Anuluj
        </button>
      </div>
    </form>
  )
}
