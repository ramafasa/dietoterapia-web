/**
 * Płatność zaksięgowana po wygaśnięciu zamówienia (regulamin § 5 ust. 6).
 * Celowo BEZ linku do pobrania – umowa została rozwiązana; realizacja tylko na wniosek klientki.
 */

import { Text } from '@react-email/components'
import { ShopEmailLayout } from './shop/components'
import * as s from './shop/styles'

export interface ShopLatePaymentProps {
  firstName?: string | null
  orderNumber: string
}

export default function ShopLatePayment({ firstName, orderNumber }: ShopLatePaymentProps) {
  const name = firstName?.trim()

  return (
    <ShopEmailLayout preview={`Płatność po terminie – zamówienie ${orderNumber}`}>
      <Text style={s.heading}>Płatność po terminie</Text>
      <Text style={s.paragraph}>{name ? `Dzień dobry, ${name},` : 'Dzień dobry,'}</Text>
      <Text style={s.paragraph}>
        Płatność wpłynęła po wygaśnięciu zamówienia <strong>{orderNumber}</strong>. Zwrócę pieniądze w ciągu 14 dni.
        Jeśli wolisz otrzymać e-book, odpisz na tego maila.
      </Text>
      <Text style={s.note}>
        Zamówienie, które nie zostało opłacone w ciągu 24 godzin, jest anulowane (§ 5 ust. 6 regulaminu sklepu). Jeśli
        zażądasz realizacji przed zwrotem, wyślę potwierdzenie zamówienia z linkiem do pobrania.
      </Text>
    </ShopEmailLayout>
  )
}

// Podgląd w `npm run email:dev`
ShopLatePayment.PreviewProps = { firstName: 'Anna', orderNumber: 'ZAM-2026-00001' } satisfies ShopLatePaymentProps
