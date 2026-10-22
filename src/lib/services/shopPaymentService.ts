/**
 * Shop Payment Service (sklep) – obsługa powiadomień Tpay (webhook /api/sklep/platnosc/callback)
 *
 * Kolejność (Task 3.4):
 * 1. JWS – bez poprawnej sygnatury nic nie robimy (wyjątek → endpoint odpowiada FALSE).
 * 2. Transakcja musi istnieć, mieć shopOrderId i item SHOP_ORDER (inaczej wyjątek).
 * 3. Płatność spóźniona: zamówienie 'expired' (cron Task 9.2: order → 'expired', transakcja → 'cancelled')
 *    a Tpay zgłasza SUKCES → zamówienie ZOSTAJE 'expired', transakcja → 'success' (pieniądze wpłynęły),
 *    mail do klientki (zwrot w 14 dni albo realizacja na wniosek, regulamin § 5 ust. 6) + do Pauliny.
 *    Przejście transakcji cancelled → success to warunkowy UPDATE, więc maile idą dokładnie raz
 *    (ponowienia Tpay widzą już 'success' → already_processed).
 *    UWAGA: guard „tpayTransactionId jeszcze nie ustawione” nie działa – checkout zapisuje id z Tpay
 *    zaraz po utworzeniu płatności.
 * 4. Idempotencja: transakcja lub zamówienie nie 'pending' → already_processed (Tpay ponawia powiadomienia).
 * 5. Sukces z kwotą różną od transakcji (albo zniekształconą, np. "29,00") → transakcja + zamówienie
 *    'failed', mail [UWAGA] do Pauliny (ręczna obsługa), potwierdzamy Tpay (bez ponowień).
 * 6. Jedna transakcja DB z warunkowymi UPDATE (… WHERE status = 'pending' RETURNING): transakcja
 *    → success/failed (+ tpayTransactionId, completedAt), zamówienie → paid (paidAt) / failed.
 *    0 wierszy → ktoś obsłużył równolegle (rollback, ponowna ocena stanu).
 * 7. Po opłaceniu (poza transakcją DB; błędy logujemy, NIE rzucamy – płatność już zapisana):
 *    token pobrania, link konta, potwierdzenie (sukces → confirmationSentAt), mail do Pauliny, event.
 *    Plik jest wydawany dopiero, gdy confirmationSentAt != NULL (art. 21 u.p.k.).
 *
 * Logi: tylko identyfikatory (bez e-maila, kwot z bazy w treści błędów DB, tokenów) – dbErrorLog.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Database } from '@/db'
import {
  events,
  shopOrderItems,
  shopOrders,
  transactions,
  type ShopOrder,
  type ShopOrderItem,
  type Transaction,
} from '@/db/schema'
import { getTpayService, type TpayService } from '@/lib/services/tpayService'
import { ShopTokenService } from '@/lib/services/shopTokenService'
import { ShopAccountService } from '@/lib/services/shopAccountService'
import { pendingShopMailer, type ShopMailer } from '@/lib/shop/mailer'
import { toGrosze } from '@/lib/shop/money'
import { dbErrorLog } from '@/lib/shop/safeLog'
import { SHOP_TRANSACTION_ITEM } from '@/lib/shop/constants'

export interface ShopPaymentNotification {
  transactionId: string // tr_crc – nasze id transakcji
  tpayTransactionId: string // tr_id
  isSuccess: boolean // tr_status === 'TRUE' (jak PZK)
  amount: string | undefined // tr_amount, np. "29.00"
  signature: string | null // nagłówek X-JWS-Signature
  rawBody: string
}

export type ShopPaymentOutcome = 'paid' | 'failed' | 'amount_mismatch' | 'late_payment' | 'already_processed'

export interface ShopPaymentResult {
  outcome: ShopPaymentOutcome
  orderId: string
}

export class ShopWebhookError extends Error {
  constructor(public readonly code: 'invalid_signature' | 'unknown_transaction') {
    super(code === 'invalid_signature' ? 'Invalid webhook signature' : 'Shop transaction not found')
    this.name = 'ShopWebhookError'
  }
}

export interface ShopPaymentDeps {
  tpay?: Pick<TpayService, 'verifyWebhookSignature'>
  mailer?: ShopMailer
  accounts?: Pick<ShopAccountService, 'resolveAccountLinkForOrder'>
  tokens?: Pick<ShopTokenService, 'createDownloadToken'>
  now?: () => Date
}

/** Rollback transakcji DB, gdy warunkowy UPDATE nie trafił (powiadomienie obsłużone równolegle). */
class ConcurrentUpdate extends Error {}

const LOG = '[ShopPaymentService]'

export class ShopPaymentService {
  private mailer: ShopMailer
  private accounts: Pick<ShopAccountService, 'resolveAccountLinkForOrder'>
  private tokens: Pick<ShopTokenService, 'createDownloadToken'>
  private now: () => Date

  constructor(
    private db: Database,
    private deps: ShopPaymentDeps = {}
  ) {
    // TODO(5.2): domyślnie ShopMailService zamiast pendingShopMailer
    this.mailer = deps.mailer ?? pendingShopMailer
    this.accounts = deps.accounts ?? new ShopAccountService(db)
    this.tokens = deps.tokens ?? new ShopTokenService(db)
    this.now = deps.now ?? (() => new Date())
  }

  /** Leniwie – getTpayService() wymaga zmiennych Tpay. */
  private get tpay(): Pick<TpayService, 'verifyWebhookSignature'> {
    return this.deps.tpay ?? getTpayService()
  }

  async processNotification(n: ShopPaymentNotification): Promise<ShopPaymentResult> {
    // 1. JWS
    if (!(await this.tpay.verifyWebhookSignature(n.signature, n.rawBody))) {
      console.error(`${LOG} Invalid webhook signature`, {
        transactionId: n.transactionId,
        hasSignature: !!n.signature,
      })
      throw new ShopWebhookError('invalid_signature')
    }

    // 2. Transakcja sklepu
    const state = await this.loadState(n.transactionId)
    if (!state) {
      console.error(`${LOG} Shop transaction not found or not a shop transaction`, {
        transactionId: n.transactionId,
      })
      throw new ShopWebhookError('unknown_transaction')
    }

    const result = await this.dispatch(n, state.trx, state.order)
    if (result !== null) return result

    // Warunkowy UPDATE nie trafił – ktoś obsłużył równolegle (duplikat, cron wygaszający).
    // Ocena od nowa na świeżym stanie; drugi konflikt traktujemy jako obsłużone.
    const fresh = await this.loadState(n.transactionId)
    if (!fresh) throw new ShopWebhookError('unknown_transaction')
    return (
      (await this.dispatch(n, fresh.trx, fresh.order)) ?? { outcome: 'already_processed', orderId: fresh.order.id }
    )
  }

  /** null = konflikt z równoległą zmianą (nic nie zapisano). */
  private async dispatch(
    n: ShopPaymentNotification,
    trx: Transaction,
    order: ShopOrder
  ): Promise<ShopPaymentResult | null> {
    const orderId = order.id

    // 3. Płatność po wygaśnięciu zamówienia (także gdy cron zdążył oznaczyć tylko zamówienie)
    if (n.isSuccess && order.status === 'expired' && (trx.status === 'cancelled' || trx.status === 'pending')) {
      return this.handleLatePayment(n, trx, order)
    }

    // 4. Idempotencja
    if (trx.status !== 'pending' || order.status !== 'pending') {
      if (n.isSuccess && trx.status === 'failed') {
        // Np. wcześniej tr_status=FALSE albo niezgodna kwota, a teraz sukces – wymaga ręcznej kontroli.
        console.error(`${LOG} Success notification for a failed shop transaction – manual check needed`, {
          transactionId: trx.id,
          orderId,
        })
      }
      console.log(`${LOG} Notification already processed`, {
        transactionId: trx.id,
        orderId,
        transactionStatus: trx.status,
        orderStatus: order.status,
      })
      return { outcome: 'already_processed', orderId }
    }

    if (!n.isSuccess) {
      const updated = await this.finalize(trx, order, 'failed', n.tpayTransactionId)
      if (!updated) return null
      console.log(`${LOG} Payment failed`, { transactionId: trx.id, orderId })
      return { outcome: 'failed', orderId }
    }

    // 5. Kwota
    if (!this.amountMatches(n.amount, trx.amount)) {
      const updated = await this.finalize(trx, order, 'failed', n.tpayTransactionId)
      if (!updated) return null
      console.error(`${LOG} Amount mismatch – order failed, manual handling needed`, {
        transactionId: trx.id,
        orderId,
      })
      await this.safely('notifyOwnerAmountMismatch', orderId, () =>
        this.mailer.notifyOwnerAmountMismatch(updated, { expected: trx.amount, received: n.amount ?? '' })
      )
      return { outcome: 'amount_mismatch', orderId }
    }

    // 6. Opłacone
    const paidOrder = await this.finalize(trx, order, 'paid', n.tpayTransactionId)
    if (!paidOrder) return null
    console.log(`${LOG} Order paid`, { transactionId: trx.id, orderId })

    // 7. Dostarczenie – nigdy nie rzuca
    await this.afterPaid(paidOrder, trx)
    return { outcome: 'paid', orderId }
  }

  private amountMatches(received: string | undefined, expected: string): boolean {
    try {
      return received !== undefined && toGrosze(received) === toGrosze(expected)
    } catch {
      return false // zniekształcona kwota (np. "29,00") = niezgodność, nie 500
    }
  }

  private async loadState(transactionId: string): Promise<{ trx: Transaction; order: ShopOrder } | null> {
    try {
      const [trx] = await this.db.select().from(transactions).where(eq(transactions.id, transactionId)).limit(1)
      if (!trx || !trx.shopOrderId || trx.item !== SHOP_TRANSACTION_ITEM) return null
      const [order] = await this.db.select().from(shopOrders).where(eq(shopOrders.id, trx.shopOrderId)).limit(1)
      return order ? { trx, order } : null
    } catch (error) {
      // tr_crc to dowolny tekst z żądania – nie-UUID daje błąd Postgresa (22P02) = nieznana transakcja
      if (dbErrorLog(error).code === '22P02') return null
      console.error(`${LOG} Error loading transaction`, { transactionId, ...dbErrorLog(error) })
      throw error
    }
  }

  /**
   * Transakcja i zamówienie zmieniają się razem albo wcale (warunek status = 'pending').
   * Zwraca zaktualizowane zamówienie albo null przy konflikcie.
   */
  private async finalize(
    trx: Transaction,
    order: ShopOrder,
    orderStatus: 'paid' | 'failed',
    tpayTransactionId: string
  ): Promise<ShopOrder | null> {
    const now = this.now()
    try {
      return await this.db.transaction(async (tx) => {
        const [t] = await tx
          .update(transactions)
          .set({
            status: orderStatus === 'paid' ? 'success' : 'failed',
            ...(tpayTransactionId && { tpayTransactionId }),
            completedAt: now,
            updatedAt: now,
          })
          .where(and(eq(transactions.id, trx.id), eq(transactions.status, 'pending')))
          .returning({ id: transactions.id })
        if (!t) throw new ConcurrentUpdate()

        const [o] = await tx
          .update(shopOrders)
          .set({ status: orderStatus, ...(orderStatus === 'paid' && { paidAt: now }), updatedAt: now })
          .where(and(eq(shopOrders.id, order.id), eq(shopOrders.status, 'pending')))
          .returning()
        if (!o) throw new ConcurrentUpdate()
        return o
      })
    } catch (error) {
      if (error instanceof ConcurrentUpdate) return null
      console.error(`${LOG} Error updating payment status`, {
        transactionId: trx.id,
        orderId: order.id,
        ...dbErrorLog(error),
      })
      throw error
    }
  }

  private async handleLatePayment(
    n: ShopPaymentNotification,
    trx: Transaction,
    order: ShopOrder
  ): Promise<ShopPaymentResult> {
    const now = this.now()
    let claimed: { id: string } | undefined
    try {
      // Zamówienie zostaje 'expired'. Transakcja → 'success' (pieniądze wpłynęły – do zwrotu albo
      // ręcznej realizacji). Warunek na status = guard „dokładnie raz” przy ponowieniach Tpay.
      ;[claimed] = await this.db
        .update(transactions)
        .set({
          status: 'success',
          ...(n.tpayTransactionId && { tpayTransactionId: n.tpayTransactionId }),
          completedAt: now,
          updatedAt: now,
        })
        .where(and(eq(transactions.id, trx.id), inArray(transactions.status, ['pending', 'cancelled'])))
        .returning({ id: transactions.id })
    } catch (error) {
      console.error(`${LOG} Error recording late payment`, {
        transactionId: trx.id,
        orderId: order.id,
        ...dbErrorLog(error),
      })
      throw error
    }

    if (!claimed) {
      console.log(`${LOG} Late payment already processed`, { transactionId: trx.id, orderId: order.id })
      return { outcome: 'already_processed', orderId: order.id }
    }

    console.error(`${LOG} Late payment for expired order – refund or manual fulfilment needed`, {
      transactionId: trx.id,
      orderId: order.id,
    })
    await this.safely('notifyCustomerLatePayment', order.id, () => this.mailer.notifyCustomerLatePayment(order))
    await this.safely('notifyOwnerLatePayment', order.id, () => this.mailer.notifyOwnerLatePayment(order))
    await this.recordEvent('shop_order_late_payment', order, trx)
    return { outcome: 'late_payment', orderId: order.id }
  }

  private async afterPaid(order: ShopOrder, trx: Transaction): Promise<void> {
    const now = this.now()

    let items: ShopOrderItem[] = []
    let itemsLoaded = false
    try {
      items = await this.db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, order.id))
      itemsLoaded = true
    } catch (error) {
      console.error(`${LOG} Error loading order items`, { orderId: order.id, ...dbErrorLog(error) })
    }

    // Potwierdzenie umowy. Każdy brakujący element → bez wysyłki: confirmationSentAt zostaje NULL,
    // plik nie jest wydawany, cron (Task 9.2) ponawia.
    // TODO(9.2): ponowienie musi utworzyć NOWY token pobrania (surowe tokeny nie są przechowywane)
    //            i nowy link konta (resolveAccountLinkForOrder).
    const downloadToken = itemsLoaded
      ? await this.safely('createDownloadToken', order.id, () => this.tokens.createDownloadToken(order.id, now))
      : undefined
    const accountLink = downloadToken
      ? await this.safely('resolveAccountLinkForOrder', order.id, () => this.accounts.resolveAccountLinkForOrder(order))
      : undefined

    if (downloadToken && accountLink) {
      const sent = await this.safely('sendOrderConfirmation', order.id, () =>
        this.mailer.sendOrderConfirmation(order, items, downloadToken, accountLink)
      )
      if (sent === true) await this.markConfirmationSent(order.id, now)
      else console.warn(`${LOG} Order confirmation not sent – will be retried by cron`, { orderId: order.id })
    }

    await this.safely('notifyOwner', order.id, () => this.mailer.notifyOwner(order, items))
    await this.recordEvent('shop_order_paid', order, trx)
  }

  private async markConfirmationSent(orderId: string, now: Date): Promise<void> {
    try {
      await this.db
        .update(shopOrders)
        .set({ confirmationSentAt: now, updatedAt: now })
        .where(and(eq(shopOrders.id, orderId), isNull(shopOrders.confirmationSentAt)))
    } catch (error) {
      // Mail wyszedł, ale znacznik nie – cron wyśle potwierdzenie ponownie (duplikat lepszy niż brak).
      console.error(`${LOG} Error setting confirmationSentAt`, { orderId, ...dbErrorLog(error) })
    }
  }

  private async recordEvent(eventType: string, order: ShopOrder, trx: Transaction): Promise<void> {
    try {
      await this.db.insert(events).values({
        userId: order.userId,
        eventType,
        properties: { orderId: order.id, transactionId: trx.id, total: order.totalAmount },
        timestamp: this.now(),
      })
    } catch (error) {
      console.error(`${LOG} Error recording event`, { eventType, orderId: order.id, ...dbErrorLog(error) })
    }
  }

  /** Krok po zapisaniu płatności: błąd logujemy (bez treści – może zawierać dane), zwracamy undefined. */
  private async safely<T>(step: string, orderId: string, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      console.error(`${LOG} ${step} failed`, { orderId, ...dbErrorLog(error) })
      return undefined
    }
  }
}
