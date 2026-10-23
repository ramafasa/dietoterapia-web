/**
 * Potwierdzenie zamówienia sklepu = potwierdzenie zawarcia umowy na trwałym nośniku
 * (art. 21 ust. 1 u.p.k., regulamin § 5 ust. 7). Treść umowy MUSI być w treści maila
 * (link do strony to nie trwały nośnik). Regulamin (PDF) dołącza ShopMailService.
 */

import { Section, Text, Button, Link } from '@react-email/components'
import { DIGITAL_CONTENT_CONSENT_TEXT, DOWNLOAD_TOKEN_TTL_DAYS, SHOP_TERMS_VERSION } from '../lib/shop/constants'
import { AccountSection, ItemsList, SHOP_SELLER, ShopEmailLayout, VAT_EXEMPTION_NOTE } from './shop/components'
import type { ShopEmailAccount, ShopEmailItem } from './shop/types'
import * as s from './shop/styles'

export interface ShopOrderConfirmationProps {
  firstName?: string | null
  orderNumber: string // "ZAM-2026-00001"
  orderDate: string // sformatowana data zamówienia, np. "1 listopada 2026, 12:30"
  items: ShopEmailItem[]
  total: string // "29,00 zł"
  downloadUrl: string // absolutny URL /sklep/pobierz/{token}
  resendUrl: string // absolutny URL /sklep/wyslij-link
  account: ShopEmailAccount
  digitalContentConsentText: string // słowo w słowo z zamówienia
  digitalContentConsentAt: string // sformatowana data złożenia oświadczenia
  termsVersion: string
  invoiceRequested: boolean
}

export default function ShopOrderConfirmation({
  firstName = 'Anna',
  orderNumber = 'ZAM-2026-00001',
  orderDate = '1 listopada 2026, 12:30',
  items = [{ title: 'Proteinowa Piekarnia', price: '29,00 zł' }],
  total = '29,00 zł',
  downloadUrl = 'https://paulinamaciak.pl/sklep/pobierz/przyklad',
  resendUrl = 'https://paulinamaciak.pl/sklep/wyslij-link',
  account = { kind: 'create', url: 'https://paulinamaciak.pl/sklep/konto/przyklad', emphasized: true },
  digitalContentConsentText = DIGITAL_CONTENT_CONSENT_TEXT,
  digitalContentConsentAt = '1 listopada 2026, 12:29',
  termsVersion = SHOP_TERMS_VERSION,
  invoiceRequested = false,
}: ShopOrderConfirmationProps) {
  const name = firstName?.trim()
  const plural = items.length > 1

  return (
    <ShopEmailLayout preview={`Zamówienie ${orderNumber} – ${plural ? 'Twoje e-booki są' : 'Twój e-book jest'} gotowy do pobrania`}>
      <Text style={s.heading}>{name ? `Dziękuję za zakup, ${name}!` : 'Dziękuję za zakup!'}</Text>

      <Text style={s.paragraph}>
        Zamówienie <strong>{orderNumber}</strong> z dnia {orderDate} zostało opłacone.
      </Text>

      <Section style={s.highlightBox}>
        <ItemsList items={items} total={total} />
        <Text style={{ ...s.note, margin: '8px 0 0 0' }}>{VAT_EXEMPTION_NOTE}</Text>
      </Section>

      <Button style={s.button} href={downloadUrl}>
        {plural ? 'Pobierz e-booki' : 'Pobierz e-book'}
      </Button>
      <Text style={s.note}>
        Link jest ważny {DOWNLOAD_TOKEN_TTL_DAYS} dni. Nowy link wygenerujesz na{' '}
        <Link href={resendUrl} style={s.link}>
          {resendUrl}
        </Link>
      </Text>

      <AccountSection account={account} position="top" plural={plural} />

      {invoiceRequested && (
        <Text style={s.paragraph}>Fakturę wyślemy na ten adres w ciągu 7 dni.</Text>
      )}

      <Section style={s.contractBox}>
        <Text style={s.subheading}>Potwierdzenie umowy</Text>
        <Text style={s.small}>
          <strong>Sprzedawca:</strong> {SHOP_SELLER.name}, {SHOP_SELLER.company}, {SHOP_SELLER.address}, NIP{' '}
          {SHOP_SELLER.nip}, e-mail {SHOP_SELLER.email}, tel. {SHOP_SELLER.phone}
        </Text>
        <Text style={s.small}>
          <strong>Umowa:</strong> dostarczenie treści cyfrowej (e-book w formacie PDF), zamówienie {orderNumber} z
          dnia {orderDate}.
        </Text>
        <Text style={s.small}>
          <strong>{plural ? 'E-booki i ceny:' : 'E-book i cena:'}</strong>
        </Text>
        <ItemsList items={items} total={total} />
        <Text style={{ ...s.small, margin: '8px 0 8px 0' }}>{VAT_EXEMPTION_NOTE}. Cena jest ceną końcową.</Text>
        <Text style={s.small}>
          <strong>Reklamacje:</strong> reklamację złożysz e-mailem na adres {SHOP_SELLER.email} – podaj adres e-mail
          użyty przy zamówieniu, numer zamówienia i opis problemu. Odpowiem w ciągu 14 dni od otrzymania reklamacji
          (§ 10 regulaminu).
        </Text>
        <Text style={s.small}>
          <strong>Twoje oświadczenie</strong> (złożone {digitalContentConsentAt}):
        </Text>
        <Text style={s.quote}>„{digitalContentConsentText}”</Text>
        <Text style={s.small}>Regulamin sklepu w wersji {termsVersion} w załączniku (PDF).</Text>
      </Section>

      <AccountSection account={account} position="bottom" plural={plural} />
    </ShopEmailLayout>
  )
}
