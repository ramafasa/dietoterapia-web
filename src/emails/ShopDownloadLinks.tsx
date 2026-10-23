/**
 * „Wyślij link ponownie” (/sklep/wyslij-link): nowe linki do pobrania dla opłaconych zamówień
 * z tym adresem e-mail + sekcja „konto”.
 */

import { Section, Text, Button, Link } from '@react-email/components'
import { DOWNLOAD_TOKEN_TTL_DAYS } from '../lib/shop/constants'
import { AccountSection, ShopEmailLayout } from './shop/components'
import type { ShopEmailAccount } from './shop/types'
import * as s from './shop/styles'

export interface ShopDownloadLinksOrder {
  orderNumber: string
  orderDate: string // sformatowana data zamówienia
  itemTitles: string[]
  downloadUrl: string // absolutny URL /sklep/pobierz/{token}
}

export interface ShopDownloadLinksProps {
  orders: ShopDownloadLinksOrder[]
  account: ShopEmailAccount
  resendUrl: string // absolutny URL /sklep/wyslij-link
}

export default function ShopDownloadLinks({ orders, account, resendUrl }: ShopDownloadLinksProps) {
  return (
    <ShopEmailLayout preview="Nowe linki do pobrania Twoich e-booków">
      <Text style={s.heading}>Twoje linki do pobrania</Text>
      <Text style={s.paragraph}>
        Na prośbę złożoną na stronie sklepu wysyłam nowe linki do pobrania e-booków kupionych z tego adresu e-mail.
      </Text>

      {orders.map((order) => (
        <Section key={order.orderNumber} style={s.highlightBox}>
          <Text style={s.small}>
            <strong>{order.orderNumber}</strong> z dnia {order.orderDate}
          </Text>
          {order.itemTitles.map((title, i) => (
            <Text key={i} style={s.itemRow}>
              {title}
            </Text>
          ))}
          <Button style={s.button} href={order.downloadUrl}>
            {order.itemTitles.length > 1 ? 'Pobierz e-booki' : 'Pobierz e-book'}
          </Button>
        </Section>
      ))}

      <Text style={s.note}>
        {orders.length > 1 ? 'Linki są ważne' : 'Link jest ważny'} {DOWNLOAD_TOKEN_TTL_DAYS} dni. Nowy link wygenerujesz
        na{' '}
        <Link href={resendUrl} style={s.link}>
          {resendUrl}
        </Link>
      </Text>

      <AccountSection account={account} position="top" plural />

      <Text style={s.note}>Jeśli to nie Ty prosiłaś/eś o linki, zignoruj tę wiadomość.</Text>

      <AccountSection account={account} position="bottom" plural />
    </ShopEmailLayout>
  )
}

// Podgląd w `npm run email:dev`
ShopDownloadLinks.PreviewProps = {
  orders: [
    {
      orderNumber: 'ZAM-2026-00001',
      orderDate: '1 listopada 2026',
      itemTitles: ['Proteinowa Piekarnia'],
      downloadUrl: 'https://paulinamaciak.pl/sklep/pobierz/przyklad-1',
    },
    {
      orderNumber: 'ZAM-2026-00042',
      orderDate: '15 listopada 2026',
      itemTitles: ['E-book 2', 'E-book 3'],
      downloadUrl: 'https://paulinamaciak.pl/sklep/pobierz/przyklad-2',
    },
  ],
  account: { kind: 'attach', url: 'https://paulinamaciak.pl/sklep/konto/przyklad' },
  resendUrl: 'https://paulinamaciak.pl/sklep/wyslij-link',
} satisfies ShopDownloadLinksProps
