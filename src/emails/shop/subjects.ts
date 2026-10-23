// Tematy maili sklepu – czyste funkcje (bez React), używane przez ShopMailService (Task 5.2).

import type { ShopOwnerNotificationProps } from '../ShopOwnerNotification'
import type { ShopEmailAccountLink } from './types'

export function shopOrderConfirmationSubject(orderNumber: string): string {
  return `Twoje zamówienie ${orderNumber} – potwierdzenie i e-book`
}

export const SHOP_DOWNLOAD_LINKS_SUBJECT = 'Twoje linki do pobrania e-booków'

export function shopAccountLinkSubject(account: Pick<ShopEmailAccountLink, 'kind'>): string {
  return account.kind === 'create' ? 'Załóż konto w sklepie paulinamaciak.pl' : 'Zakupy w Twoim koncie'
}

export function shopLatePaymentSubject(orderNumber: string): string {
  return `Płatność po terminie – zamówienie ${orderNumber}`
}

export function shopOwnerNotificationSubject(props: ShopOwnerNotificationProps): string {
  switch (props.variant) {
    case 'new_order':
      return props.invoice ? `[FAKTURA] Zamówienie ${props.orderNumber}` : `Nowe zamówienie ${props.orderNumber}`
    case 'amount_mismatch':
      return `[UWAGA] Niezgodna kwota ${props.orderNumber}`
    case 'late_payment':
      return `[UWAGA] Płatność po terminie ${props.orderNumber}`
    case 'unexpected_payment':
      return `[UWAGA] Płatność dla nieudanego zamówienia ${props.orderNumber}`
    case 'unknown_payment':
      return '[UWAGA] Płatność dla nieznanej transakcji'
  }
}
