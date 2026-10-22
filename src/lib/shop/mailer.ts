/**
 * Maile sklepu – interfejs używany przez webhook płatności (ShopPaymentService).
 *
 * Parametry to czyste dane (wiersze z bazy + surowe tokeny), żeby implementacja z Fazy 5
 * (ShopMailService + szablony react-email) mogła z nich zbudować URL-e i treść.
 *
 * Kontrakt:
 * - metody NIE powinny rzucać (implementacja łapie i loguje błędy); webhook i tak je łapie,
 * - `sendOrderConfirmation` zwraca true TYLKO gdy potwierdzenie umowy (trwały nośnik, art. 21 u.p.k.)
 *   naprawdę wyszło – od tego zależy `confirmationSentAt`, a więc wydanie pliku,
 * - surowych tokenów NIGDY nie logujemy.
 */

import type { ShopOrder, ShopOrderItem } from '@/db/schema'

/** Link „konto” w mailu potwierdzenia (Task 4.2, resolveAccountLinkForOrder). */
export type AccountLink =
  | { kind: 'none' } // zamówienie ma userId (zalogowana) → „E-book jest też w Twoim koncie”
  | { kind: 'create'; token: string; emphasized: boolean } // brak konta; emphasized = order.accountRequested
  | { kind: 'attach'; token: string } // istnieje konto z tym e-mailem → „Zaloguj się – zakup pojawi się w koncie”

export interface ShopMailer {
  /** Potwierdzenie zamówienia = potwierdzenie umowy na trwałym nośniku. true = wysłane. */
  sendOrderConfirmation(
    order: ShopOrder,
    items: ShopOrderItem[],
    downloadToken: string,
    accountLink: AccountLink
  ): Promise<boolean>
  /** Powiadomienie właścicieli o opłaconym zamówieniu ([FAKTURA] w temacie, gdy order.invoiceRequested). */
  notifyOwner(order: ShopOrder, items: ShopOrderItem[]): Promise<void>
  /** [UWAGA] Kwota z Tpay różna od kwoty zamówienia – płatność do ręcznej obsługi. Kwoty jak z Tpay/bazy. */
  notifyOwnerAmountMismatch(order: ShopOrder, details: { expected: string; received: string }): Promise<void>
  /** Płatność po wygaśnięciu zamówienia (regulamin § 5 ust. 6): zwrot w 14 dni albo realizacja na wniosek. */
  notifyCustomerLatePayment(order: ShopOrder): Promise<boolean>
  /** Płatność po wygaśnięciu – Paulina decyduje: zwrot w panelu Tpay albo ręczna realizacja. */
  notifyOwnerLatePayment(order: ShopOrder): Promise<void>
}

/**
 * Tymczasowa implementacja do czasu Fazy 5.
 *
 * Bezpieczna prawnie: potwierdzenie „nie wysłane” → confirmationSentAt zostaje NULL → plik NIE jest
 * wydawany; cron (Task 9.2) ponowi wysyłkę, gdy pojawi się prawdziwy mailer.
 */
export const pendingShopMailer: ShopMailer = {
  // TODO(5.2): zastąpić ShopMailService (szablon ShopOrderConfirmation + PDF regulaminu)
  async sendOrderConfirmation() {
    return false
  },
  // TODO(5.2): ShopOwnerNotification
  async notifyOwner(order) {
    console.warn('[pendingShopMailer] Owner notification not sent (mailer not implemented):', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    })
  },
  // TODO(5.2): ShopOwnerNotification z tematem [UWAGA] Niezgodna kwota
  async notifyOwnerAmountMismatch(order) {
    console.warn('[pendingShopMailer] Amount mismatch notification not sent (mailer not implemented):', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    })
  },
  // TODO(5.2): mail do klientki o spóźnionej płatności
  async notifyCustomerLatePayment() {
    return false
  },
  // TODO(5.2): mail do właścicieli o spóźnionej płatności
  async notifyOwnerLatePayment(order) {
    console.warn('[pendingShopMailer] Late payment notification not sent (mailer not implemented):', {
      orderId: order.id,
      orderNumber: order.orderNumber,
    })
  },
}
