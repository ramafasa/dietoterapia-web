/**
 * Shop Checkout Service (sklep)
 *
 * Responsibilities:
 * - Quote a cart: the localStorage cart holds only slugs, prices come from the database
 * - Create an order (guest or logged in, optional account creation) and initiate a Tpay payment
 */

import { randomBytes } from 'crypto'
import type { Database } from '@/db'
import { ProductRepository } from '@/lib/repositories/productRepository'
import { ShopOrderRepository } from '@/lib/repositories/shopOrderRepository'
import { UserRepository } from '@/lib/repositories/userRepository'
import { getTpayService, type TpayService } from '@/lib/services/tpayService'
import { hashToken } from '@/lib/crypto'
import { hashPasswordV2 } from '@/lib/password'
import { sumPrices } from '@/lib/shop/money'
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
  invoice?: { companyName: string; nip: string; address: string }
  createAccountPasswordHash?: string // SHA-256 z klienta; tylko gdy brak konta na ten e-mail
  sessionUser?: { id: string; email: string } | null
}

export type CreateOrderErrorCode =
  | 'EMPTY_CART'
  | 'CART_CHANGED'
  | 'ACCOUNT_EXISTS'
  | 'ALREADY_OWNED'
  | 'PAYMENT_INIT_FAILED'

export type CreateOrderResult =
  | { ok: true; orderId: string; redirectUrl: string; checkoutSecret: string }
  | { ok: false; code: CreateOrderErrorCode; message: string; removedSlugs?: string[] }

/** The part of TpayService the checkout needs (injectable in tests). */
export type ShopTpayClient = Pick<TpayService, 'createTransaction'>

const PG_UNIQUE_VIOLATION = '23505'

class AccountExistsError extends Error {}

function isUniqueViolation(error: unknown, constraintFragment: string): boolean {
  // drizzle opakowuje błąd postgres-js w `cause`
  const candidates = [error, (error as { cause?: unknown } | null)?.cause]
  return candidates.some((e) => {
    const pg = e as { code?: string; constraint_name?: string } | null
    return pg?.code === PG_UNIQUE_VIOLATION && (pg.constraint_name ?? '').includes(constraintFragment)
  })
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
   * 2. Authoritative quote: empty → EMPTY_CART, any removed slug → CART_CHANGED.
   * 3. Logged in: product already in a paid order of this user → ALREADY_OWNED (guests are not blocked).
   * 4. Account creation (guests only): e-mail already has an account → ACCOUNT_EXISTS, nothing created.
   * 5. One DB transaction: order (consents snapshot, invoice data, checkout secret hash), items,
   *    optional unverified customer account (NOT linked to the order – that happens after e-mail
   *    verification), pending transaction (item SHOP_ORDER).
   * 6. Tpay (outside the DB transaction): failure → order + transaction 'failed', PAYMENT_INIT_FAILED.
   *
   * The returned checkoutSecret is the only copy of the raw secret (DB stores its SHA-256) – never log it.
   */
  async createOrder(input: CreateOrderInput, now: Date = new Date()): Promise<CreateOrderResult> {
    const sessionUser = input.sessionUser ?? null
    const email = (sessionUser?.email ?? input.email).trim().toLowerCase()
    const firstName = input.firstName?.trim() || null
    const createAccountPasswordHash = sessionUser ? undefined : input.createAccountPasswordHash

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

    const orders = new ShopOrderRepository(this.db)

    // 3. Zalogowana klientka nie kupuje drugi raz tego samego
    if (sessionUser) {
      const owned = await orders.findOwnedProductIds(
        sessionUser.id,
        quote.items.map((i) => i.productId)
      )
      if (owned.length > 0) {
        return {
          ok: false,
          code: 'ALREADY_OWNED',
          message: 'Masz już ten e-book na swoim koncie – znajdziesz go w /konto/zakupy.',
        }
      }
    }

    // 4. Zakładanie konta
    const accountExists: CreateOrderResult = {
      ok: false,
      code: 'ACCOUNT_EXISTS',
      message: 'Masz już konto – zaloguj się',
    }
    let accountPasswordHash: string | null = null
    if (createAccountPasswordHash) {
      if (await new UserRepository(this.db).findByEmail(email)) return accountExists
      accountPasswordHash = await hashPasswordV2(createAccountPasswordHash)
    }

    // 5. Zamówienie + pozycje + (konto) + transakcja – atomowo
    const checkoutSecret = randomBytes(32).toString('hex')
    const checkoutSecretHash = await hashToken(checkoutSecret)
    const total = quote.total

    let created: { orderId: string; orderNumber: string; transactionId: string }
    try {
      created = await this.db.transaction(async (tx) => {
        const txDb = tx as unknown as Database
        const txOrders = new ShopOrderRepository(txDb)

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

        if (accountPasswordHash && createAccountPasswordHash) {
          try {
            // emailVerifiedAt zostaje NULL – konto aktywuje link z e-maila; zamówienie NIE jest jeszcze przypięte
            await new UserRepository(txDb).createUser({
              email,
              password: createAccountPasswordHash,
              passwordHash: accountPasswordHash,
              role: 'customer',
              status: 'active',
              firstName,
              lastName: null,
              age: null,
              gender: null,
            })
          } catch (error) {
            // Wyścig: konto powstało między sprawdzeniem a insertem
            if (isUniqueViolation(error, 'email')) throw new AccountExistsError()
            throw error
          }
        }

        const description = `Zamówienie ${orderNumber}`
        const transaction = await txOrders.insertTransaction({
          userId: sessionUser?.id ?? null,
          shopOrderId: order.id,
          item: SHOP_TRANSACTION_ITEM,
          amount: total,
          currency: 'PLN',
          status: 'pending',
          tpayTitle: description,
          payerEmail: email,
          payerName: firstName,
          createdAt: now,
          updatedAt: now,
        })

        return { orderId: order.id, orderNumber, transactionId: transaction.id }
      })
    } catch (error) {
      if (error instanceof AccountExistsError) return accountExists
      throw error
    }

    // 6. Tpay – poza transakcją DB
    const siteUrl = process.env.SITE_URL || 'https://paulinamaciak.pl'
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
    } catch (error) {
      console.error('[ShopCheckoutService] Tpay payment init failed:', {
        orderId: created.orderId,
        transactionId: created.transactionId,
        error: error instanceof Error ? error.message : String(error),
      })
      await orders.markPaymentInitFailed(created.orderId, created.transactionId)
      return {
        ok: false,
        code: 'PAYMENT_INIT_FAILED',
        message: 'Nie udało się rozpocząć płatności. Spróbuj ponownie za chwilę.',
      }
    }

    await orders.setTpayTransactionId(created.transactionId, tpayResult.transactionId)

    return {
      ok: true,
      orderId: created.orderId,
      redirectUrl: tpayResult.paymentUrl,
      checkoutSecret,
    }
  }
}
