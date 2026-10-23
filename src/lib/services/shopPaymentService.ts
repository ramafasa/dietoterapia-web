/**
 * Shop Payment Service (sklep) – obsługa powiadomień Tpay (webhook /api/sklep/platnosc/callback)
 *
 * Kolejność (Task 3.4):
 * 1. JWS – bez poprawnej sygnatury nic nie robimy (wyjątek → endpoint odpowiada FALSE 500).
 * 2. Transakcja musi istnieć, mieć shopOrderId i item SHOP_ORDER. Inaczej (podpis poprawny!):
 *    outcome 'unknown_transaction', log, przy sukcesie alert do Pauliny; endpoint odpowiada TRUE
 *    (ponawianie przez Tpay nic nie zmieni).
 * 3. Płatność spóźniona: zamówienie 'expired' (cron Task 9.2) ALBO 'pending' starsze niż
 *    PENDING_ORDER_TTL_HOURS (granica 24 h niezależna od crona), a Tpay zgłasza SUKCES →
 *    zamówienie 'expired', transakcja 'success' (pieniądze wpłynęły), maile do klientki i Pauliny.
 * 4. Sukces dla transakcji 'failed' (np. najpierw tr_status=FALSE, potem TRUE): bez automatycznego
 *    failed → paid. Zgodna kwota → transakcja 'success', zamówienie zostaje 'failed', alert do Pauliny.
 *    Niezgodna → mail o niezgodnej kwocie (raz na transakcję).
 * 5. Idempotencja: transakcja lub zamówienie nie 'pending' → already_processed (Tpay ponawia).
 * 6. Sukces z kwotą różną od transakcji (albo zniekształconą, np. "29,00") → transakcja + zamówienie
 *    'failed', mail [UWAGA] do Pauliny (ręczna obsługa), potwierdzamy Tpay (bez ponowień).
 * 7. Jedna transakcja DB z warunkowymi UPDATE (… WHERE status = … RETURNING). 0 wierszy → ktoś
 *    obsłużył równolegle (rollback, ponowna ocena stanu). Każdy mail „wyjątkowy” wysyłamy tylko po
 *    wygraniu takiego warunkowego UPDATE – dokładnie raz mimo ponowień Tpay.
 * 8. Po opłaceniu (poza transakcją DB; błędy logujemy, NIE rzucamy – płatność już zapisana):
 *    token pobrania, link konta, potwierdzenie (sukces → confirmationSentAt), mail do Pauliny, event.
 *    Plik jest wydawany dopiero, gdy confirmationSentAt != NULL (art. 21 u.p.k.).
 *
 * UWAGA (raporty): transakcja 'success' NIE znaczy „zamówienie opłacone”. Przy płatności spóźnionej
 * ('expired') i nieoczekiwanej ('failed') transakcja jest 'success', bo pieniądze wpłynęły i trzeba je
 * zwrócić (albo ręcznie zrealizować). Przychód liczymy z shop_orders.status = 'paid' (join z orders).
 *
 * Logi: tylko identyfikatory (bez e-maila, tokenów, treści błędów DB – dbErrorLog).
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
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
import { ShopMailService } from '@/lib/services/shopMailService'
import { runInBackground } from '@/lib/shop/background'
import type { ShopMailer } from '@/lib/shop/mailer'
import { toGrosze } from '@/lib/shop/money'
import { dbErrorLog, truncateForLog } from '@/lib/shop/safeLog'
import { PENDING_ORDER_TTL_HOURS, SHOP_TRANSACTION_ITEM } from '@/lib/shop/constants'

export interface ShopPaymentNotification {
  transactionId: string // tr_crc – nasze id transakcji
  tpayTransactionId: string // tr_id
  isSuccess: boolean // tr_status === 'TRUE' (jak PZK)
  amount: string | undefined // tr_amount, np. "29.00"
  signature: string | null // nagłówek X-JWS-Signature
  rawBody: string
}

export type ShopPaymentOutcome =
  | 'paid'
  | 'failed'
  | 'amount_mismatch'
  | 'late_payment'
  | 'unexpected_payment'
  | 'unknown_transaction'
  | 'already_processed'

export interface ShopPaymentResult {
  outcome: ShopPaymentOutcome
  orderId: string | null // null tylko dla unknown_transaction
}

export class ShopWebhookError extends Error {
  constructor(public readonly code: 'invalid_signature') {
    super('Invalid webhook signature')
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

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

const LOG = '[ShopPaymentService]'
const HOUR_MS = 60 * 60 * 1000
const AMOUNT_MISMATCH_EVENT = 'shop_order_amount_mismatch'

export class ShopPaymentService {
  private mailer: ShopMailer
  private accounts: Pick<ShopAccountService, 'resolveAccountLinkForOrder'>
  private tokens: Pick<ShopTokenService, 'createDownloadToken'>
  private now: () => Date

  constructor(
    private db: Database,
    private deps: ShopPaymentDeps = {}
  ) {
    this.mailer = deps.mailer ?? new ShopMailService(db)
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
        transactionId: truncateForLog(n.transactionId),
        hasSignature: !!n.signature,
      })
      throw new ShopWebhookError('invalid_signature')
    }

    // 2. Transakcja sklepu
    const state = await this.loadState(n.transactionId)
    if (!state) return this.handleUnknownTransaction(n)

    const result = await this.dispatch(n, state.trx, state.order)
    if (result !== null) return result

    // Warunkowy UPDATE nie trafił – ktoś obsłużył równolegle (duplikat, cron wygaszający).
    // Ocena od nowa na świeżym stanie; drugi konflikt traktujemy jako obsłużone.
    const fresh = await this.loadState(n.transactionId)
    if (!fresh) return this.handleUnknownTransaction(n)
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
    const overdue = order.status === 'pending' && this.isOverdue(order)

    // 3. Płatność po wygaśnięciu zamówienia (także gdy cron jeszcze nie zdążył)
    if (
      n.isSuccess &&
      (order.status === 'expired' || overdue) &&
      (trx.status === 'cancelled' || trx.status === 'pending')
    ) {
      return this.handleLatePayment(n, trx, order)
    }

    // 4. Sukces dla transakcji 'failed'
    if (n.isSuccess && trx.status === 'failed') {
      return this.amountMatches(n.amount, trx.amount)
        ? this.handleUnexpectedPayment(n, trx, order)
        : this.handleMismatchOnFailed(n, trx, order)
    }

    // 5. Idempotencja
    if (trx.status !== 'pending' || order.status !== 'pending') {
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

    // 6. Kwota
    if (!this.amountMatches(n.amount, trx.amount)) {
      const received = n.amount ?? ''
      const updated = await this.finalize(trx, order, 'failed', n.tpayTransactionId, (tx) =>
        this.insertMismatchMarker(tx, trx, order, received)
      )
      if (!updated) return null
      console.error(`${LOG} Amount mismatch – order failed, manual handling needed`, {
        transactionId: trx.id,
        orderId,
      })
      await this.safely('notifyOwnerAmountMismatch', orderId, () =>
        this.mailer.notifyOwnerAmountMismatch(updated, {
          expected: trx.amount,
          received,
          tpayTransactionId: n.tpayTransactionId || null,
        })
      )
      return { outcome: 'amount_mismatch', orderId }
    }

    // 7. Opłacone
    const paidOrder = await this.finalize(trx, order, 'paid', n.tpayTransactionId)
    if (!paidOrder) return null
    console.log(`${LOG} Order paid`, { transactionId: trx.id, orderId })

    // 8. Dostarczenie – nigdy nie rzuca
    await this.afterPaid(paidOrder, trx, n.tpayTransactionId || null)
    return { outcome: 'paid', orderId }
  }

  private isOverdue(order: ShopOrder): boolean {
    return order.createdAt.getTime() + PENDING_ORDER_TTL_HOURS * HOUR_MS <= this.now().getTime()
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
      // tr_crc to dowolny tekst – nie-UUID daje błąd Postgresa 22P02 = nieznana transakcja
      if (dbErrorLog(error).code === '22P02') return null
      console.error(`${LOG} Error loading transaction`, { transactionId: truncateForLog(transactionId), ...dbErrorLog(error) })
      throw error
    }
  }

  /**
   * Podpis poprawny, ale transakcja nieznana / nie-UUID / nie ze sklepu (np. PZK). Ponowienia nic nie
   * zmienią, więc potwierdzamy Tpay; przy sukcesie alert do Pauliny (pieniądze mogły wpłynąć).
   * Bez guardu „dokładnie raz” (nie ma wiersza, na którym można by go oprzeć) – duplikat Tpay = drugi alert.
   */
  private async handleUnknownTransaction(n: ShopPaymentNotification): Promise<ShopPaymentResult> {
    const details = {
      trCrc: truncateForLog(n.transactionId),
      tpayTransactionId: truncateForLog(n.tpayTransactionId),
      amount: truncateForLog(n.amount ?? ''),
    }
    console.error(`${LOG} Signed notification for unknown or non-shop transaction`, {
      trCrc: details.trCrc,
      tpayTransactionId: details.tpayTransactionId,
      isSuccess: n.isSuccess,
    })
    if (n.isSuccess) {
      await this.safely('notifyOwnerUnknownPayment', null, () => this.mailer.notifyOwnerUnknownPayment(details))
    }
    return { outcome: 'unknown_transaction', orderId: null }
  }

  /**
   * Transakcja i zamówienie zmieniają się razem albo wcale (warunek status = 'pending').
   * `extra` wykonuje się w tej samej transakcji DB. Zwraca zaktualizowane zamówienie albo null przy konflikcie.
   */
  private async finalize(
    trx: Transaction,
    order: ShopOrder,
    orderStatus: 'paid' | 'failed',
    tpayTransactionId: string,
    extra?: (tx: Tx) => Promise<void>
  ): Promise<ShopOrder | null> {
    const now = this.now()
    try {
      return await this.db.transaction(async (tx) => {
        const [t] = await tx
          .update(transactions)
          .set({
            status: orderStatus === 'paid' ? 'success' : 'failed',
            // Nadpisuje id z inicjacji płatności wartością tr_id (jak PZK).
            // TODO: zwroty przez API Tpay potrzebują id transakcji z OpenAPI (zapisanego przy
            //       inicjacji) – wtedy przechowywać oba zamiast nadpisywać.
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

        if (extra) await extra(tx)
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

  /**
   * Zamówienie po 24 h (expired albo pending po terminie). W jednej transakcji DB:
   * pending → 'expired' (warunkowo) i transakcja pending/cancelled → 'success' (warunkowo – guard
   * „dokładnie raz”). Transakcja 'success' + zamówienie 'expired' = pieniądze do zwrotu
   * (regulamin § 5 ust. 6) albo ręcznej realizacji – patrz uwaga o raportach w nagłówku.
   */
  private async handleLatePayment(
    n: ShopPaymentNotification,
    trx: Transaction,
    order: ShopOrder
  ): Promise<ShopPaymentResult | null> {
    const now = this.now()
    let expiredOrder: ShopOrder
    let eventId: string | undefined
    try {
      expiredOrder = await this.db.transaction(async (tx) => {
        let current = order
        if (order.status === 'pending') {
          const [o] = await tx
            .update(shopOrders)
            .set({ status: 'expired', updatedAt: now })
            .where(and(eq(shopOrders.id, order.id), eq(shopOrders.status, 'pending')))
            .returning()
          if (!o) throw new ConcurrentUpdate()
          current = o
        }
        const [t] = await tx
          .update(transactions)
          .set({
            status: 'success',
            ...(n.tpayTransactionId && { tpayTransactionId: n.tpayTransactionId }),
            completedAt: now,
            updatedAt: now,
          })
          .where(and(eq(transactions.id, trx.id), inArray(transactions.status, ['pending', 'cancelled'])))
          .returning({ id: transactions.id })
        if (!t) throw new ConcurrentUpdate()
        // Event w tej samej transakcji – ślad zostaje nawet, gdy proces padnie przed mailami.
        // customerNotified/ownerNotified uzupełniamy po wysyłce (null = nie wiadomo, czy wyszły).
        eventId = await this.insertEvent(tx, 'shop_order_late_payment', current, trx, {
          receivedAmount: truncateForLog(n.amount ?? '', 32),
          customerNotified: null,
          ownerNotified: null,
        })
        return current
      })
    } catch (error) {
      if (error instanceof ConcurrentUpdate) return null
      console.error(`${LOG} Error recording late payment`, {
        transactionId: trx.id,
        orderId: order.id,
        ...dbErrorLog(error),
      })
      throw error
    }

    console.error(`${LOG} Late payment for expired order – refund or manual fulfilment needed`, {
      transactionId: trx.id,
      orderId: order.id,
    })
    const customerNotified =
      (await this.safely('notifyCustomerLatePayment', order.id, () =>
        this.mailer.notifyCustomerLatePayment(expiredOrder)
      )) === true
    if (!customerNotified) {
      console.warn(`${LOG} Late payment: customer NOT notified – owner must contact her`, { orderId: order.id })
    }
    const ownerNotified =
      (await this.safely('notifyOwnerLatePayment', order.id, () =>
        this.mailer.notifyOwnerLatePayment(expiredOrder, {
          receivedAmount: n.amount ?? '',
          customerNotified,
          tpayTransactionId: n.tpayTransactionId || null,
        })
      )) === true
    if (eventId) await this.mergeEventProperties(eventId, order.id, { customerNotified, ownerNotified })
    return { outcome: 'late_payment', orderId: order.id }
  }

  /** Sukces (zgodna kwota) dla transakcji 'failed': failed → success raz, zamówienie zostaje 'failed'. */
  private async handleUnexpectedPayment(
    n: ShopPaymentNotification,
    trx: Transaction,
    order: ShopOrder
  ): Promise<ShopPaymentResult> {
    const now = this.now()
    let claimed: boolean
    try {
      claimed = await this.db.transaction(async (tx) => {
        const [t] = await tx
          .update(transactions)
          .set({
            status: 'success',
            ...(n.tpayTransactionId && { tpayTransactionId: n.tpayTransactionId }),
            completedAt: now,
            updatedAt: now,
          })
          .where(and(eq(transactions.id, trx.id), eq(transactions.status, 'failed')))
          .returning({ id: transactions.id })
        if (!t) return false
        // Event w tej samej transakcji – ślad zostaje nawet, gdy proces padnie przed mailem.
        await this.insertEvent(tx, 'shop_order_unexpected_payment', order, trx, {
          receivedAmount: truncateForLog(n.amount ?? '', 32),
        })
        return true
      })
    } catch (error) {
      console.error(`${LOG} Error recording unexpected payment`, {
        transactionId: trx.id,
        orderId: order.id,
        ...dbErrorLog(error),
      })
      throw error
    }
    if (!claimed) return { outcome: 'already_processed', orderId: order.id }

    console.error(`${LOG} Payment for a failed order – refund or manual fulfilment needed`, {
      transactionId: trx.id,
      orderId: order.id,
    })
    await this.safely('notifyOwnerUnexpectedPayment', order.id, () =>
      this.mailer.notifyOwnerUnexpectedPayment(order, {
        receivedAmount: n.amount ?? '',
        tpayTransactionId: n.tpayTransactionId || null,
      })
    )
    return { outcome: 'unexpected_payment', orderId: order.id }
  }

  /**
   * Sukces z niezgodną kwotą dla transakcji 'failed'. Najczęściej to duplikat pierwotnego powiadomienia
   * z niezgodną kwotą (mail już poszedł) – nie da się go odróżnić po stanie transakcji, więc znacznikiem
   * „mail wysłany” jest event shop_order_amount_mismatch (wstawiany razem ze zmianą statusu / tutaj pod
   * blokadą wiersza transakcji). Mail najwyżej raz na transakcję.
   */
  private async handleMismatchOnFailed(
    n: ShopPaymentNotification,
    trx: Transaction,
    order: ShopOrder
  ): Promise<ShopPaymentResult> {
    const received = n.amount ?? ''
    let claimed: boolean
    try {
      claimed = await this.db.transaction(async (tx) => {
        await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.id, trx.id)).for('update')
        const [marker] = await tx
          .select({ id: events.id })
          .from(events)
          .where(
            and(eq(events.eventType, AMOUNT_MISMATCH_EVENT), sql`${events.properties}->>'transactionId' = ${trx.id}`)
          )
          .limit(1)
        if (marker) return false
        await this.insertMismatchMarker(tx, trx, order, received)
        return true
      })
    } catch (error) {
      console.error(`${LOG} Error recording amount mismatch`, {
        transactionId: trx.id,
        orderId: order.id,
        ...dbErrorLog(error),
      })
      throw error
    }
    if (!claimed) return { outcome: 'already_processed', orderId: order.id }

    console.error(`${LOG} Amount mismatch for a failed order – manual handling needed`, {
      transactionId: trx.id,
      orderId: order.id,
    })
    await this.safely('notifyOwnerAmountMismatch', order.id, () =>
      this.mailer.notifyOwnerAmountMismatch(order, {
        expected: trx.amount,
        received,
        tpayTransactionId: n.tpayTransactionId || null,
      })
    )
    return { outcome: 'amount_mismatch', orderId: order.id }
  }

  private async insertMismatchMarker(tx: Tx, trx: Transaction, order: ShopOrder, received: string): Promise<void> {
    await tx.insert(events).values({
      userId: order.userId,
      eventType: AMOUNT_MISMATCH_EVENT,
      properties: { orderId: order.id, transactionId: trx.id, expected: trx.amount, received: truncateForLog(received, 32) },
      timestamp: this.now(),
    })
  }

  private async afterPaid(order: ShopOrder, trx: Transaction, tpayTransactionId: string | null): Promise<void> {
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

    let confirmationSent = false
    if (downloadToken && accountLink) {
      confirmationSent =
        (await this.safely('sendOrderConfirmation', order.id, () =>
          this.mailer.sendOrderConfirmation(order, items, downloadToken, accountLink)
        )) === true
      if (confirmationSent) await this.markConfirmationSent(order.id, now)
    }
    if (!confirmationSent) {
      console.warn(`${LOG} Order confirmation not sent – will be retried by cron`, { orderId: order.id })
    }

    // Po próbie potwierdzenia – mail do właścicielki mówi, czy klientka je dostała. W tle (waitUntil),
    // żeby Tpay szybciej dostał TRUE; potwierdzenie wyżej jest awaitowane (od niego zależy confirmationSentAt).
    runInBackground(LOG, () =>
      this.safely('notifyOwner', order.id, () =>
        this.mailer.notifyOwner(order, items, { confirmationSent, tpayTransactionId })
      )
    )
    await this.recordEvent('shop_order_paid', order, trx)
  }

  /** Event w transakcji DB (błąd = rollback całości – świadomie, to ślad pieniędzy do zwrotu). */
  private async insertEvent(
    tx: Tx,
    eventType: string,
    order: ShopOrder,
    trx: Transaction,
    extra: Record<string, unknown> = {}
  ): Promise<string> {
    const [row] = await tx
      .insert(events)
      .values({
        userId: order.userId,
        eventType,
        properties: { orderId: order.id, transactionId: trx.id, total: order.totalAmount, ...extra },
        timestamp: this.now(),
      })
      .returning({ id: events.id })
    return row.id
  }

  private async mergeEventProperties(eventId: string, orderId: string, extra: Record<string, unknown>): Promise<void> {
    try {
      await this.db
        .update(events)
        .set({ properties: sql`coalesce(${events.properties}, '{}'::jsonb) || ${JSON.stringify(extra)}::jsonb` })
        .where(eq(events.id, eventId))
    } catch (error) {
      console.error(`${LOG} Error updating event`, { orderId, ...dbErrorLog(error) })
    }
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

  private async recordEvent(
    eventType: string,
    order: ShopOrder,
    trx: Transaction,
    extra: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      await this.db.insert(events).values({
        userId: order.userId,
        eventType,
        properties: { orderId: order.id, transactionId: trx.id, total: order.totalAmount, ...extra },
        timestamp: this.now(),
      })
    } catch (error) {
      console.error(`${LOG} Error recording event`, { eventType, orderId: order.id, ...dbErrorLog(error) })
    }
  }

  /** Krok po zapisaniu płatności: błąd logujemy (bez treści – może zawierać dane), zwracamy undefined. */
  private async safely<T>(step: string, orderId: string | null, fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    } catch (error) {
      console.error(`${LOG} ${step} failed`, { orderId, ...dbErrorLog(error) })
      return undefined
    }
  }
}
