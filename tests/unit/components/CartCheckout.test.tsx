/**
 * CartCheckout (/sklep/koszyk, Task 7.2): wycena koszyka, formularz zamówienia, obsługa odpowiedzi
 * POST /api/sklep/orders i Meta Pixel InitiateCheckout.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import toast from 'react-hot-toast'
import CartCheckout from '@/components/sklep/CartCheckout'
import { addToCart, getCart } from '@/lib/shop/cart'
import { TERMS_CONSENT_LABEL, DIGITAL_CONTENT_CONSENT_TEXT } from '@/lib/shop/constants'

vi.mock('react-hot-toast', () => {
  const fn = Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() })
  return { default: fn, toast: fn }
})

const SLUG = 'proteinowa-piekarnia'
const ITEM = { productId: 'p1', slug: SLUG, title: 'Proteinowa Piekarnia', price: '29.00' }
const ITEM2 = { productId: 'p2', slug: 'drugi-ebook', title: 'Drugi e-book', price: '19.50' }

type Win = Window & { fbq?: unknown }

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
}

function quote(items = [ITEM], removedSlugs: string[] = []) {
  const total = items.reduce((a, i) => a + Number(i.price), 0).toFixed(2)
  return json({ data: { items, removedSlugs, total }, error: null })
}

/** fetch: /cart/quote → kolejne odpowiedzi z `quotes` (ostatnia powtarzana), /orders → `order()` */
function mockFetch({ quotes = [() => quote()], order }: { quotes?: (() => Response)[]; order?: () => Response | Promise<Response> }) {
  let q = 0
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/sklep/cart/quote') return quotes[Math.min(q++, quotes.length - 1)]()
    if (url === '/api/sklep/orders' && order) return order()
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const ordersCalls = (f: ReturnType<typeof mockFetch>) => f.mock.calls.filter(([u]) => u === '/api/sklep/orders')
const orderBody = (f: ReturnType<typeof mockFetch>, n = 0) => JSON.parse(String(ordersCalls(f)[n][1]?.body))

const payButton = () => screen.getByRole('button', { name: /Zamawiam i płacę/ })

function fillValid({ email = 'Anna@Example.com ' } = {}) {
  const emailInput = screen.queryByLabelText('Adres e-mail') as HTMLInputElement
  if (emailInput && !emailInput.readOnly) fireEvent.change(emailInput, { target: { value: email } })
  fireEvent.click(screen.getByLabelText(TERMS_CONSENT_LABEL))
  fireEvent.click(screen.getByLabelText(DIGITAL_CONTENT_CONSENT_TEXT))
}

let assignSpy: ReturnType<typeof vi.fn>
const originalLocation = window.location

describe('CartCheckout', () => {
  beforeEach(() => {
    localStorage.clear()
    assignSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy, href: 'http://localhost/sklep/koszyk' },
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    delete (window as Win).fbq
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('empty cart → „Koszyk jest pusty” + link to /sklep, no quote request', async () => {
    const f = mockFetch({})
    render(<CartCheckout sessionEmail={null} />)
    expect(await screen.findByText('Koszyk jest pusty')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Przejdź do sklepu' }).getAttribute('href')).toBe('/sklep')
    expect(f).not.toHaveBeenCalled()
  })

  it('shows quoted items, total and the legal pay button text', async () => {
    addToCart(SLUG)
    mockFetch({})
    render(<CartCheckout sessionEmail={null} covers={{ [SLUG]: { src: '/c.webp', width: 128, height: 181 } }} />)
    expect(await screen.findByText('Proteinowa Piekarnia')).toBeTruthy()
    expect(payButton().textContent).toBe('Zamawiam i płacę 29,00 zł')
    expect(screen.getByText('Płatność obsługuje Tpay. Po opłaceniu e-book wyślemy na podany e-mail.')).toBeTruthy()
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/c.webp')
  })

  it('quote with removedSlugs → removed from cart + toast', async () => {
    addToCart(SLUG)
    addToCart('wycofany')
    mockFetch({ quotes: [() => quote([ITEM], ['wycofany'])] })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    await waitFor(() => expect(getCart()).toEqual([SLUG]))
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('nie jest już dostępna'))
  })

  it('„Usuń” removes the item and recalculates the total', async () => {
    addToCart(SLUG)
    addToCart(ITEM2.slug)
    mockFetch({ quotes: [() => quote([ITEM, ITEM2])] })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Drugi e-book')
    expect(payButton().textContent).toBe('Zamawiam i płacę 48,50 zł')
    fireEvent.click(screen.getByRole('button', { name: /Usuń.*Drugi e-book/ }))
    expect(payButton().textContent).toBe('Zamawiam i płacę 29,00 zł')
    expect(getCart()).toEqual([SLUG])
  })

  it('terms label = TERMS_CONSENT_LABEL with links opening in a new tab', async () => {
    addToCart(SLUG)
    mockFetch({})
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    const label = document.querySelector('label[for="checkout-terms"]')!
    expect(label.textContent).toBe(TERMS_CONSENT_LABEL)
    const links = Array.from(label.querySelectorAll('a'))
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/regulamin-sklepu', '/polityka-prywatnosci'])
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank')
      expect(a.getAttribute('rel')).toContain('noopener')
    }
    expect(screen.getByLabelText(DIGITAL_CONTENT_CONSENT_TEXT)).toBeTruthy()
  })

  it('validation: errors with aria-describedby, focus on the first error, no request', async () => {
    addToCart(SLUG)
    const f = mockFetch({})
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fireEvent.change(screen.getByLabelText('Adres e-mail'), { target: { value: 'zly-email' } })
    fireEvent.click(payButton())

    const email = screen.getByLabelText('Adres e-mail')
    await waitFor(() => expect(document.activeElement).toBe(email))
    expect(email.getAttribute('aria-invalid')).toBe('true')
    const errId = email.getAttribute('aria-describedby')!
    expect(document.getElementById(errId)?.textContent).toBe('Podaj poprawny adres e-mail')
    expect(screen.getByText('Zaakceptuj regulamin')).toBeTruthy()
    expect(screen.getByText('Ta zgoda jest wymagana do natychmiastowej wysyłki e-booka')).toBeTruthy()
    expect(ordersCalls(f)).toHaveLength(0)
  })

  it('invoice: fields appear after checking „Chcę fakturę”, NIP checksum validated', async () => {
    addToCart(SLUG)
    const f = mockFetch({ order: () => json({ data: { orderId: 'o1', redirectUrl: 'https://tpay/x' }, error: null }, 201) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    expect(screen.queryByLabelText('NIP')).toBeNull()
    fireEvent.click(screen.getByLabelText('Chcę fakturę'))
    fillValid()
    fireEvent.change(screen.getByLabelText('Nazwa firmy'), { target: { value: 'Firma sp. z o.o.' } })
    fireEvent.change(screen.getByLabelText('NIP'), { target: { value: '1234567890' } })
    fireEvent.change(screen.getByLabelText('Adres firmy'), { target: { value: 'ul. Długa 1, Łódź' } })
    fireEvent.click(payButton())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('NIP')))
    expect(screen.getByText('Nieprawidłowy NIP')).toBeTruthy()
    expect(ordersCalls(f)).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('NIP'), { target: { value: '827-224-72-79' } })
    fireEvent.click(payButton())
    await waitFor(() => expect(ordersCalls(f)).toHaveLength(1))
    expect(orderBody(f).invoice).toEqual({ companyName: 'Firma sp. z o.o.', nip: '8272247279', address: 'ul. Długa 1, Łódź' })
  })

  it('submit: sends normalized body, InitiateCheckout without PII, redirects to Tpay, keeps cart', async () => {
    addToCart(SLUG)
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    const f = mockFetch({ order: () => json({ data: { orderId: 'o1', redirectUrl: 'https://secure.tpay.com/x' }, error: null }, 201) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    fireEvent.change(screen.getByLabelText(/Imię/), { target: { value: ' Anna ' } })
    fireEvent.click(screen.getByLabelText(/Załóż konto/))
    fireEvent.click(payButton())

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://secure.tpay.com/x'))
    expect(orderBody(f)).toEqual({
      slugs: [SLUG],
      email: 'anna@example.com',
      firstName: 'Anna',
      acceptTerms: true,
      acceptDigitalContent: true,
      expectedTotal: '29.00',
      createAccount: true,
    })
    expect(fbq).toHaveBeenCalledWith('track', 'InitiateCheckout', {
      value: 29,
      currency: 'PLN',
      content_ids: [SLUG],
      content_type: 'product',
      num_items: 1,
    })
    expect(JSON.stringify(fbq.mock.calls)).not.toMatch(/anna|@/i)
    expect(getCart()).toEqual([SLUG])
    expect(payButton().hasAttribute('disabled')).toBe(true) // zablokowany do końca nawigacji
  })

  it('double click → one request; button disabled + aria-busy while pending', async () => {
    addToCart(SLUG)
    let resolve!: (r: Response) => void
    const f = mockFetch({ order: () => new Promise<Response>((r) => (resolve = r)) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    const form = payButton().closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    fireEvent.click(payButton())
    await waitFor(() => expect(payButton().getAttribute('aria-busy')).toBe('true'))
    expect(payButton().hasAttribute('disabled')).toBe(true)
    expect(form.getAttribute('aria-busy')).toBe('true')
    expect(ordersCalls(f)).toHaveLength(1)
    resolve(json({ data: null, error: { code: 'payment_init_failed', message: 'Nie udało się rozpocząć płatności.' } }, 502))
    await waitFor(() => expect(payButton().hasAttribute('disabled')).toBe(false))
  })

  it('logged in: e-mail readOnly („Kupujesz jako”), no „Załóż konto”, session e-mail sent', async () => {
    addToCart(SLUG)
    const f = mockFetch({ order: () => json({ data: { orderId: 'o1', redirectUrl: 'https://tpay/x' }, error: null }, 201) })
    render(<CartCheckout sessionEmail="ola@example.com" />)
    await screen.findByText('Proteinowa Piekarnia')
    const email = screen.getByLabelText('Adres e-mail') as HTMLInputElement
    expect(email.readOnly).toBe(true)
    expect(email.value).toBe('ola@example.com')
    expect(screen.getByText(/Kupujesz jako/)).toBeTruthy()
    expect(email.getAttribute('aria-describedby')).toBe('checkout-email-hint')
    expect(screen.queryByLabelText(/Załóż konto/)).toBeNull()
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(ordersCalls(f)).toHaveLength(1))
    const body = orderBody(f)
    expect(body.email).toBe('ola@example.com')
    expect(body).not.toHaveProperty('createAccount')
  })

  it('409 cart_changed → toast + re-quote (cart cleaned, total updated)', async () => {
    addToCart(SLUG)
    addToCart(ITEM2.slug)
    const f = mockFetch({
      quotes: [() => quote([ITEM, ITEM2]), () => quote([ITEM], [ITEM2.slug])],
      order: () =>
        json({ data: null, error: { code: 'cart_changed', message: 'Część produktów w koszyku jest już niedostępna.', details: { removedSlugs: [ITEM2.slug] } } }, 409),
    })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Drugi e-book')
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(payButton().textContent).toBe('Zamawiam i płacę 29,00 zł'))
    expect(toast.error).toHaveBeenCalledWith('Część produktów w koszyku jest już niedostępna.')
    expect(toast.error).toHaveBeenCalledTimes(1) // bez drugiego toastu z wyceny
    expect(getCart()).toEqual([SLUG])
    expect(f.mock.calls.filter(([u]) => u === '/api/sklep/cart/quote')).toHaveLength(2)
  })

  it('409 already_owned → message with link to /konto/zakupy, owned items removable', async () => {
    addToCart(SLUG)
    addToCart(ITEM2.slug)
    mockFetch({
      quotes: [() => quote([ITEM, ITEM2])],
      order: () =>
        json({ data: null, error: { code: 'already_owned', message: 'Masz już ten e-book na swoim koncie.', details: { ownedSlugs: [SLUG], redirectUrl: '/konto/zakupy' } } }, 409),
    })
    render(<CartCheckout sessionEmail="ola@example.com" />)
    await screen.findByText('Drugi e-book')
    fillValid()
    fireEvent.click(payButton())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Masz już ten e-book na swoim koncie.')
    expect(screen.getByRole('link', { name: 'Moich zakupach' }).getAttribute('href')).toBe('/konto/zakupy')
    await waitFor(() => expect(document.activeElement).toBe(alert))
    fireEvent.click(screen.getByRole('button', { name: 'Usuń posiadane z koszyka' }))
    expect(getCart()).toEqual([ITEM2.slug])
    expect(payButton().textContent).toBe('Zamawiam i płacę 19,50 zł')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('429 → toast with wait time, form unlocked', async () => {
    addToCart(SLUG)
    mockFetch({ order: () => json({ data: null, error: { code: 'rate_limit_exceeded', message: 'x' } }, 429, { 'Retry-After': '600' }) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Zbyt wiele prób złożenia zamówienia. Spróbuj ponownie za 10 minut.'))
    expect(payButton().hasAttribute('disabled')).toBe(false)
  })

  it('network error → toast, retry possible', async () => {
    addToCart(SLUG)
    let calls = 0
    const f = mockFetch({
      order: () => {
        calls++
        if (calls === 1) throw new TypeError('Failed to fetch')
        return json({ data: { orderId: 'o1', redirectUrl: 'https://tpay/x' }, error: null }, 201)
      },
    })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Brak połączenia')))
    fireEvent.click(payButton())
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('https://tpay/x'))
    expect(ordersCalls(f)).toHaveLength(2)
  })

  it('server 400 with issues → field error + focus', async () => {
    addToCart(SLUG)
    mockFetch({
      order: () =>
        json({ data: null, error: { code: 'validation_error', message: 'Podaj poprawny adres e-mail', details: { issues: [{ path: 'email', message: 'Podaj poprawny adres e-mail' }] } } }, 400),
    })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Adres e-mail')))
    expect(screen.getByText('Podaj poprawny adres e-mail')).toBeTruthy()
  })

  it('quote failure → error with „Spróbuj ponownie”', async () => {
    addToCart(SLUG)
    mockFetch({ quotes: [() => json({ data: null, error: { code: 'internal_server_error', message: 'x' } }, 500), () => quote()] })
    render(<CartCheckout sessionEmail={null} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Nie udało się wczytać koszyka')
    fireEvent.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }))
    expect(await screen.findByText('Proteinowa Piekarnia')).toBeTruthy()
  })
  it('409 cart_changed with reason price_changed → price toast + re-quote with the new price', async () => {
    addToCart(SLUG)
    const f = mockFetch({
      quotes: [() => quote([ITEM]), () => quote([{ ...ITEM, price: '35.00' }])],
      order: () =>
        json({ data: null, error: { code: 'cart_changed', message: 'x', details: { removedSlugs: [], reason: 'price_changed' } } }, 409),
    })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(payButton().textContent).toBe('Zamawiam i płacę 35,00 zł'))
    expect(orderBody(f).expectedTotal).toBe('29.00')
    expect(toast.error).toHaveBeenCalledWith('Cena zmieniła się – sprawdź kwotę i kliknij ponownie')
    expect(getCart()).toEqual([SLUG])
  })

  it('pageshow from bfcache (back from Tpay) → re-quote', async () => {
    addToCart(SLUG)
    const f = mockFetch({ quotes: [() => quote([ITEM]), () => quote([{ ...ITEM, price: '31.00' }])] })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    const ev = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(ev, 'persisted', { value: true })
    window.dispatchEvent(ev)
    await waitFor(() => expect(payButton().textContent).toBe('Zamawiam i płacę 31,00 zł'))
    expect(f.mock.calls.filter(([u]) => u === '/api/sklep/cart/quote')).toHaveLength(2)
  })

  it('„Usuń” during an in-flight quote: a late response does not bring the item back', async () => {
    addToCart(SLUG)
    addToCart(ITEM2.slug)
    let resolveLate!: (r: Response) => void
    mockFetch({
      quotes: [() => quote([ITEM, ITEM2]), () => new Promise<Response>((r) => (resolveLate = r)) as unknown as Response],
    })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Drugi e-book')
    // wycena w tle (np. powrót z bfcache) – jeszcze bez odpowiedzi
    const ev = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(ev, 'persisted', { value: true })
    window.dispatchEvent(ev)
    await waitFor(() => expect(resolveLate).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button', { name: /Usuń.*Drugi e-book/ }))
    resolveLate(quote([ITEM, ITEM2]))
    await waitFor(() => expect(screen.queryByText('Aktualizujemy ceny…')).toBeNull())
    expect(screen.queryByText('Drugi e-book')).toBeNull()
    expect(payButton().textContent).toBe('Zamawiam i płacę 29,00 zł')
    expect(getCart()).toEqual([SLUG])
  })

  it('quote error after the first load keeps the form (and typed data); retry shows loading only in the summary', async () => {
    addToCart(SLUG)
    mockFetch({
      quotes: [() => quote([ITEM]), () => json({ data: null, error: { code: 'x', message: 'x' } }, 500), () => quote([ITEM])],
    })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fireEvent.change(screen.getByLabelText('Adres e-mail'), { target: { value: 'anna@example.com' } })
    const ev = new Event('pageshow') as PageTransitionEvent
    Object.defineProperty(ev, 'persisted', { value: true })
    window.dispatchEvent(ev)
    expect((await screen.findByRole('alert')).textContent).toContain('Nie udało się wczytać koszyka')
    expect((screen.getByLabelText('Adres e-mail') as HTMLInputElement).value).toBe('anna@example.com')
    expect(payButton().hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Odśwież' }))
    expect(screen.getByLabelText('Adres e-mail')).toBeTruthy() // formularz nie znika
    await waitFor(() => expect(payButton().hasAttribute('disabled')).toBe(false))
    expect((screen.getByLabelText('Adres e-mail') as HTMLInputElement).value).toBe('anna@example.com')
  })

  it('focus on the first error uses preventScroll + scrollIntoView({ block: center })', async () => {
    addToCart(SLUG)
    mockFetch({})
    const scrollSpy = vi.fn()
    const original = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scrollSpy
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    try {
      render(<CartCheckout sessionEmail={null} />)
      await screen.findByText('Proteinowa Piekarnia')
      fireEvent.click(payButton())
      await waitFor(() => expect(scrollSpy).toHaveBeenCalledWith({ block: 'center' }))
      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true })
    } finally {
      HTMLElement.prototype.scrollIntoView = original
    }
  })

  it('InitiateCheckout only once per page view (retry after 502)', async () => {
    addToCart(SLUG)
    const fbq = vi.fn()
    ;(window as Win).fbq = fbq
    const f = mockFetch({ order: () => json({ data: null, error: { code: 'payment_init_failed', message: 'Nie udało się rozpocząć płatności.' } }, 502) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(ordersCalls(f)).toHaveLength(1))
    await waitFor(() => expect(payButton().hasAttribute('disabled')).toBe(false))
    fireEvent.click(payButton())
    await waitFor(() => expect(ordersCalls(f)).toHaveLength(2))
    expect(fbq.mock.calls.filter((c) => c[1] === 'InitiateCheckout')).toHaveLength(1)
  })

  it('502 → toast, typed data and consents kept', async () => {
    addToCart(SLUG)
    mockFetch({ order: () => json({ data: null, error: { code: 'payment_init_failed', message: 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.' } }, 502) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    fillValid({ email: 'anna@example.com' })
    fireEvent.change(screen.getByLabelText(/Imię/), { target: { value: 'Anna' } })
    fireEvent.click(payButton())
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Koszyk i wpisane dane zostały zachowane')))
    expect((screen.getByLabelText('Adres e-mail') as HTMLInputElement).value).toBe('anna@example.com')
    expect((screen.getByLabelText(/Imię/) as HTMLInputElement).value).toBe('Anna')
    expect((screen.getByLabelText(TERMS_CONSENT_LABEL) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(DIGITAL_CONTENT_CONSENT_TEXT) as HTMLInputElement).checked).toBe(true)
    expect(payButton().hasAttribute('disabled')).toBe(false)
  })

  it('invoice data is not sent after unchecking „Chcę fakturę”; aria-expanded/aria-controls follow the panel', async () => {
    addToCart(SLUG)
    const f = mockFetch({ order: () => json({ data: { orderId: 'o1', redirectUrl: 'https://tpay/x' }, error: null }, 201) })
    render(<CartCheckout sessionEmail={null} />)
    await screen.findByText('Proteinowa Piekarnia')
    const invoice = screen.getByLabelText('Chcę fakturę')
    expect(invoice.getAttribute('aria-expanded')).toBe('false')
    expect(invoice.hasAttribute('aria-controls')).toBe(false)
    fireEvent.click(invoice)
    expect(invoice.getAttribute('aria-expanded')).toBe('true')
    expect(document.getElementById(invoice.getAttribute('aria-controls')!)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Nazwa firmy'), { target: { value: 'Firma' } })
    fireEvent.change(screen.getByLabelText('NIP'), { target: { value: '123' } })
    fireEvent.click(invoice)
    fillValid()
    fireEvent.click(payButton())
    await waitFor(() => expect(ordersCalls(f)).toHaveLength(1))
    expect(orderBody(f)).not.toHaveProperty('invoice')
  })
})
