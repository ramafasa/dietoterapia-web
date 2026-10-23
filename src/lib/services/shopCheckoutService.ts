/**
 * Shop Checkout Service (sklep)
 *
 * Responsibilities:
 * - Quote a cart: the localStorage cart holds only slugs, prices come from the database
 * - Create an order (guest or logged in) and initiate a Tpay payment
 */

import { randomBytes } from 'crypto'
import type { Database } from '@/db'
import { ProductRepository } from '@/lib/repositories/productRepository'
import { ShopOrderRepository } from '@/lib/repositories/shopOrderRepository'
import { getTpayService, type TpayService } from '@/lib/services/tpayService'
import { hashToken } from '@/lib/crypto'
import { dbErrorLog } from '@/lib/shop/safeLog'
import { sumPrices, toGrosze } from '@/lib/shop/money'
import {
  DIGITAL_CONTENT_CONSENT_TEXT,
  SHOP_TERMS_VERSION,
  SHOP_TRANSACTION_ITEM,
} from '@/lib/shop/constants'

/** Maksymalna liczba różnych pozycji w koszyku branych pod uwagę przy wycenie. */
export const MAX_CART_ITEMS = 20

export interface CartQuoteItem {
  productId: string
  slug: string
  title: string
  price: string // decimal string, np. "29.00"
}

export interface CartQuote {
  items: CartQuoteItem[]
  removedSlugs: string[] // nieistniejące / nieaktywne – UI pokazuje komunikat i czyści koszyk
  total: string // decimal string; pusty koszyk → "0.00"
}

export interface CreateOrderInput {
  slugs: string[]
  email: string // lowercase, trim (walidowane przez endpoint)
  firstName?: string
  acceptTerms: true
  acceptDigitalContent: true
  /** Suma widziana przez klientkę ("29.00"); różna od wyceny z bazy → CART_CHANGED (price_changed) */
  expectedTotal: string
  invoice?: { companyName: string; nip: string; address: string }
  // „Załóż konto” – zapisywane jako życzenie (accountRequested); konto powstaje dopiero
  // po kliknięciu linku z e-maila potwierdzenia. Ignorowane dla zalogowanych.
  createAccount?: boolean
  sessionUser?: { id: string; email: string } | null
}

export type CreateOrderErrorCode = 'EMPTY_CART' | 'CART_CHANGED' | 'ALREADY_OWNED' | 'PAYMENT_INIT_FAILED'

export type CreateOrderResult =
  | { ok: true; orderId: string; redirectUrl: string; checkoutSecret: string }
  | {
      ok: false
      code: CreateOrderErrorCode
      message: string
      removedSlugs?: string[] // CART_CHANGED
      reason?: 'price_changed' // CART_CHANGED: produkty te same, inna suma niż pokazana klientce
      ownedSlugs?: string[] // ALREADY_OWNED
    }

/** The part of TpayService the checkout needs (injectable in tests). */
export type ShopTpayClient = Pick<TpayService, 'createTransaction'>

const PRODUCTION_SITE_URL = 'https://paulinamaciak.pl'

/**
 * Base URL for Tpay return/notification URLs.
 * Production falls back to the live domain (as PZK does). Sandbox without SITE_URL → null:
 * a sandbox payment must never return to (or notify) production.
 * TPAY_ENVIRONMENT unset = sandbox (same default as TpayService).
 */
function resolveSiteUrl(): string | null {
  const siteUrl = process.env.SITE_URL?.trim()
  if (siteUrl) return siteUrl.replace(/\/+$/, '')
  const environment = process.env.TPAY_ENVIRONMENT || 'sandbox'
  return environment === 'production' ? PRODUCTION_SITE_URL : null
}

const PAYMENT_INIT_FAILED: CreateOrderResult = {
  ok: false,
  code: 'PAYMENT_INIT_FAILED',
  message: 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.',
}

export class ShopCheckoutService {
  /**
   * @param db - Drizzle database
   * @param products - optional repository override (tests); defaults to ProductRepository(db)
   * @param tpay - optional Tpay client (tests); defaults lazily to getTpayService(),
   *               so quoteCart works without Tpay env vars
   */
  constructor(
    private db: Database,
    private products: ProductRepository = new ProductRepository(db),
    private tpayOverride?: ShopTpayClient
  ) {}

  private get tpay(): ShopTpayClient {
    return this.tpayOverride ?? getTpayService()
  }

  /**
   * Authoritative cart quote.
   *
   * - duplicates collapsed, first-seen order preserved, at most MAX_CART_ITEMS slugs considered
   * - draft/archived/unknown slugs land in removedSlugs (input order)
   * - total summed in grosze (no float errors)
   */
  async quoteCart(slugs: string[]): Promise<CartQuote> {
    const unique = [...new Set(slugs)].slice(0, MAX_CART_ITEMS)
    const found = await this.products.findActiveBySlugs(unique)
    const bySlug = new Map(found.map((p) => [p.slug, p]))

    const items = unique.flatMap((slug) => {
      const p = bySlug.get(slug)
      return p ? [{ productId: p.id, slug: p.slug, title: p.title, price: p.price }] : []
    })

    return {
      items,
      removedSlugs: unique.filter((slug) => !bySlug.has(slug)),
      total: sumPrices(items.map((i) => i.price)),
    }
  }

  /**
   * Create a pending order and initiate the Tpay payment.
   *
   * 1. E-mail: session e-mail wins over the form e-mail.
   * 2. Authoritative quote: any removed slug → CART_CHANGED, nothing left → EMPTY_CART,
   *    expectedTotal ≠ quote total → CART_CHANGED with reason price_changed (nothing written).
   * 3. Logged in: product already in a paid order of this user → ALREADY_OWNED (guests are not blocked).
   * 4. One DB transaction: order (consents snapshot, invoice data, accountRequested, checkout secret
   *    hash), items, pending transaction (item SHOP_ORDER). No user row is created here – the account
   *    is created later via the link in the confirmation e-mail.
   * 5. Tpay (outside the DB transaction): failure → order + transaction 'failed', PAYMENT_INIT_FAILED.
   *    Storing the Tpay id afterwards is best-effort (the webhook finds the transaction by crc).
   *
   * The returned checkoutSecret is the only copy of the raw secret (DB stores its SHA-256) – never log it.
   */
  async createOrder(input: CreateOrderInput, now: Date = new Date()): Promise<CreateOrderResult> {
    const sessionUser = input.sessionUser ?? null
    const email = (sessionUser?.email ?? input.email).trim().toLowerCase()
    const firstName = input.firstName?.trim() || null
    const accountRequested = !sessionUser && input.createAccount === true

    // 2. Wycena z bazy
    const quote = await this.quoteCart(input.slugs)
    if (quote.removedSlugs.length > 0) {
      return {
        ok: false,
        code: 'CART_CHANGED',
        message: 'Część produktów w koszyku jest już niedostępna. Sprawdź koszyk i spróbuj ponownie.',
        removedSlugs: quote.removedSlugs,
      }
    }
    if (quote.items.length === 0) {
      return { ok: false, code: 'EMPTY_CART', message: 'Koszyk jest pusty.' }
    }
    // Cena pokazana = cena pobrana: zmiana ceny między wyceną w koszyku a kliknięciem → nic nie tworzymy
    if (toGrosze(input.expectedTotal) !== toGrosze(quote.total)) {
      return {
        ok: false,
        code: 'CART_CHANGED',
        reason: 'price_changed',
        message: 'Cena zmieniła się – sprawdź kwotę i kliknij ponownie.',
        removedSlugs: [],
      }
    }

    const orders = new ShopOrderRepository(this.db)

    // 3. Zalogowana osoba nie kupuje drugi raz tego samego
    if (sessionUser) {
      const owned = new Set(
        await orders.findOwnedProductIds(
          sessionUser.id,
          quote.items.map((i) => i.productId)
        )
      )
      if (owned.size > 0) {
        return {
          ok: false,
          code: 'ALREADY_OWNED',
          message: 'Masz już ten e-book na swoim koncie.',
          ownedSlugs: quote.items.filter((i) => owned.has(i.productId)).map((i) => i.slug),
        }
      }
    }

    // Konfiguracja przed zapisem – bez SITE_URL w sandboxie nie tworzymy zamówienia
    const siteUrl = resolveSiteUrl()
    if (!siteUrl) {
      console.error(
        '[ShopCheckoutService] SITE_URL is not set while TPAY_ENVIRONMENT is sandbox – refusing to build ' +
          'Tpay return/notification URLs (would point to production). Set SITE_URL.'
      )
      return PAYMENT_INIT_FAILED
    }

    // 4. Zamówienie + pozycje + transakcja – atomowo
    const checkoutSecret = randomBytes(32).toString('hex')
    const checkoutSecretHash = await hashToken(checkoutSecret)
    const total = quote.total

    const created = await this.db.transaction(async (tx) => {
      const txOrders = new ShopOrderRepository(tx as unknown as Database)

      const orderNumber = await txOrders.nextOrderNumber(now)
      const order = await txOrders.insertOrder({
        orderNumber,
        email,
        firstName,
        userId: sessionUser?.id ?? null,
        status: 'pending',
        totalAmount: total,
        invoiceRequested: !!input.invoice,
        invoiceCompanyName: input.invoice?.companyName ?? null,
        invoiceNip: input.invoice?.nip ?? null,
        invoiceAddress: input.invoice?.address ?? null,
        termsVersion: SHOP_TERMS_VERSION,
        termsAcceptedAt: now,
        digitalContentConsentAt: now,
        digitalContentConsentText: DIGITAL_CONTENT_CONSENT_TEXT,
        accountRequested,
        checkoutSecretHash,
        createdAt: now,
        updatedAt: now,
      })

      await txOrders.insertItems(
        quote.items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          titleSnapshot: item.title,
          unitPrice: item.price,
        }))
      )

      const transaction = await txOrders.insertTransaction({
        userId: sessionUser?.id ?? null,
        shopOrderId: order.id,
        item: SHOP_TRANSACTION_ITEM,
        amount: total,
        currency: 'PLN',
        status: 'pending',
        tpayTitle: `Zamówienie ${orderNumber}`,
        payerEmail: email,
        payerName: firstName,
        createdAt: now,
        updatedAt: now,
      })

      return { orderId: order.id, orderNumber, transactionId: transaction.id }
    })

    // 5. Tpay – poza transakcją DB
    let tpayResult: { transactionId: string; paymentUrl: string }
    try {
      tpayResult = await this.tpay.createTransaction({
        amount: Number(total),
        description: `Zamówienie ${created.orderNumber}`,
        payerEmail: email,
        ...(firstName && { payerName: firstName }),
        successUrl: `${siteUrl}/sklep/platnosc/sukces?order=${created.orderId}`,
        errorUrl: `${siteUrl}/sklep/platnosc/blad?order=${created.orderId}`,
        notificationUrl: `${siteUrl}/api/sklep/platnosc/callback`,
        crc: created.transactionId, // webhook znajduje transakcję po tym identyfikatorze
      })
    } catch {
      // Szczegóły błędu loguje TpayService; tu tylko identyfikatory (odpowiedź Tpay może zawierać dane płatnika)
      console.error('[ShopCheckoutService] Tpay payment init failed:', {
        orderId: created.orderId,
        transactionId: created.transactionId,
      })
      await orders.markPaymentInitFailed(created.orderId, created.transactionId)
      return PAYMENT_INIT_FAILED
    }

    // Best-effort: płatność już istnieje w Tpay, więc brak zapisu jej id nie może blokować klientki
    try {
      await orders.setTpayTransactionId(created.transactionId, tpayResult.transactionId)
    } catch (error) {
      console.error('[ShopCheckoutService] Could not store Tpay transaction id:', {
        transactionId: created.transactionId,
        ...dbErrorLog(error),
      })
    }

    return {
      ok: true,
      orderId: created.orderId,
      redirectUrl: tpayResult.paymentUrl,
      checkoutSecret,
    }
  }
}
