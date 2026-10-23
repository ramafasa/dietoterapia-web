import { useEffect, useRef, useState } from 'react'
import { clearCart } from '@/lib/shop/cart'
import { pixelValue, trackPurchaseOnce, whenPixelReady } from '@/lib/shop/pixel'
import type { OrderStatusDto } from '@/pages/api/sklep/orders/[id]/status'

/**
 * Status płatności na /sklep/platnosc/sukces?order=<id> (Task 7.3).
 *
 * Odpytuje GET /api/sklep/orders/{id}/status (httpOnly cookie sklep_checkout) co 3 s, maks. 60 s.
 * 429 / błąd sieci / 5xx: dłuższa przerwa (Retry-After albo 3 → 6 → 12 → 15 s), dalej w oknie 60 s.
 * Stany końcowe (koniec odpytywania, fokus na nagłówku): opłacone i potwierdzone, failed, expired,
 * 404 (brak / zły cookie → „przetwarzana”, cookie_mismatch → „wysłaliśmy na e-mail”), koniec 60 s.
 *
 * `orderId = null` (brak / zły ?order=): od razu komunikat „przetwarzana”, bez odpytywania –
 * strona renderuje wtedy komponent bez dyrektywy client:* (statyczny HTML).
 */

export const POLL_INTERVAL_MS = 3_000
export const MAX_WAIT_MS = 60_000
export const MAX_BACKOFF_MS = 15_000
const REQUEST_TIMEOUT_MS = 10_000

type Phase = 'pending' | 'preparing' | 'done' | 'failed' | 'expired' | 'processing' | 'mismatch'

const FINAL_PHASES: ReadonlySet<Phase> = new Set(['done', 'failed', 'expired', 'processing', 'mismatch'])

interface Props {
  /** uuid zamówienia z ?order= albo null (brak / niepoprawny parametr) */
  orderId: string | null
  /** FF_SKLEP – koszyk i katalog to ścieżki sprzedaży (404 przy wyłączonym sklepie) */
  shopEnabled: boolean
}

const CART_URL = '/sklep/koszyk'
const RESEND_URL = '/sklep/wyslij-link'
const PURCHASES_URL = '/konto/zakupy'

function downloadUrl(orderId: string, itemId: string): string {
  return `/api/sklep/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/download`
}

function retryAfterMs(res: Response): number {
  const seconds = Number(res.headers.get('Retry-After'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : POLL_INTERVAL_MS
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { code?: unknown } }
    return typeof body?.error?.code === 'string' ? body.error.code : null
  } catch {
    return null
  }
}

export default function PaymentStatus({ orderId, shopEnabled }: Props) {
  const [phase, setPhase] = useState<Phase>(orderId ? 'pending' : 'processing')
  const [order, setOrder] = useState<OrderStatusDto | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const completedRef = useRef(false)

  // Odpytywanie
  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined
    let failures = 0
    const deadline = Date.now() + MAX_WAIT_MS

    const schedule = (delay: number) => {
      if (cancelled) return
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        setPhase('processing') // koniec okna 60 s – mail i tak przyjdzie
        return
      }
      // ostatnie zapytanie dokładnie na końcu okna, potem „przetwarzana”
      timer = setTimeout(poll, Math.min(delay, remaining))
    }

    const backoff = () => {
      failures += 1
      schedule(Math.min(POLL_INTERVAL_MS * 2 ** failures, MAX_BACKOFF_MS))
    }

    async function poll() {
      controller = new AbortController()
      const abortTimer = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS)
      let res: Response
      try {
        res = await fetch(`/api/sklep/orders/${encodeURIComponent(orderId!)}/status`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        })
      } catch {
        clearTimeout(abortTimer)
        if (!cancelled) backoff()
        return
      }
      clearTimeout(abortTimer)
      if (cancelled) return

      if (res.status === 404) {
        const code = await errorCode(res)
        if (!cancelled) setPhase(code === 'cookie_mismatch' ? 'mismatch' : 'processing')
        return
      }
      if (res.status === 429) {
        schedule(Math.max(retryAfterMs(res), POLL_INTERVAL_MS))
        return
      }
      if (!res.ok) {
        backoff()
        return
      }

      let data: OrderStatusDto | null = null
      try {
        data = ((await res.json()) as { data?: OrderStatusDto | null }).data ?? null
      } catch {
        data = null
      }
      if (cancelled) return
      if (!data) {
        backoff()
        return
      }
      failures = 0

      switch (data.status) {
        case 'paid':
          setOrder(data)
          if (data.confirmationSent) {
            setPhase('done')
            return
          }
          setPhase('preparing')
          schedule(POLL_INTERVAL_MS)
          return
        case 'failed':
        case 'expired':
          setPhase(data.status)
          return
        default:
          setPhase('pending')
          schedule(POLL_INTERVAL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      controller?.abort()
    }
  }, [orderId])

  // Zakup potwierdzony: koszyk pusty, Purchase w Meta Pixel (raz – ref + localStorage w trackPurchaseOnce)
  useEffect(() => {
    if (phase !== 'done' || !order || !orderId || completedRef.current) return
    completedRef.current = true
    clearCart()
    const params = {
      value: pixelValue(order.total),
      currency: 'PLN' as const,
      content_ids: order.items.map((item) => item.slug),
      content_type: 'product' as const,
      num_items: order.items.length,
    }
    whenPixelReady(() => trackPurchaseOnce(orderId, params))
  }, [phase, order, orderId])

  // Fokus na nagłówku stanu końcowego (nie przy renderze serwerowym bez orderId)
  useEffect(() => {
    if (orderId && FINAL_PHASES.has(phase)) headingRef.current?.focus()
  }, [phase, orderId])

  return (
    <div aria-live="polite" className="rounded-xl bg-white p-6 shadow-soft md:p-10">
      {phase === 'pending' && (
        <Waiting title="Potwierdzamy płatność" text="Czekamy na potwierdzenie płatności z Tpay…" />
      )}

      {phase === 'preparing' && (
        <Waiting title="Płatność przyjęta" text="Płatność przyjęta, przygotowujemy potwierdzenie…" />
      )}

      {phase === 'done' && order && orderId && (
        <div>
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10" aria-hidden="true">
            <svg className="h-8 w-8 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="mb-2 font-body text-sm font-semibold uppercase tracking-wider text-primary">
            Zamówienie {order.orderNumber}
          </p>
          <Heading headingRef={headingRef}>Dziękuję za zakup!</Heading>

          <ul className="mb-6 divide-y divide-neutral-dark/10">
            {order.items.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="font-body font-semibold text-neutral-dark">{item.title}</span>
                <a
                  href={downloadUrl(orderId, item.id)}
                  rel="noreferrer"
                  className="btn btn-primary inline-block text-center"
                >
                  Pobierz PDF<span className="sr-only">: {item.title}</span>
                </a>
              </li>
            ))}
          </ul>

          <p className="mb-6 font-body text-neutral-dark/80">
            Link do pobrania wysłałam też na <strong className="break-words text-neutral-dark">{order.email}</strong>.
            Jest ważny 30 dni.
          </p>

          <AccountSection order={order} />

          {shopEnabled && (
            <p className="mt-8 font-body text-sm">
              <a href="/sklep" className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark">
                Wróć do sklepu
              </a>
            </p>
          )}
        </div>
      )}

      {phase === 'failed' && (
        <div>
          <Heading headingRef={headingRef}>Płatność nie powiodła się</Heading>
          <p className="mb-6 font-body text-neutral-dark/80">
            Zamówienie nie zostało opłacone. Jeśli pieniądze zostały mimo to pobrane, napiszę do Ciebie mailem.
          </p>
          <CartButton shopEnabled={shopEnabled} />
        </div>
      )}

      {phase === 'expired' && (
        <div>
          <Heading headingRef={headingRef}>Zamówienie wygasło</Heading>
          <p className="mb-6 font-body text-neutral-dark/80">
            Zamówienie wygasło. Jeśli płatność mimo to wpłynęła, napiszę do Ciebie mailem.
          </p>
          <CartButton shopEnabled={shopEnabled} />
        </div>
      )}

      {phase === 'processing' && (
        <div>
          <Heading headingRef={headingRef}>Płatność jest przetwarzana</Heading>
          <p className="font-body text-neutral-dark/80">
            Link do pobrania przyjdzie mailem w ciągu kilku minut. <ResendLink />
          </p>
        </div>
      )}

      {phase === 'mismatch' && (
        <div>
          <Heading headingRef={headingRef}>Link do pobrania wysłaliśmy na Twój e-mail</Heading>
          <p className="font-body text-neutral-dark/80">
            Jeśli płatność jest jeszcze przetwarzana, wiadomość przyjdzie w ciągu kilku minut. <ResendLink />
          </p>
        </div>
      )}
    </div>
  )
}

function Heading({ headingRef, children }: { headingRef: React.RefObject<HTMLHeadingElement | null>; children: React.ReactNode }) {
  return (
    <h1
      ref={headingRef}
      tabIndex={-1}
      className="mb-4 font-heading text-2xl font-bold text-neutral-dark focus:outline-none md:text-3xl"
    >
      {children}
    </h1>
  )
}

function Waiting({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center">
      <h1 className="mb-6 font-heading text-2xl font-bold text-neutral-dark md:text-3xl">{title}</h1>
      <div role="status" className="flex flex-col items-center gap-4">
        <svg className="h-10 w-10 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <p className="font-body text-neutral-dark/80">{text}</p>
      </div>
      <p className="mt-6 font-body text-sm text-neutral-dark/60">Nie zamykaj tej strony – to zwykle trwa kilka sekund.</p>
    </div>
  )
}

function AccountSection({ order }: { order: OrderStatusDto }) {
  return (
    <div className="rounded-xl bg-neutral-light p-5 font-body text-neutral-dark">
      {order.accountState === 'link_sent' && (
        <p>
          Link do założenia konta wysłałam na <strong className="break-words">{order.email}</strong>. Ustaw hasło, a
          zakupy będą zawsze pod ręką w Twoim koncie.
        </p>
      )}
      {order.accountState === 'exists' && (
        <>
          <p className="mb-1 font-semibold">Zaloguj się – zakup pojawi się w Twoim koncie</p>
          <p className="text-sm text-neutral-dark/80">
            Masz już konto na ten adres. Kliknij link z maila i zaloguj się, a zakup zostanie przypisany do konta.
          </p>
        </>
      )}
      {order.accountState === 'none' && (
        <p>
          Ten zakup znajdziesz też w{' '}
          <a href={PURCHASES_URL} className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark">
            Moich zakupach
          </a>
          .
        </p>
      )}
    </div>
  )
}

function CartButton({ shopEnabled }: { shopEnabled: boolean }) {
  if (!shopEnabled) return null
  return (
    <a href={CART_URL} className="btn btn-primary inline-block">
      Wróć do koszyka
    </a>
  )
}

function ResendLink() {
  return (
    <>
      Nie przyszedł?{' '}
      <a href={RESEND_URL} className="font-semibold text-primary underline underline-offset-2 hover:text-primary-dark">
        Wyślij link ponownie
      </a>
    </>
  )
}
