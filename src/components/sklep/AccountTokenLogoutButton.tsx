import { useState } from 'react'

interface Props {
  /** Dokąd przejść po wylogowaniu (np. /logowanie?next=… albo ta sama strona konta) */
  redirectTo: string
  label: string
}

/**
 * Wylogowanie na stronie /sklep/konto/{token} (Task 4.4), gdy zalogowana jest na inne konto niż e-mail
 * z linku. POST /api/auth/logout, potem nawigacja na `redirectTo`. 401 (sesja już wygasła) traktujemy
 * jak sukces – ciasteczko i tak zostało wyczyszczone.
 */
export default function AccountTokenLogoutButton({ redirectTo, label }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    setError(false)
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
      if (!response.ok && response.status !== 401) throw new Error('logout failed')
      window.location.assign(redirectTo)
    } catch {
      setError(true)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-4 font-body text-sm text-red-700">
          Nie udało się wylogować. Spróbuj ponownie.
        </p>
      )}
      <button type="button" onClick={handleClick} disabled={busy} className="btn btn-primary disabled:opacity-50">
        {busy ? 'Wylogowywanie…' : label}
      </button>
    </div>
  )
}
