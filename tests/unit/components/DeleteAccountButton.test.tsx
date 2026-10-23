/**
 * DeleteAccountButton (/konto/ustawienia, Task 6.5): potwierdzenie wpisaniem e-maila konta,
 * POST /api/konto/delete, komunikaty błędów i stan „Konto zostało usunięte”.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import DeleteAccountButton, { emailMatches } from '@/components/sklep/DeleteAccountButton'

const EMAIL = 'anna@example.com'

function open() {
  render(<DeleteAccountButton accountEmail={EMAIL} />)
  fireEvent.click(screen.getByRole('button', { name: 'Usuń konto' }))
}

function typeAndSubmit(value: string) {
  fireEvent.change(screen.getByLabelText(/wpisz adres e-mail swojego konta/i), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Usuń konto na zawsze' }))
}

describe('DeleteAccountButton', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('emailMatches: trimmed, case-insensitive', () => {
    expect(emailMatches('  Anna@Example.COM ', EMAIL)).toBe(true)
    expect(emailMatches('ola@example.com', EMAIL)).toBe(false)
    expect(emailMatches('', EMAIL)).toBe(false)
  })

  it('shows consequences (5 years, „Wyślij link ponownie”) after clicking „Usuń konto”', () => {
    open()
    expect(screen.getByText(/5 lat od końca roku zakupu/)).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /Wyślij link ponownie/ })[0].getAttribute('href')).toBe(
      '/sklep/wyslij-link'
    )
  })

  it('wrong e-mail → error, no request', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    open()
    typeAndSubmit('ola@example.com')
    expect(screen.getByRole('alert').textContent).toContain('nie zgadza się')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('cancel goes back to the button and restores focus to it', () => {
    open()
    expect(document.activeElement).toBe(screen.getByLabelText(/wpisz adres e-mail swojego konta/i))
    fireEvent.click(screen.getByRole('button', { name: 'Anuluj' }))
    const trigger = screen.getByRole('button', { name: 'Usuń konto' })
    expect(document.activeElement).toBe(trigger)
  })

  it('while loading: one request only, aria-busy form, focus stays on the submit button', async () => {
    let resolve!: (r: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)))
    vi.stubGlobal('fetch', fetchMock)
    open()
    typeAndSubmit(EMAIL)

    const submit = await screen.findByRole('button', { name: 'Usuwanie…' })
    expect(submit.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(submit)
    expect(submit.closest('form')?.getAttribute('aria-busy')).toBe('true')

    fireEvent.click(submit)
    fireEvent.submit(submit.closest('form')!)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolve(new Response(JSON.stringify({ data: { deleted: true }, error: null })))
    await waitFor(() => expect(screen.getByText('Konto zostało usunięte')).toBeTruthy())
  })

  it('success → POST with the typed e-mail and „Konto zostało usunięte”', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { deleted: true }, error: null })))
    vi.stubGlobal('fetch', fetchMock)
    open()
    typeAndSubmit('Anna@Example.com')

    await waitFor(() => expect(screen.getByText('Konto zostało usunięte')).toBeTruthy())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/konto/delete',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'Anna@Example.com' }) })
    )
    expect(screen.getByRole('link', { name: 'Przejdź na stronę główną' }).getAttribute('href')).toBe('/')
  })

  it('409 → server message, form stays', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: null, error: { code: 'conflict', message: 'Napisz do mnie' } }), {
            status: 409,
          })
      )
    )
    open()
    typeAndSubmit(EMAIL)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Napisz do mnie'))
    expect(screen.getByRole('button', { name: 'Usuń konto na zawsze' })).toBeTruthy()
  })

  it('500 / network error → generic message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    open()
    typeAndSubmit(EMAIL)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Coś poszło nie tak'))

    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    fireEvent.click(screen.getByRole('button', { name: 'Usuń konto na zawsze' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Brak połączenia'))
  })
})
