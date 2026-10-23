/**
 * Maile sklepu – interfejs używany przez webhook płatności (ShopPaymentService).
 *
 * Parametry to czyste dane (wiersze z bazy + surowe tokeny); implementacja (ShopMailService,
 * src/lib/services/shopMailService.ts) buduje z nich URL-e i treść szablonów react-email.
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
  /**
   * Powiadomienie właścicieli o opłaconym zamówieniu ([FAKTURA] w temacie, gdy order.invoiceRequested).
   * Wysyłane PO próbie potwierdzenia: confirmationSent = czy potwierdzenie umowy wyszło (false → plik
   * wstrzymany, cron ponowi). tpayTransactionId = tr_id (null, gdy brak).
   */
  notifyOwner(
    order: ShopOrder,
    items: ShopOrderItem[],
    details: { confirmationSent: boolean; tpayTransactionId: string | null }
  ): Promise<void>
  /** [UWAGA] Kwota z Tpay różna od kwoty zamówienia – płatność do ręcznej obsługi. Kwoty jak z Tpay/bazy. */
  notifyOwnerAmountMismatch(
    order: ShopOrder,
    details: { expected: string; received: string; tpayTransactionId: string | null }
  ): Promise<void>
  /** Płatność po wygaśnięciu zamówienia (regulamin § 5 ust. 6): zwrot w 14 dni albo realizacja na wniosek. */
  notifyCustomerLatePayment(order: ShopOrder): Promise<boolean>
  /**
   * Płatność po wygaśnięciu – Paulina decyduje: zwrot w panelu Tpay albo ręczna realizacja. true = wysłane.
   * Wysyłane PO mailu do klientki: customerNotified = czy klientka dostała informację.
   */
  notifyOwnerLatePayment(
    order: ShopOrder,
    details: { receivedAmount: string; customerNotified: boolean; tpayTransactionId: string | null }
  ): Promise<boolean>
  /**
   * Sukces z Tpay dla transakcji wcześniej oznaczonej 'failed' (np. najpierw tr_status=FALSE, potem TRUE),
   * kwota zgodna. Zamówienie zostaje 'failed' – Paulina decyduje: zwrot albo ręczna realizacja.
   */
  notifyOwnerUnexpectedPayment(
    order: ShopOrder,
    details: { receivedAmount: string; tpayTransactionId: string | null }
  ): Promise<void>
  /**
   * Poprawnie podpisane powiadomienie o sukcesie dla transakcji, której nie znamy (albo nie jest
   * transakcją sklepu). Dane wprost z powiadomienia (przycięte) – do wyszukania w panelu Tpay.
   */
  notifyOwnerUnknownPayment(details: { trCrc: string; tpayTransactionId: string; amount: string }): Promise<void>
  /**
   * Sam link „konto” (przycisk „Załóż konto” na stronie pobierania, Task 4.3). Link `attach`
   * albo `create`; nigdy `none`. true = wysłane.
   */
  sendAccountLink(email: string, accountLink: Exclude<AccountLink, { kind: 'none' }>): Promise<boolean>
  /**
   * „Wyślij link ponownie” (Task 4.5): nowe linki do pobrania dla opłaconych zamówień + sekcja konta.
   * `downloads` – po jednym tokenie na zamówienie. true = wysłane.
   */
  sendDownloadLinks(
    email: string,
    downloads: { order: ShopOrder; items: ShopOrderItem[]; downloadToken: string }[],
    accountLink: AccountLink
  ): Promise<boolean>
}
