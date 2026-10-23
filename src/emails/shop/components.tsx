/**
 * Wspólne elementy maili sklepu: układ, stopka, lista pozycji, sekcja „konto”.
 * Brak eksportu domyślnego → `email dev` nie pokazuje tego pliku jako szablonu.
 */

import type { ReactNode } from 'react'
import { Html, Head, Preview, Body, Container, Section, Text, Button, Hr, Link } from '@react-email/components'
import { ACCOUNT_TOKEN_TTL_DAYS } from '../../lib/shop/constants'
import type { ShopEmailAccount, ShopEmailItem } from './types'
import * as s from './styles'

/** Dane Sprzedawcy – regulamin sklepu § 1 ust. 2–3. */
export const SHOP_SELLER = {
  name: 'Paulina Maciak',
  company: 'POIO Dietoterapia Paulina Maciak',
  address: 'Gaj 5, 95-060 Brzeziny',
  nip: '8272247279',
  email: 'dietoterapia@paulinamaciak.pl',
  phone: '+48 518 036 686',
} as const

export const VAT_EXEMPTION_NOTE = 'Sprzedawca zwolniony z VAT (art. 113 ust. 1 ustawy o VAT)'

export function ShopEmailLayout({
  preview,
  children,
  footer = 'customer',
}: {
  preview: string
  children: ReactNode
  footer?: 'customer' | 'owner'
}) {
  return (
    <Html lang="pl">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={s.main}>
        <Container style={s.container}>
          <Section style={s.box}>
            {children}
            <Hr style={s.hr} />
            {footer === 'customer' ? (
              <Text style={s.footer}>
                Pozdrawiam,
                <br />
                <strong>{SHOP_SELLER.name}</strong>
                <br />
                {SHOP_SELLER.company}
                <br />
                <Link href={`mailto:${SHOP_SELLER.email}`} style={s.link}>
                  {SHOP_SELLER.email}
                </Link>
              </Text>
            ) : (
              <Text style={s.footer}>Automatyczne powiadomienie sklepu paulinamaciak.pl</Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export function ItemsList({ items, total }: { items: ShopEmailItem[]; total?: string }) {
  return (
    <>
      {items.map((item, i) => (
        <Text key={i} style={s.itemRow}>
          {item.title} – {item.price}
        </Text>
      ))}
      {total !== undefined && <Text style={s.totalRow}>Razem: {total}</Text>}
    </>
  )
}

/** create + !emphasized trafia na dół maila; pozostałe warianty – zaraz pod linkiem do pobrania. */
export function isAccountSectionAtBottom(account: ShopEmailAccount): boolean {
  return account.kind === 'create' && !account.emphasized
}

const accountValidity = `Link do konta jest ważny ${ACCOUNT_TOKEN_TTL_DAYS} dni.`

/**
 * Sekcja „konto”. Szablon renderuje ją dwa razy: `position="top"` (pod „Pobierz e-book”)
 * i `position="bottom"` (przed stopką) – każdy wariant pojawia się tylko w jednym miejscu.
 */
export function AccountSection({
  account,
  position,
  plural = false,
}: {
  account: ShopEmailAccount
  position: 'top' | 'bottom'
  plural?: boolean
}) {
  if (isAccountSectionAtBottom(account) !== (position === 'bottom')) return null

  switch (account.kind) {
    case 'none':
      return (
        <Text style={s.paragraph}>
          {plural ? 'E-booki są też w Twoim koncie: ' : 'E-book jest też w Twoim koncie: '}
          <Link href={account.purchasesUrl} style={s.link}>
            Moje zakupy
          </Link>
        </Text>
      )
    case 'attach':
      return (
        <Section style={s.highlightBox}>
          <Text style={s.small}>
            <Link href={account.url} style={s.link}>
              {plural
                ? 'Zaloguj się – zakupy pojawią się w Twoim koncie'
                : 'Zaloguj się – zakup pojawi się w Twoim koncie'}
            </Link>
          </Text>
          <Text style={{ ...s.note, margin: '0' }}>{accountValidity}</Text>
        </Section>
      )
    case 'create':
      if (account.emphasized) {
        return (
          <Section>
            <Button style={s.buttonSecondary} href={account.url}>
              Ustaw hasło i załóż konto
            </Button>
            <Text style={s.note}>
              W koncie znajdziesz wszystkie swoje e-booki w jednym miejscu. {accountValidity}
            </Text>
          </Section>
        )
      }
      return (
        <Text style={s.note}>
          Chcesz mieć e-booki zawsze w jednym miejscu?{' '}
          <Link href={account.url} style={s.link}>
            Załóż konto
          </Link>
          . {accountValidity}
        </Text>
      )
  }
}
