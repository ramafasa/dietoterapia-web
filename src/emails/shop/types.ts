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
