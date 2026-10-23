/**
 * Powiadomienia sklepu dla Pauliny – jeden szablon, wariant przez `variant`.
 * Warianty alarmowe ([UWAGA]) mają blok „Co zrobić”. Temat: shopOwnerNotificationSubject (./shop/subjects).
 */

import type { ReactNode } from 'react'
import { Section, Text, Button } from '@react-email/components'
import { ItemsList, ShopEmailLayout } from './shop/components'
import type { ShopEmailItem } from './shop/types'
import * as s from './shop/styles'

export { shopOwnerNotificationSubject } from './shop/subjects'

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
  | ({ variant: 'new_order' } & ShopOwnerOrderDetails)
  | ({ variant: 'amount_mismatch'; expectedAmount: string; receivedAmount: string } & ShopOwnerOrderDetails)
  | ({ variant: 'late_payment'; receivedAmount: string; customerNotified: boolean } & ShopOwnerOrderDetails)
  | ({ variant: 'unexpected_payment'; receivedAmount: string } & ShopOwnerOrderDetails)
  | { variant: 'unknown_payment'; trCrc: string; tpayTransactionId: string; amount: string }

export type ShopOwnerNotificationVariant = ShopOwnerNotificationProps['variant']

const previewProps: ShopOwnerNotificationProps = {
  variant: 'new_order',
  orderNumber: 'ZAM-2026-00001',
  customerEmail: 'anna@example.com',
  firstName: 'Anna',
  items: [{ title: 'Proteinowa Piekarnia', price: '29,00 zł' }],
  total: '29,00 zł',
  tpayTransactionId: 'TR-ABC-123456',
  invoice: { companyName: 'Firma Anna Kowalska', nip: '1234567890', address: 'ul. Przykładowa 1, 00-001 Warszawa' },
  ordersPanelUrl: 'https://paulinamaciak.pl/dietetyk/zamowienia',
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <Text style={s.small}>
      <strong>{label}:</strong> {value?.trim() ? value : '—'}
    </Text>
  )
}

function WhatToDo({ children }: { children: ReactNode }) {
  return (
    <Section style={s.alertBox}>
      <Text style={{ ...s.subheading, margin: '0 0 8px 0' }}>Co zrobić</Text>
      {children}
    </Section>
  )
}

function OrderDetails(props: ShopOwnerOrderDetails) {
  return (
    <>
      <Section style={s.highlightBox}>
        <Field label="Zamówienie" value={props.orderNumber} />
        <Field label="E-mail klientki" value={props.customerEmail} />
        <Field label="Imię" value={props.firstName} />
        <Field label="ID transakcji Tpay" value={props.tpayTransactionId} />
        <Text style={{ ...s.small, margin: '12px 0 4px 0' }}>
          <strong>Pozycje:</strong>
        </Text>
        <ItemsList items={props.items} total={props.total} />
      </Section>

      {props.invoice && (
        <Section style={s.contractBox}>
          <Text style={{ ...s.subheading, margin: '0 0 8px 0' }}>Faktura – do wystawienia w ciągu 7 dni</Text>
          <Field label="Firma" value={props.invoice.companyName} />
          <Field label="NIP" value={props.invoice.nip} />
          <Field label="Adres" value={props.invoice.address} />
        </Section>
      )}

      <Button style={s.button} href={props.ordersPanelUrl}>
        Otwórz panel zamówień
      </Button>
    </>
  )
}

export default function ShopOwnerNotification(props: ShopOwnerNotificationProps) {
  // `email dev` renderuje szablon bez propsów – wtedy pokazujemy przykład new_order
  const p: ShopOwnerNotificationProps = props && 'variant' in props ? props : previewProps

  switch (p.variant) {
    case 'new_order':
      return (
        <ShopEmailLayout preview={`Nowe zamówienie ${p.orderNumber} – ${p.total}`} footer="owner">
          <Text style={s.heading}>Nowe zamówienie {p.orderNumber}</Text>
          <Text style={s.paragraph}>Zamówienie zostało opłacone, a potwierdzenie z e-bookiem wysłane do klientki.</Text>
          <OrderDetails {...p} />
        </ShopEmailLayout>
      )

    case 'amount_mismatch':
      return (
        <ShopEmailLayout preview={`Niezgodna kwota – ${p.orderNumber}`} footer="owner">
          <Text style={s.heading}>Niezgodna kwota płatności</Text>
          <Text style={s.paragraph}>
            Tpay zgłosił płatność dla zamówienia {p.orderNumber} w innej kwocie niż kwota zamówienia. Zamówienie NIE
            zostało zrealizowane.
          </Text>
          <WhatToDo>
            <Field label="Oczekiwana kwota" value={p.expectedAmount} />
            <Field label="Otrzymana kwota" value={p.receivedAmount} />
            <Text style={s.small}>Sprawdź w panelu Tpay, zwrot albo ręczna realizacja.</Text>
          </WhatToDo>
          <OrderDetails {...p} />
        </ShopEmailLayout>
      )

    case 'late_payment':
      return (
        <ShopEmailLayout preview={`Płatność po terminie – ${p.orderNumber}`} footer="owner">
          <Text style={s.heading}>Płatność po terminie</Text>
          <Text style={s.paragraph}>
            Płatność dla zamówienia {p.orderNumber} wpłynęła po jego wygaśnięciu. Zamówienie nie zostało zrealizowane.
          </Text>
          <WhatToDo>
            <Field label="Status zamówienia" value="wygasło (expired)" />
            <Field label="Otrzymana kwota" value={p.receivedAmount} />
            <Field
              label="Mail do klientki"
              value={p.customerNotified ? 'wysłany (zwrot w 14 dni albo realizacja na wniosek)' : 'NIE został wysłany – napisz do klientki'}
            />
            <Text style={s.small}>
              Zwrot w 14 dni w panelu Tpay albo realizacja na wniosek klientki (nowe potwierdzenie umowy, § 5 ust. 7
              regulaminu) – zgodnie z § 5 ust. 6 regulaminu.
            </Text>
          </WhatToDo>
          <OrderDetails {...p} />
        </ShopEmailLayout>
      )

    case 'unexpected_payment':
      return (
        <ShopEmailLayout preview={`Płatność dla nieudanego zamówienia – ${p.orderNumber}`} footer="owner">
          <Text style={s.heading}>Płatność dla nieudanego zamówienia</Text>
          <Text style={s.paragraph}>
            Tpay zgłosił udaną płatność dla zamówienia {p.orderNumber}, które wcześniej zostało oznaczone jako nieudane.
            Zamówienie nie zostało zrealizowane.
          </Text>
          <WhatToDo>
            <Field label="Status zamówienia" value="nieudane (failed)" />
            <Field label="Otrzymana kwota" value={p.receivedAmount} />
            <Text style={s.small}>Zwrot albo ręczna realizacja.</Text>
          </WhatToDo>
          <OrderDetails {...p} />
        </ShopEmailLayout>
      )

    case 'unknown_payment':
      return (
        <ShopEmailLayout preview="Płatność dla nieznanej transakcji" footer="owner">
          <Text style={s.heading}>Płatność dla nieznanej transakcji</Text>
          <Text style={s.paragraph}>
            Tpay przesłał poprawnie podpisane powiadomienie o płatności, której nie można przypisać do żadnego
            zamówienia sklepu.
          </Text>
          <WhatToDo>
            <Field label="tr_crc" value={p.trCrc} />
            <Field label="ID transakcji Tpay" value={p.tpayTransactionId} />
            <Field label="Kwota" value={p.amount} />
            <Text style={s.small}>Wyszukaj w panelu Tpay.</Text>
          </WhatToDo>
        </ShopEmailLayout>
      )
  }
}

// Podgląd w `npm run email:dev`
ShopOwnerNotification.PreviewProps = previewProps
