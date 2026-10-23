// Stałe sklepu (e-booki)

export const SHOP_TERMS_VERSION = '2026-11-01' // = data w /regulamin-sklepu; zmiana regulaminu = nowa wersja
export const DOWNLOAD_TOKEN_TTL_DAYS = 30
export const ACCOUNT_TOKEN_TTL_DAYS = 30
export const PRESIGN_TTL_SECONDS = 300
export const CHECKOUT_SECRET_TTL_HOURS = 24
export const PENDING_ORDER_TTL_HOURS = 24
export const ORDER_RETENTION_YEARS = 5
export const SHOP_TRANSACTION_ITEM = 'SHOP_ORDER'
export const CHECKOUT_COOKIE = 'sklep_checkout'
// /sklep/pobierz/{token}?konto=wyslano – po „Załóż konto”: „Link do założenia konta wysłałam na …”
export const ACCOUNT_LINK_SENT_PARAM = 'konto'
export const ACCOUNT_LINK_SENT_VALUE = 'wyslano'

// Dokładnie ten tekst widzi klientka przy checkboxie i zapisujemy go w zamówieniu.
export const DIGITAL_CONTENT_CONSENT_TEXT =
  'Żądam dostarczenia treści cyfrowej (e-booka) przed upływem 14 dni od zawarcia umowy i przyjmuję do wiadomości, ' +
  'że po dostarczeniu e-booka utracę prawo odstąpienia od umowy.' // = § 9 ust. 3 regulaminu, słowo w słowo
export const TERMS_CONSENT_LABEL = 'Akceptuję Regulamin sklepu i zapoznałam/em się z Polityką prywatności.'

// = regulamin § 1, zmiana tu = zmiana regulaminu (test: tests/unit/lib/shop/constants.test.ts)
export const SHOP_SELLER = {
  name: 'Paulina Maciak',
  company: 'POIO Dietoterapia Paulina Maciak',
  address: 'Gaj 5, 95-060 Brzeziny',
  nip: '8272247279',
  email: 'dietoterapia@paulinamaciak.pl',
  phone: '+48 518 036 686',
} as const
