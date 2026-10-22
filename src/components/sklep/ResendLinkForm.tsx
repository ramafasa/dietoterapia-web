import { useEffect, useRef, useState } from 'react'
import { RESEND_LINK_MESSAGE } from '@/lib/shop/resendLink'

type Status = 'idle' | 'loading' | 'done'

/** Minuty z nagłówka Retry-After (sekundy); null, gdy brak / niepoprawny. */
function retryAfterMinutes(res: Response): number | null {
  const seconds = Number(res.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : null
}

function minutesLabel(n: number): string {
  if (n === 1) return '1 minutę'
  const lastTwo = n % 100
  const last = n % 10
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
  return `${n} ${few ? 'minuty' : 'minut'}`
}

/**
 * Formularz „Wyślij link ponownie” (/sklep/wyslij-link) → POST /api/sklep/resend-link.
 *
 * Po wysłaniu zawsze ten sam komunikat (serwer też odpowiada identycznie – ochrona przed enumeracją).
 * Wyjątki: 400 (zły e-mail) → błąd przy polu, 429 (limit IP) → prośba o odczekanie.
 * Komunikat sukcesu w stałym regionie aria-live + fokus na nim (czytniki ekranu).
 */
export default function ResendLinkForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState<string | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [focusInput, setFocusInput] = useState(false)

  useEffect(() => {
    if (status === 'done') messageRef.current?.focus()
  }, [status])

  useEffect(() => {
    if (focusInput && status === 'idle') {
      inputRef.current?.focus()
      setFocusInput(false)
    }
  }, [focusInput, status])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setStatus('loading')

    try {
      const res = await fetch('/api/sklep/resend-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.status === 400) {
        const body = await res.json().catch(() => null)
        setError(body?.error?.message ?? 'Podaj poprawny adres e-mail')
        setStatus('idle')
        return
      }
      if (res.status === 429) {
        const minutes = retryAfterMinutes(res)
        setError(
          minutes
            ? `Zbyt wiele prób z tego urządzenia. Spróbuj ponownie za ${minutesLabel(minutes)}.`
            : 'Zbyt wiele prób z tego urządzenia. Spróbuj ponownie później.'
        )
        setStatus('idle')
        return
      }
      if (!res.ok) {
        setError('Coś poszło nie tak. Spróbuj ponownie za chwilę.')
        setStatus('idle')
        return
      }
      setStatus('done')
    } catch {
      setError('Brak połączenia. Sprawdź internet i spróbuj ponownie.')
      setStatus('idle')
    }
  }

  function reset() {
    setEmail('')
    setError(null)
    setStatus('idle')
    setFocusInput(true)
  }

  const loading = status === 'loading'
  const done = status === 'done'

  return (
    <div>
      {/* Stały region – czytniki ekranu ogłaszają zmianę treści */}
      <div
        ref={messageRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className={done ? 'rounded-xl bg-primary/5 p-6 focus:outline-none focus:ring-2 focus:ring-primary' : 'sr-only'}
      >
        {done && (
          <>
            <p className="mb-2 font-heading text-lg font-semibold text-neutral-dark">{RESEND_LINK_MESSAGE}</p>
            <p className="mb-2 font-body text-sm text-neutral-dark/80">
              Sprawdź skrzynkę (także folder spam). Nic nie przyszło? Upewnij się, że to adres podany przy zakupie.
            </p>
            <p className="font-body text-sm text-neutral-dark/80">
              Jeśli prosiłaś o link w ciągu ostatniej godziny, poczekaj chwilę – wysyłamy najwyżej kilka wiadomości
              na godzinę.
            </p>
          </>
        )}
      </div>

      {done ? (
        <button type="button" onClick={reset} className="btn btn-secondary mt-6">
          Wpisz inny adres
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="resend-email" className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
              Adres e-mail
            </label>
            <input
              ref={inputRef}
              id="resend-email"
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              placeholder="twoj@email.pl"
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? 'resend-email-error' : undefined}
              className={`w-full rounded-lg border px-4 py-3 font-body focus:outline-none focus:ring-2 focus:ring-primary ${
                error ? 'border-red-500' : 'border-neutral-dark/20'
              }`}
            />
            {error && (
              <p id="resend-email-error" className="mt-2 font-body text-sm text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
          <button type="submit" disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
            {loading ? 'Wysyłanie…' : 'Wyślij link'}
          </button>
        </form>
      )}
    </div>
  )
}
