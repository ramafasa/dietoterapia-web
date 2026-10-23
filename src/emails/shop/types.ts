/**
 * Typy prezentacyjne maili sklepu (e-booki).
 *
 * Szablony dostają dane gotowe do wyświetlenia: absolutne URL-e, sformatowane daty i kwoty
 * (np. "29,00 zł"). Żadnych typów z bazy, env ani tokenów – to robi ShopMailService (Task 5.2).
 */

/** Pozycja zamówienia do wyświetlenia. */
export interface ShopEmailItem {
  title: string
  price: string // "29,00 zł"
}

/**
 * Sekcja „konto” w mailach do klientki (odpowiednik AccountLink z src/lib/shop/mailer.ts,
 * z gotowymi URL-ami zamiast tokenów).
 */
export type ShopEmailAccount =
  | { kind: 'none'; purchasesUrl: string } // zalogowana → „E-book jest też w Twoim koncie: Moje zakupy”
  | { kind: 'create'; url: string; emphasized: boolean } // emphasized = order.accountRequested
  | { kind: 'attach'; url: string } // konto z tym e-mailem już istnieje

/** Link konta bez wariantu `none` (mail „Załóż konto” – ShopAccountLink). */
export type ShopEmailAccountLink = Exclude<ShopEmailAccount, { kind: 'none' }>

// ===== Powiadomienia dla właścicielki (ShopOwnerNotification) =====

/** Dane do faktury (null = klientka nie chce faktury). Pola mogą być puste, jeśli nie zostały podane. */
export interface ShopOwnerInvoice {
  companyName: string | null
  nip: string | null
  address: string | null
}

/** Wspólne pola wariantów dotyczących znanego zamówienia. */
export interface ShopOwnerOrderDetails {
  orderNumber: string
  customerEmail: string
  firstName: string | null
  items: ShopEmailItem[]
  total: string // kwota zamówienia, "29,00 zł"
  tpayTransactionId: string | null
  invoice: ShopOwnerInvoice | null
  ordersPanelUrl: string // absolutny URL /dietetyk/zamowienia
}

export type ShopOwnerNotificationProps =
  // confirmationSent = potwierdzenie umowy do klientki wyszło (false → plik wstrzymany, cron ponowi)
  | ({ variant: 'new_order'; confirmationSent: boolean } & ShopOwnerOrderDetails)
  | ({ variant: 'amount_mismatch'; expectedAmount: string; receivedAmount: string } & ShopOwnerOrderDetails)
  | ({ variant: 'late_payment'; receivedAmount: string; customerNotified: boolean } & ShopOwnerOrderDetails)
  | ({ variant: 'unexpected_payment'; receivedAmount: string } & ShopOwnerOrderDetails)
  | { variant: 'unknown_payment'; trCrc: string; tpayTransactionId: string; amount: string }

export type ShopOwnerNotificationVariant = ShopOwnerNotificationProps['variant']
