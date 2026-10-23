/**
 * Sam link „konto” – przycisk „Załóż konto” na stronie pobierania (Task 4.3).
 * `create` → ustawienie hasła; `attach` → logowanie i przypisanie zakupów do istniejącego konta.
 */

import { Text, Button } from '@react-email/components'
import { ACCOUNT_TOKEN_TTL_DAYS } from '../lib/shop/constants'
import { ShopEmailLayout } from './shop/components'
import type { ShopEmailAccountLink } from './shop/types'
import * as s from './shop/styles'

export interface ShopAccountLinkProps {
  account: ShopEmailAccountLink
}

export default function ShopAccountLink({
  account = { kind: 'create', url: 'https://paulinamaciak.pl/sklep/konto/przyklad', emphasized: true },
}: ShopAccountLinkProps) {
  const isCreate = account.kind === 'create'

  return (
    <ShopEmailLayout preview={isCreate ? 'Ustaw hasło i załóż konto w sklepie' : 'Zaloguj się, aby zobaczyć swoje zakupy'}>
      <Text style={s.heading}>{isCreate ? 'Załóż konto' : 'Twoje zakupy w koncie'}</Text>
      <Text style={s.paragraph}>
        {isCreate
          ? 'Ustaw hasło, a wszystkie e-booki kupione z tego adresu e-mail znajdziesz w jednym miejscu.'
          : 'Masz już konto z tym adresem e-mail. Zaloguj się, a e-booki kupione z tego adresu pojawią się w Twoim koncie.'}
      </Text>

      <Button style={s.button} href={account.url}>
        {isCreate ? 'Ustaw hasło i załóż konto' : 'Zaloguj się – zakupy pojawią się w Twoim koncie'}
      </Button>

      <Text style={s.note}>Link jest ważny {ACCOUNT_TOKEN_TTL_DAYS} dni.</Text>
      <Text style={s.note}>Jeśli to nie Ty, zignoruj tę wiadomość.</Text>
    </ShopEmailLayout>
  )
}
