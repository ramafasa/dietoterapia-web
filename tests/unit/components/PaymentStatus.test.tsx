/**
 * PaymentStatus (/sklep/platnosc/sukces, Task 7.3): odpytywanie statusu zamówienia, stany końcowe,
 * 404 vs cookie_mismatch, 429 / błędy sieci, clearCart + Meta Pixel Purchase raz.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import PaymentStatus, { MAX_WAIT_MS, POLL_INTERVAL_MS } from '@/components/sklep/PaymentStatus'
import { addToCart, getCart } from '@/lib/shop/cart'

const ORDER_ID = '11111111-1111-4111-8111-111111111111'
const STATUS_URL = `/api/sklep/orders/${ORDER_ID}/status`

type Win = Window & { fbq?: unknown }

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function statusBody(overrides: Record<string, unknown> = {}) {
  return json({
    data: {
      status: 'pending',
      confirmationSent: false,
      orderNumber: 'SK-2026-000123',
      email: 'anna@example.com',
      items: [
        { id: 'item-1', title: 'Proteinowa Piekarnia', slug: 'proteinowa-piekarnia' },
        { id: 'item-2', title: 'Słodkie Śniadania', slug: 'slodkie-sniadania' },
      ],
      total: '68.00',
      accountState: 'link_sent',
      ...overrides,
    },
    error: null,
  })
}

const paid = (o: Record<string, unknown> = {}) => statusBody({ status: 'paid', confirmationSent: true, ...o })
const notFound = (code = 'not_found') => json({ data: null, error: { code, message: 'x' } }, 404)

/** fetch zwraca kolejne odpowiedzi (ostatnia powtarzana). Element `Error` → odrzucenie (błąd sieci). */
function mockFetch(responses: (() => Response | Error)[]) {
  let n = 0
  const fetchMock = vi.fn(async (url: string) => {
    if (url !== STATUS_URL) throw new Error(`unexpected fetch ${url}`)
    const r = responses[Math.min(n++, responses.length - 1)]()
    if (r instanceof Error) throw r
    return r
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** Przesuwa zegar i przepuszcza mikrozadania (fetch → json → setState). */
async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

async function renderStatus(props: Partial<{ orderId: string | null; shopEnabled: boolean }> = {}) {
  const utils = render(<PaymentStatus orderId={ORDER_ID} shopEnabled {...props} />)
  await advance(0)
  return utils
}

let fbq: ReturnType<typeof vi.fn>

describe('PaymentStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
    fbq = vi.fn()
    ;(window as Win).fbq = fbq
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    delete (window as Win).fbq
  })

  it('pending: spinner with role="status" and the Tpay message, keeps polling every 3 s', async () => {
    const fetchMock = mockFetch([() => statusBody()])
    await renderStatus()

    expect(screen.getByRole('status')).toHaveTextContent('Czekam na potwierdzenie płatności z Tpay…')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(STATUS_URL)

    await advance(POLL_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(POLL_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('paid without confirmation: "przygotowujemy potwierdzenie", no download buttons, keeps polling', async () => {
    addToCart('proteinowa-piekarnia')
    const fetchMock = mockFetch([() => statusBody({ status: 'paid', confirmationSent: false })])
    await renderStatus()

    expect(screen.getByRole('status')).toHaveTextContent('Płatność przyjęta, przygotowuję potwierdzenie…')
    expect(screen.queryByRole('link', { name: /Pobierz/ })).not.toBeInTheDocument()
    expect(getCart()).toEqual(['proteinowa-piekarnia'])
    expect(fbq).not.toHaveBeenCalled()

    await advance(POLL_INTERVAL_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('paid + confirmed: thank-you, download links per item, e-mail, stops polling, focus on heading', async () => {
    const fetchMock = mockFetch([() => statusBody(), () => paid()])
    await renderStatus()
    await advance(POLL_INTERVAL_MS)

    const heading = screen.getByRole('heading', { name: 'Dziękuję za zakup!' })
    expect(heading).toHaveFocus()
    expect(screen.getByText('Zamówienie SK-2026-000123')).toBeInTheDocument()

    const links = screen.getAllByRole('link', { name: /Pobierz PDF/ })
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      `/api/sklep/orders/${ORDER_ID}/items/item-1/download`,
      `/api/sklep/orders/${ORDER_ID}/items/item-2/download`,
    ])
    expect(links[0]).toHaveAccessibleName(/^Pobierz PDF ?: Proteinowa Piekarnia$/) // happy-dom: spacja przed sr-only
    expect(screen.getByText(/Link do pobrania wysłałam też na/)).toHaveTextContent('anna@example.com')

    await advance(MAX_WAIT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('paid + confirmed: clears the cart and tracks Purchase once (slugs + total, no PII), also across re-renders', async () => {
    addToCart('proteinowa-piekarnia')
    addToCart('slodkie-sniadania')
    mockFetch([() => paid()])
    const { rerender } = await renderStatus()

    expect(getCart()).toEqual([])
    expect(fbq).toHaveBeenCalledTimes(1)
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', {
      value: 68,
      currency: 'PLN',
      content_ids: ['proteinowa-piekarnia', 'slodkie-sniadania'],
      content_type: 'product',
      num_items: 2,
    })
    expect(JSON.stringify(fbq.mock.calls)).not.toMatch(/anna@example\.com|SK-2026|Proteinowa Piekarnia/)

    addToCart('inny-ebook')
    rerender(<PaymentStatus orderId={ORDER_ID} shopEnabled />)
    await advance(POLL_INTERVAL_MS)
    expect(fbq).toHaveBeenCalledTimes(1)
    expect(getCart()).toEqual(['inny-ebook'])
  })

  it('does not track Purchase twice after a page reload (localStorage)', async () => {
    mockFetch([() => paid()])
    await renderStatus()
    cleanup()
    await renderStatus()

    expect(screen.getByRole('heading', { name: 'Dziękuję za zakup!' })).toBeInTheDocument()
    expect(fbq).toHaveBeenCalledTimes(1)
  })

  it('account section: link_sent', async () => {
    mockFetch([() => paid({ accountState: 'link_sent' })])
    await renderStatus()
    expect(screen.getByText(/Link do założenia konta wysłałam na/)).toHaveTextContent('anna@example.com')
  })

  it('account section: exists – log in via the mail link (login alone does not attach the order)', async () => {
    mockFetch([() => paid({ accountState: 'exists' })])
    await renderStatus()
    expect(screen.getByText('Zaloguj się – zakup pojawi się w Twoim koncie')).toBeInTheDocument()
    expect(screen.queryByText(/Link do założenia konta/)).not.toBeInTheDocument()
  })

  it('account section: none (logged-in owner) – link to Moje zakupy', async () => {
    mockFetch([() => paid({ accountState: 'none' })])
    await renderStatus()
    expect(screen.getByRole('link', { name: 'Moich zakupach' })).toHaveAttribute('href', '/konto/zakupy')
  })

  it('failed: message + "Wróć do koszyka", stops polling, focus on heading', async () => {
    const fetchMock = mockFetch([() => statusBody({ status: 'failed' })])
    await renderStatus()

    expect(screen.getByRole('heading', { name: 'Płatność nie powiodła się' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Wróć do koszyka' })).toHaveAttribute('href', '/sklep/koszyk')
    await advance(MAX_WAIT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('expired: spec message + cart link; no cart link when the shop is disabled', async () => {
    mockFetch([() => statusBody({ status: 'expired' })])
    await renderStatus()
    expect(
      screen.getByText('Zamówienie wygasło. Jeśli płatność mimo to wpłynęła, napiszę do Ciebie mailem.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wróć do koszyka' })).toBeInTheDocument()

    cleanup()
    await renderStatus({ shopEnabled: false })
    expect(screen.getByRole('heading', { name: 'Zamówienie wygasło' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Wróć do koszyka' })).not.toBeInTheDocument()
  })

  it('does not clear the cart or track for failed / expired', async () => {
    addToCart('proteinowa-piekarnia')
    mockFetch([() => statusBody({ status: 'failed' })])
    await renderStatus()
    expect(getCart()).toEqual(['proteinowa-piekarnia'])
    expect(fbq).not.toHaveBeenCalled()
  })

  it('404 not_found (no cookie / other browser): "przetwarzana" + resend link, stops polling', async () => {
    const fetchMock = mockFetch([() => notFound()])
    await renderStatus()

    expect(screen.getByRole('heading', { name: 'Płatność jest przetwarzana' })).toHaveFocus()
    expect(screen.getByText(/Link do pobrania przyjdzie mailem w ciągu kilku minut/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wyślij link ponownie' })).toHaveAttribute('href', '/sklep/wyslij-link')
    await advance(MAX_WAIT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('404 cookie_mismatch: "Link do pobrania wysłałam na Twój e‑mail" (no error, non-breaking hyphen)', async () => {
    mockFetch([() => notFound('cookie_mismatch')])
    await renderStatus()

    expect(screen.getByRole('heading', { name: 'Link do pobrania wysłałam na Twój e\u2011mail' })).toHaveFocus()
    expect(screen.getByRole('link', { name: 'Wyślij link ponownie' })).toBeInTheDocument()
    expect(screen.queryByText('Płatność jest przetwarzana')).not.toBeInTheDocument()
  })

  it('times out after 60 s of pending: "przetwarzana", ~21 requests, then no more', async () => {
    const fetchMock = mockFetch([() => statusBody()])
    await renderStatus()

    await advance(MAX_WAIT_MS - 1)
    expect(screen.queryByRole('heading', { name: 'Płatność jest przetwarzana' })).not.toBeInTheDocument()
    await advance(1)
    expect(screen.getByRole('heading', { name: 'Płatność jest przetwarzana' })).toHaveFocus()

    const calls = fetchMock.mock.calls.length
    expect(calls).toBe(MAX_WAIT_MS / POLL_INTERVAL_MS + 1)
    await advance(MAX_WAIT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(calls)
  })

  it('times out while paid but unconfirmed: "Płatność przyjęta – potwierdzenie…" + resend link, no downloads', async () => {
    mockFetch([() => statusBody({ status: 'paid', confirmationSent: false })])
    await renderStatus()
    await advance(MAX_WAIT_MS)

    expect(screen.getByRole('heading', { name: 'Płatność przyjęta' })).toHaveFocus()
    expect(
      screen.getByText(/Płatność przyjęta – potwierdzenie z linkiem do pobrania przyjdzie mailem w ciągu kilku minut\./)
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Wyślij link ponownie' })).toHaveAttribute('href', '/sklep/wyslij-link')
    expect(screen.queryByRole('link', { name: /Pobierz/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Płatność jest przetwarzana')).not.toBeInTheDocument()
  })

  it('429: waits Retry-After before the next request, keeps the pending UI, then continues', async () => {
    const fetchMock = mockFetch([
      () => json({ data: null, error: { code: 'rate_limit_exceeded' } }, 429, { 'Retry-After': '10' }),
      () => paid(),
    ])
    await renderStatus()

    expect(screen.getByRole('status')).toHaveTextContent('Czekam na potwierdzenie')
    await advance(9_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'Dziękuję za zakup!' })).toBeInTheDocument()
  })

  it('429 with Retry-After past the 60 s window: last try at 60 s, then "przetwarzana"', async () => {
    const fetchMock = mockFetch([
      () => json({ data: null, error: { code: 'rate_limit_exceeded' } }, 429, { 'Retry-After': '600' }),
    ])
    await renderStatus()
    await advance(MAX_WAIT_MS - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'Płatność jest przetwarzana' })).toBeInTheDocument()
  })

  it('network errors and 5xx: exponential backoff (6 s, 12 s), then recovers', async () => {
    const fetchMock = mockFetch([
      () => new TypeError('Failed to fetch'),
      () => json({ data: null, error: { code: 'internal_server_error' } }, 500),
      () => paid(),
    ])
    await renderStatus()
    expect(screen.getByRole('status')).toHaveTextContent('Czekam na potwierdzenie')

    await advance(5_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(11_999)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(1)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(screen.getByRole('heading', { name: 'Dziękuję za zakup!' })).toBeInTheDocument()
  })

  it('stops polling on unmount', async () => {
    const fetchMock = mockFetch([() => statusBody()])
    const { unmount } = await renderStatus()
    unmount()
    await advance(MAX_WAIT_MS)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('orderId null (missing / invalid ?order=): "przetwarzana" immediately, no fetch, no focus steal', async () => {
    const fetchMock = mockFetch([() => statusBody()])
    await renderStatus({ orderId: null })

    const heading = screen.getByRole('heading', { name: 'Płatność jest przetwarzana' })
    expect(heading).not.toHaveFocus()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('a11y: no aria-live on the card; interim states in role="status"; final states without it', async () => {
    mockFetch([() => statusBody(), () => statusBody({ status: 'failed' })])
    const { container } = await renderStatus()
    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Czekam na potwierdzenie płatności z Tpay…')

    await advance(POLL_INTERVAL_MS)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Płatność nie powiodła się' })).toHaveFocus()
  })

  it('aborts a hanging request after 10 s and retries with backoff (6 s)', async () => {
    let n = 0
    const signals: AbortSignal[] = []
    const fetchMock = vi.fn((_url: string, init?: Parameters<typeof fetch>[1]) => {
      n++
      if (n > 1) return Promise.resolve(paid())
      const signal = init!.signal!
      signals.push(signal)
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    await renderStatus()

    await advance(9_999)
    expect(signals[0].aborted).toBe(false)
    await advance(1)
    expect(signals[0].aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await advance(6_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { name: 'Dziękuję za zakup!' })).toBeInTheDocument()
  })

  it('aborts when the body hangs after headers (timer cleared only after the body is read)', async () => {
    const fetchMock = vi.fn((_url: string, init?: Parameters<typeof fetch>[1]) => {
      const signal = init!.signal!
      const res = new Response(null, { status: 200 })
      Object.defineProperty(res, 'json', {
        value: () =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
          }),
      })
      return Promise.resolve(res)
    })
    vi.stubGlobal('fetch', fetchMock)
    await renderStatus()

    await advance(10_000)
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true)
    await advance(6_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('slow request (5 s): only one request in flight, next one 3 s after the response', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          inFlight++
          maxInFlight = Math.max(maxInFlight, inFlight)
          setTimeout(() => {
            inFlight--
            resolve(statusBody())
          }, 5_000)
        })
    )
    vi.stubGlobal('fetch', fetchMock)
    await renderStatus()

    await advance(4_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1) // odpowiedź po 5 s
    await advance(2_999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await advance(1) // 8 s: drugie żądanie
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await advance(20_000)
    expect(maxInFlight).toBe(1)
  })

  it('Purchase without consent (no fbq): not marked, so a reload after consent tracks it', async () => {
    delete (window as Win).fbq
    mockFetch([() => paid()])
    await renderStatus()
    expect(screen.getByRole('heading', { name: 'Dziękuję za zakup!' })).toBeInTheDocument()
    expect(localStorage.getItem(`sklep:purchase-tracked:${ORDER_ID}`)).toBeNull()

    // zgoda w CookieBanner przeładowuje stronę – MetaPixel.astro tworzy fbq przy ładowaniu
    cleanup()
    ;(window as Win).fbq = fbq
    await renderStatus()
    expect(fbq).toHaveBeenCalledTimes(1)
    expect(fbq).toHaveBeenCalledWith('track', 'Purchase', expect.objectContaining({ value: 68 }))
    expect(localStorage.getItem(`sklep:purchase-tracked:${ORDER_ID}`)).toBe('1')
  })
})
