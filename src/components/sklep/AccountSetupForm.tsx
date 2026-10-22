import { useState, type FormEvent, type ReactNode } from 'react'
import { hashPasswordClient } from '@/lib/crypto'

const MIN_PASSWORD_LENGTH = 8 // jak signupSchemaClient
const PURCHASES_PATH = '/konto/zakupy'
const RESEND_LINK_PATH = '/sklep/wyslij-link'

type Mode = 'create' | 'attach'

interface Props {
  /** `create` – ustaw hasło i załóż konto; `attach` – przypisz zakupy do zalogowanego konta */
  mode: Mode
  /** Token z URL (tylko do zbudowania adresu endpointu) */
  token: string
  /** E-mail z tokenu – pokazywany tylko do odczytu w trybie `create` */
  email?: string
}

type ApiBody = {
  data: { result: string; count?: number; redirectTo?: string } | null
  error: { code: string; message: string } | null
}

const GENERIC_ERROR = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.'

function messageFor(status: number, body: ApiBody | null): ReactNode {
  if (status === 404) {
    return (
      <>
        Link wygasł lub został już użyty.{' '}
        <a href={RESEND_LINK_PATH} className="font-semibold underline">
          Wyślij nowy link
        </a>
      </>
    )
  }
  if (status === 429) return 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.'
  if (status === 409 && body?.error?.code === 'login_required') {
    return 'Konto z tym adresem już istnieje – odśwież stronę i zaloguj się.'
  }
  if (status === 409 && body?.error?.code === 'different_account') {
    return 'Jesteś zalogowana na inne konto – odśwież stronę.'
  }
  return body?.error?.message ?? GENERIC_ERROR
}

function pluralizeOrders(count: number): string {
  if (count === 1) return 'zamówienie'
  const lastTwo = count % 100
  const last = count % 10
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return 'zamówienia'
  return 'zamówień'
}

/**
 * Wyspa strony /sklep/konto/{token} (Task 4.4).
 * - `create`: hasło + powtórzenie (min. 8 znaków), SHA-256 w przeglądarce (hashPasswordClient),
 *   POST { passwordHash } → 201 → przekierowanie na /konto/zakupy (sesję ustawia endpoint).
 * - `attach`: POST {} → 200 { count } → komunikat + link do /konto/zakupy.
 */
export default function AccountSetupForm({ mode, token, email }: Props) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<ReactNode>(null)
  const [submitting, setSubmitting] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [attachedCount, setAttachedCount] = useState<number | null>(null)

  const endpoint = `/api/sklep/konto/${encodeURIComponent(token)}`

  async function post(body: Record<string, string>): Promise<{ status: number; body: ApiBody | null }> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    })
    let parsed: ApiBody | null = null
    try {
      parsed = (await response.json()) as ApiBody
    } catch {
      parsed = null
    }
    return { status: response.status, body: parsed }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || redirecting) return
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setFieldError(`Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`)
      return
    }
    if (password !== confirmPassword) {
      setFieldError('Podane hasła nie są zgodne')
      return
    }
    setFieldError(null)

    setSubmitting(true)
    try {
      const passwordHash = await hashPasswordClient(password)
      const { status, body } = await post({ passwordHash })
      if (status === 201) {
        setRedirecting(true)
        window.location.assign(body?.data?.redirectTo ?? PURCHASES_PATH)
        return
      }
      setError(messageFor(status, body))
    } catch (err) {
      setError(err instanceof Error && err.message.includes('przeglądarka') ? err.message : GENERIC_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAttach() {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const { status, body } = await post({})
      if (status === 200) {
        setAttachedCount(body?.data?.count ?? 0)
        return
      }
      setError(messageFor(status, body))
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const errorBox = error && (
    <p role="alert" className="rounded-lg bg-red-50 p-4 font-body text-sm text-red-700">
      {error}
    </p>
  )

  if (mode === 'attach') {
    if (attachedCount !== null) {
      return (
        <div role="status" className="space-y-4">
          <p className="font-body text-neutral-dark">
            {attachedCount > 0
              ? `Gotowe! Przypisałam ${attachedCount} ${pluralizeOrders(attachedCount)} do Twojego konta.`
              : 'Gotowe! Wszystkie Twoje zakupy są już w Twoim koncie.'}
          </p>
          <a href={PURCHASES_PATH} className="btn btn-primary inline-block">
            Przejdź do moich zakupów
          </a>
        </div>
      )
    }
    return (
      <div className="space-y-4">
        {errorBox}
        <button type="button" onClick={handleAttach} disabled={submitting} className="btn btn-primary disabled:opacity-50">
          {submitting ? 'Przypisywanie…' : 'Przypisz zakupy do mojego konta'}
        </button>
      </div>
    )
  }

  const inputClass = (invalid: boolean) =>
    `w-full rounded-lg border px-4 py-3 font-body focus:outline-none focus:ring-2 focus:ring-primary ${
      invalid ? 'border-red-500' : 'border-gray-300'
    }`
  const busy = submitting || redirecting

  return (
    <form onSubmit={handleCreate} noValidate className="space-y-6">
      <div>
        <label htmlFor="account-email" className="mb-2 block text-sm font-medium text-neutral-dark">
          Adres e-mail
        </label>
        <input
          id="account-email"
          type="email"
          value={email ?? ''}
          readOnly
          autoComplete="username"
          className="w-full rounded-lg border border-gray-200 bg-neutral-light px-4 py-3 font-body text-neutral-dark/80"
        />
      </div>

      <div>
        <label htmlFor="account-password" className="mb-2 block text-sm font-medium text-neutral-dark">
          Hasło
        </label>
        <div className="relative">
          <input
            id="account-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={MIN_PASSWORD_LENGTH}
            required
            disabled={busy}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? 'account-password-hint account-password-error' : 'account-password-hint'}
            className={`${inputClass(!!fieldError)} pr-24`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-neutral-dark hover:text-primary"
            aria-pressed={showPassword}
            disabled={busy}
          >
            {showPassword ? 'Ukryj' : 'Pokaż'}
          </button>
        </div>
        <p id="account-password-hint" className="mt-1 text-sm text-neutral-dark/70">
          Co najmniej {MIN_PASSWORD_LENGTH} znaków.
        </p>
      </div>

      <div>
        <label htmlFor="account-password-confirm" className="mb-2 block text-sm font-medium text-neutral-dark">
          Powtórz hasło
        </label>
        <input
          id="account-password-confirm"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          disabled={busy}
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? 'account-password-error' : undefined}
          className={inputClass(!!fieldError)}
        />
        {fieldError && (
          <p id="account-password-error" role="alert" className="mt-1 text-sm text-red-500">
            {fieldError}
          </p>
        )}
      </div>

      {errorBox}

      <button type="submit" disabled={busy} className="btn btn-primary w-full disabled:opacity-50">
        {redirecting ? 'Przekierowanie…' : submitting ? 'Zakładanie konta…' : 'Ustaw hasło i załóż konto'}
      </button>
    </form>
  )
}
