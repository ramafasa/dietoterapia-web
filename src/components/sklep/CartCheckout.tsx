import { useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { getCart, onCartChange, removeFromCart } from '@/lib/shop/cart'
import { formatPLN, sumPrices } from '@/lib/shop/money'
import { trackPixel, pixelValue } from '@/lib/shop/pixel'
import { DIGITAL_CONTENT_CONSENT_TEXT, TERMS_CONSENT_LABEL } from '@/lib/shop/constants'
import { createOrderSchema } from '@/schemas/shop'

export interface CartCover {
  src: string
  width: number
  height: number
}

interface Props {
  /** E-mail zalogowanej osoby (serwer i tak bierze e-mail z sesji) albo null dla gościa */
  sessionEmail: string | null
  /** slug → zoptymalizowana okładka (z astro:assets na stronie koszyka) */
  covers?: Record<string, CartCover>
}

interface QuoteItem {
  productId: string
  slug: string
  title: string
  price: string
}

type QuoteState = 'loading' | 'ready' | 'error'

type FieldKey =
  | 'email'
  | 'firstName'
  | 'companyName'
  | 'nip'
  | 'address'
  | 'acceptTerms'
  | 'acceptDigitalContent'

type FieldErrors = Partial<Record<FieldKey, string>>

/** Kolejność pól w formularzu – fokus trafia na pierwszy błąd w tej kolejności. */
const FIELD_ORDER: FieldKey[] = [
  'email',
  'firstName',
  'companyName',
  'nip',
  'address',
  'acceptTerms',
  'acceptDigitalContent',
]

const FIELD_IDS: Record<FieldKey, string> = {
  email: 'checkout-email',
  firstName: 'checkout-first-name',
  companyName: 'checkout-company',
  nip: 'checkout-nip',
  address: 'checkout-address',
  acceptTerms: 'checkout-terms',
  acceptDigitalContent: 'checkout-digital',
}

/** Ścieżka błędu z createOrderSchema (`invoice.nip`) → pole formularza. */
const PATH_TO_FIELD: Record<string, FieldKey> = {
  email: 'email',
  firstName: 'firstName',
  'invoice.companyName': 'companyName',
  'invoice.nip': 'nip',
  'invoice.address': 'address',
  acceptTerms: 'acceptTerms',
  acceptDigitalContent: 'acceptDigitalContent',
}

const OWNED_URL = '/konto/zakupy'
const NETWORK_ERROR = 'Brak połączenia. Sprawdź internet i spróbuj ponownie.'
const GENERIC_ERROR = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.'
const REMOVED_MESSAGE = 'Część produktów nie jest już dostępna – usunęliśmy je z koszyka.'
const PRICE_CHANGED_MESSAGE = 'Cena zmieniła się – sprawdź kwotę i kliknij ponownie'

/** Fragmenty TERMS_CONSENT_LABEL zamieniane na linki (tekst etykiety = stała, słowo w słowo). */
const TERMS_LINKS: { phrase: string; href: string }[] = [
  { phrase: 'Regulamin sklepu', href: '/regulamin-sklepu' },
  { phrase: 'Polityką prywatności', href: '/polityka-prywatnosci' },
]

function TermsLabelText() {
  const parts: React.ReactNode[] = []
  let rest = TERMS_CONSENT_LABEL
  for (const { phrase, href } of TERMS_LINKS) {
    const i = rest.indexOf(phrase)
    if (i === -1) continue // stała zmieniona – zostaje zwykły tekst (test pilnuje linków)
    parts.push(rest.slice(0, i))
    parts.push(
      <a
        key={href}
        href={href}
        target="_blank"
        rel="noopener"
        aria-label={`${phrase} (otwiera się w nowej karcie)`}
        className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark"
      >
        {phrase}
      </a>
    )
    rest = rest.slice(i + phrase.length)
  }
  parts.push(rest)
  return <>{parts}</>
}

function sameSlugs(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((s) => set.has(s))
}

function minutesLabel(n: number): string {
  if (n === 1) return '1 minutę'
  const lastTwo = n % 100
  const last = n % 10
  const few = last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
  return `${n} ${few ? 'minuty' : 'minut'}`
}

function rateLimitMessage(res: Response, base: string): string {
  const seconds = Number(res.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0
    ? `${base} Spróbuj ponownie za ${minutesLabel(Math.ceil(seconds / 60))}.`
    : `${base} Spróbuj ponownie później.`
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/**
 * Koszyk + formularz zamówienia (/sklep/koszyk, Task 7.2).
 *
 * Ceny zawsze z POST /api/sklep/cart/quote (koszyk w localStorage ma tylko slugi).
 * Submit → POST /api/sklep/orders → przekierowanie do Tpay. Koszyk NIE jest czyszczony przy submit
 * (czyści go strona sukcesu po `paid`) – porzucona płatność nie gubi koszyka.
 * Do Meta Pixel (InitiateCheckout) idą tylko slugi i kwota – nigdy e-mail ani dane do faktury.
 */
export default function CartCheckout({ sessionEmail, covers = {} }: Props) {
  const [quoteState, setQuoteState] = useState<QuoteState>('loading')
  // Po pierwszej udanej wycenie formularz zostaje na ekranie – kolejne wyceny/błędy tylko w podsumowaniu
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [items, setItems] = useState<QuoteItem[]>([])
  const itemsRef = useRef<QuoteItem[]>([])
  const quoteSeq = useRef(0)

  const [email, setEmail] = useState(sessionEmail ?? '')
  const [firstName, setFirstName] = useState('')
  const [wantInvoice, setWantInvoice] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [nip, setNip] = useState('')
  const [address, setAddress] = useState('')
  const [createAccount, setCreateAccount] = useState(false)
  const [acceptTerms, setAcceptTerms] = useState(false)
  const [acceptDigitalContent, setAcceptDigitalContent] = useState(false)

  const [errors, setErrors] = useState<FieldErrors>({})
  const [focusField, setFocusField] = useState<FieldKey | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const checkoutTrackedRef = useRef(false) // InitiateCheckout raz na wyświetlenie strony
  const [ownedSlugs, setOwnedSlugs] = useState<string[]>([])
  const [liveMessage, setLiveMessage] = useState('')
  const ownedRef = useRef<HTMLDivElement>(null)

  const loggedIn = sessionEmail !== null

  const applyItems = useCallback((next: QuoteItem[]) => {
    itemsRef.current = next
    setItems(next)
  }, [])

  /** Wycena koszyka. `silent` – bez toastu o usuniętych produktach (gdy pokazujemy własny komunikat). */
  const requote = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const seq = ++quoteSeq.current
      const slugs = getCart()
      if (slugs.length === 0) {
        applyItems([])
        setQuoteError(null)
        setQuoteState('ready')
        setLoadedOnce(true)
        return
      }
      setQuoteState('loading')
      try {
        const res = await fetch('/api/sklep/cart/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slugs }),
        })
        if (seq !== quoteSeq.current) return // nowsze zapytanie w toku
        const body = await readJson(res)
        if (!res.ok || !body?.data) {
          setQuoteError(
            res.status === 429
              ? rateLimitMessage(res, 'Zbyt wiele zapytań.')
              : 'Nie udało się wczytać koszyka. Spróbuj ponownie.'
          )
          setQuoteState('error')
          return
        }
        const quote = body.data as { items: QuoteItem[]; removedSlugs: string[]; total: string }
        // Tylko pozycje nadal w koszyku: „Usuń” kliknięte w trakcie wyceny nie może przywrócić produktu
        const inCart = new Set(getCart())
        const nextItems = quote.items.filter((i) => inCart.has(i.slug))
        // najpierw stan, potem localStorage – zdarzenie zmiany koszyka zobaczy już zgodne pozycje
        applyItems(nextItems)
        setOwnedSlugs((owned) => owned.filter((s) => nextItems.some((i) => i.slug === s)))
        setQuoteError(null)
        setQuoteState('ready')
        setLoadedOnce(true)
        if (quote.removedSlugs.length > 0) {
          quote.removedSlugs.forEach((s) => removeFromCart(s))
          if (!silent) toast.error(REMOVED_MESSAGE)
        }
      } catch {
        if (seq !== quoteSeq.current) return
        setQuoteError(NETWORK_ERROR)
        setQuoteState('error')
      }
    },
    [applyItems]
  )

  useEffect(() => {
    void requote()
    // Zmiana koszyka w innej karcie (albo w nagłówku) → nowa wycena; własne zmiany są już w stanie
    const unsubscribe = onCartChange((slugs) => {
      if (!sameSlugs(slugs, itemsRef.current.map((i) => i.slug))) void requote()
    })
    // Powrót z Tpay przyciskiem „Wstecz” (bfcache) – odblokuj formularz i odśwież ceny
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        submittingRef.current = false
        setSubmitting(false)
        setLiveMessage('')
        void requote()
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => {
      unsubscribe()
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [requote])

  useEffect(() => {
    if (!focusField) return
    const el = document.getElementById(FIELD_IDS[focusField])
    if (el) {
      // jak SignupForm: bez skoku przeglądarki, pole na środku ekranu (nie pod przyklejonym nagłówkiem)
      el.focus({ preventScroll: true })
      el.scrollIntoView?.({ block: 'center' })
    }
    setFocusField(null)
  }, [focusField])

  useEffect(() => {
    if (ownedSlugs.length > 0) ownedRef.current?.focus()
  }, [ownedSlugs])

  const total = sumPrices(items.map((i) => i.price))

  function handleRemove(slug: string) {
    const next = itemsRef.current.filter((i) => i.slug !== slug)
    applyItems(next)
    setOwnedSlugs((owned) => owned.filter((s) => s !== slug))
    if (!removeFromCart(slug)) {
      toast.error('Nie udało się zapisać koszyka. Sprawdź, czy przeglądarka nie blokuje danych witryny.')
    }
  }

  function removeOwned() {
    ownedSlugs.forEach((s) => handleRemove(s))
    setOwnedSlugs([])
  }

  function showErrors(next: FieldErrors) {
    setErrors(next)
    const first = FIELD_ORDER.find((k) => next[k])
    if (first) setFocusField(first)
  }

  function clearError(key: FieldKey) {
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }

  function issuesToErrors(issues: { path: string; message: string }[]): FieldErrors {
    const next: FieldErrors = {}
    for (const issue of issues) {
      const key = PATH_TO_FIELD[issue.path]
      if (key && !next[key]) next[key] = issue.message
    }
    return next
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submittingRef.current || quoteState !== 'ready' || items.length === 0) return

    const payload = {
      slugs: items.map((i) => i.slug),
      email: loggedIn ? sessionEmail : email,
      firstName,
      acceptTerms,
      acceptDigitalContent,
      expectedTotal: total, // kwota z przycisku – serwer odrzuci zamówienie, gdy cena się zmieniła
      ...(wantInvoice ? { invoice: { companyName, nip, address } } : {}),
      ...(loggedIn ? {} : { createAccount }),
    }

    // Te same reguły co na serwerze (createOrderSchema)
    const parsed = createOrderSchema.safeParse(payload)
    if (!parsed.success) {
      const next = issuesToErrors(
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
      )
      if (wantInvoice && !nip.trim()) next.nip = 'Podaj NIP'
      showErrors(next)
      if (!FIELD_ORDER.some((k) => next[k])) toast.error(parsed.error.issues[0]?.message ?? GENERIC_ERROR)
      return
    }
    setErrors({})

    submittingRef.current = true
    setSubmitting(true)
    setOwnedSlugs([])
    setLiveMessage('Przygotowujemy płatność…')

    // Tylko dane produktu – bez e-maila / imienia / danych do faktury. Raz na wyświetlenie strony.
    if (!checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true
      trackPixel('InitiateCheckout', {
        value: pixelValue(total),
        currency: 'PLN',
        content_ids: items.map((i) => i.slug),
        content_type: 'product',
        num_items: items.length,
      })
    }

    const unlock = (message = '') => {
      submittingRef.current = false
      setSubmitting(false)
      setLiveMessage(message)
    }

    let res: Response
    try {
      res = await fetch('/api/sklep/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      })
    } catch {
      unlock()
      toast.error(NETWORK_ERROR)
      return
    }

    const body = await readJson(res)
    const error = body?.error as { code?: string; message?: string; details?: any } | null

    if (res.ok && body?.data?.redirectUrl) {
      // Przycisk zostaje zablokowany do końca nawigacji
      setLiveMessage('Przekierowujemy do płatności Tpay…')
      window.location.assign(body.data.redirectUrl)
      return
    }

    if (res.status === 400) {
      unlock()
      const next = issuesToErrors(Array.isArray(error?.details?.issues) ? error.details.issues : [])
      if (FIELD_ORDER.some((k) => next[k])) showErrors(next)
      else toast.error(error?.message ?? GENERIC_ERROR)
      return
    }

    if (res.status === 409 && (error?.code === 'cart_changed' || error?.code === 'empty_cart')) {
      unlock()
      toast.error(error.details?.reason === 'price_changed' ? PRICE_CHANGED_MESSAGE : (error.message ?? REMOVED_MESSAGE))
      await requote({ silent: true })
      return
    }

    if (res.status === 409 && error?.code === 'already_owned') {
      unlock()
      const owned: string[] = Array.isArray(error.details?.ownedSlugs) ? error.details.ownedSlugs : []
      setOwnedSlugs(owned.length > 0 ? owned : items.map((i) => i.slug))
      return
    }

    if (res.status === 429) {
      unlock()
      toast.error(rateLimitMessage(res, 'Zbyt wiele prób złożenia zamówienia.'))
      return
    }

    if (res.status === 502) {
      unlock()
      toast.error(
        `${error?.message ?? 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.'} Koszyk i wpisane dane zostały zachowane.`
      )
      return
    }

    unlock()
    toast.error(error?.message && res.status !== 500 ? error.message : GENERIC_ERROR)
  }

  // ----- render -----

  if (!loadedOnce && quoteState === 'loading') {
    return (
      <div role="status" aria-live="polite" className="rounded-xl bg-white p-8 text-center shadow-soft">
        <span className="font-body text-neutral-dark/70">Wczytujemy koszyk…</span>
      </div>
    )
  }

  if (!loadedOnce && quoteState === 'error') {
    return (
      <div role="alert" className="rounded-xl bg-white p-8 text-center shadow-soft">
        <p className="mb-4 font-body text-neutral-dark">{quoteError}</p>
        <button type="button" onClick={() => void requote()} className="btn btn-secondary">
          Spróbuj ponownie
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl bg-white p-8 text-center shadow-soft md:p-12">
        <h2 className="mb-3 font-heading text-2xl font-bold text-neutral-dark">Koszyk jest pusty</h2>
        <p className="mb-6 font-body text-neutral-dark/80">Zajrzyj do sklepu i wybierz e-book dla siebie.</p>
        <a href="/sklep" className="btn btn-primary">
          Przejdź do sklepu
        </a>
      </div>
    )
  }

  const errorId = (key: FieldKey) => `${FIELD_IDS[key]}-error`
  const fieldProps = (key: FieldKey) => ({
    id: FIELD_IDS[key],
    'aria-invalid': errors[key] ? ('true' as const) : ('false' as const),
    'aria-describedby': errors[key] ? errorId(key) : undefined,
  })
  const inputClass = (key: FieldKey) =>
    `w-full rounded-lg border px-4 py-3 font-body text-neutral-dark focus:outline-none focus:ring-2 focus:ring-primary ${
      errors[key] ? 'border-red-500' : 'border-neutral-dark/20'
    }`
  const fieldError = (field: FieldKey) =>
    errors[field] ? (
      <p id={errorId(field)} className="mt-2 font-body text-sm text-red-600">
        {errors[field]}
      </p>
    ) : null

  const payLabel = `Zamawiam i płacę ${formatPLN(total)}`

  return (
    <div className="grid items-start gap-6 lg:grid-cols-5 lg:gap-10">
      {/* Pozycje koszyka */}
      <section aria-labelledby="cart-items-heading" className="rounded-xl bg-white p-5 shadow-soft md:p-6 lg:sticky lg:top-28 lg:col-span-2 lg:order-2">
        <h2 id="cart-items-heading" className="mb-4 font-heading text-xl font-bold text-neutral-dark">
          Twoje zamówienie
        </h2>
        <p role="status" aria-live="polite" className={quoteState === 'loading' ? 'mb-4 font-body text-sm text-neutral-dark/70' : 'sr-only'}>
          {quoteState === 'loading' ? 'Aktualizujemy ceny…' : ''}
        </p>
        {quoteState === 'error' && quoteError && (
          <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 font-body text-sm text-red-700">
            {quoteError}{' '}
            <button type="button" onClick={() => void requote()} className="font-semibold underline">
              Odśwież
            </button>
          </p>
        )}
        <ul className="divide-y divide-neutral-dark/10">
          {items.map((item) => {
            const cover = covers[item.slug]
            return (
              <li key={item.slug} className="flex items-center gap-4 py-4 first:pt-0">
                {cover ? (
                  <img
                    src={cover.src}
                    width={cover.width}
                    height={cover.height}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-auto w-16 flex-shrink-0 rounded-md shadow-soft"
                  />
                ) : (
                  <div className="h-20 w-16 flex-shrink-0 rounded-md bg-primary/10" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-heading font-semibold text-neutral-dark">{item.title}</p>
                  <p className="font-body text-sm text-neutral-dark/70">E-book PDF</p>
                  {ownedSlugs.includes(item.slug) && (
                    <p className="mt-1 font-body text-sm font-semibold text-accent">Masz już ten e-book</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="whitespace-nowrap font-body font-semibold text-neutral-dark">
                    {formatPLN(item.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(item.slug)}
                    disabled={submitting}
                    className="rounded font-body text-sm text-neutral-dark/70 underline underline-offset-2 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Usuń<span className="sr-only">: {item.title}</span>
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t border-neutral-dark/10 pt-4">
          <span className="font-body font-semibold text-neutral-dark">Razem</span>
          <span className="font-heading text-2xl font-bold text-neutral-dark">{formatPLN(total)}</span>
        </div>
      </section>

      {/* Formularz */}
      <section aria-labelledby="checkout-heading" className="rounded-xl bg-white p-5 shadow-soft md:p-8 lg:col-span-3 lg:order-1">
        <h2 id="checkout-heading" className="mb-6 font-heading text-xl font-bold text-neutral-dark">
          Dane do zamówienia
        </h2>

        {ownedSlugs.length > 0 && (
          <div
            ref={ownedRef}
            tabIndex={-1}
            role="alert"
            className="mb-6 rounded-lg border border-accent/40 bg-accent/10 p-4 font-body text-neutral-dark focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <p className="mb-2 font-semibold">Masz już ten e-book na swoim koncie.</p>
            <p className="mb-3 text-sm">
              Znajdziesz go w <a href={OWNED_URL} className="font-semibold text-primary underline">Moich zakupach</a>.
              Usuń go z koszyka, żeby kupić pozostałe produkty.
            </p>
            <button type="button" onClick={removeOwned} className="btn btn-secondary text-sm">
              Usuń posiadane z koszyka
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate aria-busy={submitting} className="space-y-5">
          {/* E-mail */}
          <div>
            <label htmlFor={FIELD_IDS.email} className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
              Adres e-mail
            </label>
            {loggedIn ? (
              <>
                <input
                  {...fieldProps('email')}
                  type="email"
                  value={sessionEmail ?? ''}
                  readOnly
                  aria-describedby={[`${FIELD_IDS.email}-hint`, errors.email ? errorId('email') : null]
                    .filter(Boolean)
                    .join(' ')}
                  className="w-full rounded-lg border border-neutral-dark/10 bg-neutral-light px-4 py-3 font-body text-neutral-dark/80"
                />
                {fieldError('email')}
                <p id={`${FIELD_IDS.email}-hint`} className="mt-2 font-body text-sm text-neutral-dark/70">
                  Kupujesz jako <strong className="text-neutral-dark">{sessionEmail}</strong>. E-book trafi też do
                  Twoich zakupów na koncie.
                </p>
              </>
            ) : (
              <>
                <input
                  {...fieldProps('email')}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearError('email')
                  }}
                  placeholder="twoj@email.pl"
                  className={inputClass('email')}
                />
                {fieldError('email')}
                {!errors.email && (
                  <p className="mt-2 font-body text-sm text-neutral-dark/70">Na ten adres wyślemy e-book.</p>
                )}
              </>
            )}
          </div>

          {/* Imię */}
          <div>
            <label htmlFor={FIELD_IDS.firstName} className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
              Imię <span className="font-normal text-neutral-dark/60">(opcjonalnie)</span>
            </label>
            <input
              {...fieldProps('firstName')}
              type="text"
              name="firstName"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                clearError('firstName')
              }}
              className={inputClass('firstName')}
            />
            {fieldError('firstName')}
          </div>

          {/* Faktura */}
          <div className="rounded-lg bg-neutral-light/60 p-4">
            <label className="flex cursor-pointer items-start gap-3 font-body text-neutral-dark">
              <input
                type="checkbox"
                checked={wantInvoice}
                onChange={(e) => {
                  setWantInvoice(e.target.checked)
                  setErrors((er) => ({ ...er, companyName: undefined, nip: undefined, address: undefined }))
                }}
                aria-expanded={wantInvoice}
                aria-controls={wantInvoice ? 'checkout-invoice-fields' : undefined}
                className="mt-1 h-5 w-5 flex-shrink-0 rounded border-neutral-dark/30 text-primary focus:ring-primary"
              />
              <span>Chcę fakturę</span>
            </label>
            {wantInvoice && (
              <div id="checkout-invoice-fields" className="mt-4 space-y-4">
                <div>
                  <label htmlFor={FIELD_IDS.companyName} className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
                    Nazwa firmy
                  </label>
                  <input
                    {...fieldProps('companyName')}
                    type="text"
                    autoComplete="organization"
                    value={companyName}
                    onChange={(e) => {
                      setCompanyName(e.target.value)
                      clearError('companyName')
                    }}
                    className={inputClass('companyName')}
                  />
                  {fieldError('companyName')}
                </div>
                <div>
                  <label htmlFor={FIELD_IDS.nip} className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
                    NIP
                  </label>
                  <input
                    {...fieldProps('nip')}
                    type="text"
                    inputMode="numeric"
                    value={nip}
                    onChange={(e) => {
                      setNip(e.target.value)
                      clearError('nip')
                    }}
                    placeholder="1234567890"
                    className={inputClass('nip')}
                  />
                  {fieldError('nip')}
                </div>
                <div>
                  <label htmlFor={FIELD_IDS.address} className="mb-2 block font-body text-sm font-semibold text-neutral-dark">
                    Adres firmy
                  </label>
                  <textarea
                    {...fieldProps('address')}
                    rows={2}
                    autoComplete="street-address"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value)
                      clearError('address')
                    }}
                    placeholder="ul. Przykładowa 1, 00-001 Warszawa"
                    className={inputClass('address')}
                  />
                  {fieldError('address')}
                </div>
              </div>
            )}
          </div>

          {/* Konto (tylko goście) */}
          {!loggedIn && (
            <div>
              <label className="flex cursor-pointer items-start gap-3 font-body text-neutral-dark">
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={(e) => setCreateAccount(e.target.checked)}
                  aria-describedby="checkout-account-hint"
                  className="mt-1 h-5 w-5 flex-shrink-0 rounded border-neutral-dark/30 text-primary focus:ring-primary"
                />
                <span>Załóż konto, żeby mieć zakupy zawsze pod ręką</span>
              </label>
              <p id="checkout-account-hint" className="ml-8 mt-1 font-body text-sm text-neutral-dark/70">
                Po płatności wyślemy Ci link do ustawienia hasła.
              </p>
            </div>
          )}

          {/* Zgody */}
          <fieldset className="space-y-4 border-t border-neutral-dark/10 pt-5">
            <legend className="sr-only">Wymagane zgody</legend>
            <div>
              <div className="flex items-start gap-3">
                <input
                  {...fieldProps('acceptTerms')}
                  type="checkbox"
                  required
                  checked={acceptTerms}
                  onChange={(e) => {
                    setAcceptTerms(e.target.checked)
                    clearError('acceptTerms')
                  }}
                  className="mt-1 h-5 w-5 flex-shrink-0 rounded border-neutral-dark/30 text-primary focus:ring-primary"
                />
                <label htmlFor={FIELD_IDS.acceptTerms} className="cursor-pointer font-body text-sm text-neutral-dark">
                  <TermsLabelText />
                </label>
              </div>
              <div className="ml-8">
                {fieldError('acceptTerms')}
              </div>
            </div>
            <div>
              <div className="flex items-start gap-3">
                <input
                  {...fieldProps('acceptDigitalContent')}
                  type="checkbox"
                  required
                  checked={acceptDigitalContent}
                  onChange={(e) => {
                    setAcceptDigitalContent(e.target.checked)
                    clearError('acceptDigitalContent')
                  }}
                  className="mt-1 h-5 w-5 flex-shrink-0 rounded border-neutral-dark/30 text-primary focus:ring-primary"
                />
                <label htmlFor={FIELD_IDS.acceptDigitalContent} className="cursor-pointer font-body text-sm text-neutral-dark">
                  {DIGITAL_CONTENT_CONSENT_TEXT}
                </label>
              </div>
              <div className="ml-8">
                {fieldError('acceptDigitalContent')}
              </div>
            </div>
          </fieldset>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting || quoteState !== 'ready'}
              aria-busy={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 py-4 font-body text-lg font-semibold text-white shadow-soft transition-all duration-200 hover:bg-primary-dark hover:shadow-soft-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30 disabled:cursor-wait disabled:opacity-70"
            >
              {submitting && (
                <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {payLabel}
            </button>
            <p className="mt-3 text-center font-body text-sm text-neutral-dark/70">
              Płatność obsługuje Tpay. Po opłaceniu e-book wyślemy na podany e-mail.
            </p>
            <p role="status" aria-live="polite" className="sr-only">
              {liveMessage}
            </p>
          </div>
        </form>
      </section>
    </div>
  )
}
