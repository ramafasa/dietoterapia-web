import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import ShopOrderConfirmation, { type ShopOrderConfirmationProps } from '@/emails/ShopOrderConfirmation'
import ShopDownloadLinks from '@/emails/ShopDownloadLinks'
import ShopAccountLink from '@/emails/ShopAccountLink'
import ShopLatePayment from '@/emails/ShopLatePayment'
import ShopOwnerNotification, {
  shopOwnerNotificationSubject,
  type ShopOwnerNotificationProps,
  type ShopOwnerOrderDetails,
} from '@/emails/ShopOwnerNotification'
import {
  SHOP_DOWNLOAD_LINKS_SUBJECT,
  shopAccountLinkSubject,
  shopLatePaymentSubject,
  shopOrderConfirmationSubject,
} from '@/emails/shop/subjects'
import { DIGITAL_CONTENT_CONSENT_TEXT } from '@/lib/shop/constants'

const DOWNLOAD_URL = 'https://paulinamaciak.pl/sklep/pobierz/tok-download-123'
const RESEND_URL = 'https://paulinamaciak.pl/sklep/wyslij-link'
const ACCOUNT_URL = 'https://paulinamaciak.pl/sklep/konto/tok-account-456'
const PURCHASES_URL = 'https://paulinamaciak.pl/sklep/konto/zakupy'

const confirmationProps: ShopOrderConfirmationProps = {
  firstName: 'Anna',
  orderNumber: 'ZAM-2026-00007',
  orderDate: '2 listopada 2026, 10:15',
  items: [{ title: 'Proteinowa Piekarnia', price: '29,00 zł' }],
  total: '29,00 zł',
  downloadUrl: DOWNLOAD_URL,
  resendUrl: RESEND_URL,
  account: { kind: 'none', purchasesUrl: PURCHASES_URL },
  digitalContentConsentText: DIGITAL_CONTENT_CONSENT_TEXT,
  digitalContentConsentAt: '2 listopada 2026, 10:14',
  termsVersion: '2026-11-01',
  invoiceRequested: false,
}

const renderHtml = (el: Parameters<typeof render>[0]) => render(el)
/** Tekst bez tagów i z rozkodowanymi encjami – do sprawdzania zdań rozbitych przez React na kilka węzłów. */
const renderText = async (el: Parameters<typeof render>[0]) => render(el, { plainText: true })

/** Pozycja pierwszego wystąpienia w HTML (do sprawdzania kolejności sekcji). */
const indexOf = (html: string, needle: string) => {
  const i = html.indexOf(needle)
  expect(i, `missing: ${needle}`).toBeGreaterThanOrEqual(0)
  return i
}

describe('ShopOrderConfirmation', () => {
  it('contains greeting, order data, VAT note, download link and resend link', async () => {
    const html = await renderHtml(ShopOrderConfirmation(confirmationProps))
    const text = await renderText(ShopOrderConfirmation(confirmationProps))

    expect(text).toContain('Dziękuję za zakup, Anna!')
    expect(text).toContain('ZAM-2026-00007')
    expect(text).toContain('2 listopada 2026, 10:15')
    expect(text).toContain('Proteinowa Piekarnia – 29,00 zł')
    expect(text).toContain('Razem: 29,00 zł')
    expect(text).toContain('Sprzedawca zwolniony z VAT (art. 113 ust. 1 ustawy o VAT)')
    expect(html).toContain(`href="${DOWNLOAD_URL}"`)
    expect(text).toContain('Pobierz e-book')
    expect(text).toContain('Link jest ważny 30 dni. Nowy link wygenerujesz na')
    expect(html).toContain(`href="${RESEND_URL}"`)
  })

  it('falls back to a greeting without name', async () => {
    const text = await renderText(ShopOrderConfirmation({ ...confirmationProps, firstName: null }))
    expect(text).toContain('Dziękuję za zakup!')
    expect(text).not.toContain('Dziękuję za zakup,')
  })

  it('contains the contract confirmation block with verbatim consent text and its date', async () => {
    const text = await renderText(ShopOrderConfirmation(confirmationProps))

    expect(text).toContain('Potwierdzenie umowy')
    expect(text).toContain('Paulina Maciak')
    expect(text).toContain('POIO Dietoterapia Paulina Maciak')
    expect(text).toContain('Gaj 5, 95-060 Brzeziny')
    expect(text).toContain('NIP 8272247279')
    expect(text).toContain('dietoterapia@paulinamaciak.pl')
    expect(text).toContain('Reklamacje:')
    expect(text).toContain('14 dni')
    expect(text).toContain(`„${DIGITAL_CONTENT_CONSENT_TEXT}”`)
    expect(text).toContain('2 listopada 2026, 10:14')
    expect(text).toContain('Regulamin sklepu w wersji 2026-11-01 w załączniku (PDF)')
  })

  it('renders consent text exactly as given (not the constant)', async () => {
    const custom = 'Stara wersja oświadczenia – zapisana w zamówieniu.'
    const text = await renderText(ShopOrderConfirmation({ ...confirmationProps, digitalContentConsentText: custom }))
    expect(text).toContain(`„${custom}”`)
    expect(text).not.toContain(DIGITAL_CONTENT_CONSENT_TEXT)
  })

  it('invoice line only when requested', async () => {
    const without = await renderText(ShopOrderConfirmation(confirmationProps))
    const withInvoice = await renderText(ShopOrderConfirmation({ ...confirmationProps, invoiceRequested: true }))
    expect(without).not.toContain('Fakturę wyślemy')
    expect(withInvoice).toContain('Fakturę wyślemy na ten adres w ciągu 7 dni')
  })

  it('account none → link to Moje zakupy', async () => {
    const html = await renderHtml(ShopOrderConfirmation(confirmationProps))
    const text = await renderText(ShopOrderConfirmation(confirmationProps))
    expect(text).toContain('E-book jest też w Twoim koncie: Moje zakupy')
    expect(html).toContain(`href="${PURCHASES_URL}"`)
    expect(text).not.toContain('Załóż konto')
    expect(text).not.toContain('Zaloguj się')
  })

  it('account create + emphasized → button right under download, before the contract block', async () => {
    const props = { ...confirmationProps, account: { kind: 'create' as const, url: ACCOUNT_URL, emphasized: true } }
    const html = await renderHtml(ShopOrderConfirmation(props))
    const text = await renderText(ShopOrderConfirmation(props))

    expect(text).toContain('Ustaw hasło i załóż konto')
    expect(text).toContain('Link do konta jest ważny 30 dni.')
    expect(text).not.toContain('Chcesz mieć e-booki zawsze w jednym miejscu?')
    const download = indexOf(html, `href="${DOWNLOAD_URL}"`)
    const account = indexOf(html, `href="${ACCOUNT_URL}"`)
    const contract = indexOf(html, 'Potwierdzenie umowy')
    expect(download).toBeLessThan(account)
    expect(account).toBeLessThan(contract)
  })

  it('account create (not emphasized) → modest link at the bottom', async () => {
    const props = { ...confirmationProps, account: { kind: 'create' as const, url: ACCOUNT_URL, emphasized: false } }
    const html = await renderHtml(ShopOrderConfirmation(props))
    const text = await renderText(ShopOrderConfirmation(props))

    expect(text).toContain('Chcesz mieć e-booki zawsze w jednym miejscu?')
    expect(text).toContain('Załóż konto')
    expect(text).toContain('Link do konta jest ważny 30 dni.')
    expect(text).not.toContain('Ustaw hasło i załóż konto')
    expect(indexOf(html, 'Potwierdzenie umowy')).toBeLessThan(indexOf(html, `href="${ACCOUNT_URL}"`))
  })

  it('account attach → login link', async () => {
    const props = { ...confirmationProps, account: { kind: 'attach' as const, url: ACCOUNT_URL } }
    const html = await renderHtml(ShopOrderConfirmation(props))
    const text = await renderText(ShopOrderConfirmation(props))
    expect(text).toContain('Zaloguj się – zakup pojawi się w Twoim koncie')
    expect(text).toContain('Link do konta jest ważny 30 dni.')
    expect(html).toContain(`href="${ACCOUNT_URL}"`)
  })

  it('escapes HTML-special characters in firstName and item titles', async () => {
    const html = await renderHtml(
      ShopOrderConfirmation({
        ...confirmationProps,
        firstName: '<script>alert("x")</script>',
        items: [{ title: 'A & B <b>', price: '29,00 zł' }],
      })
    )
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A &amp; B &lt;b&gt;')
  })

  it('renders with default (preview) props', async () => {
    const html = await renderHtml(ShopOrderConfirmation({} as ShopOrderConfirmationProps))
    expect(html).toContain('Potwierdzenie umowy')
  })
})

describe('ShopDownloadLinks', () => {
  const orders = [
    {
      orderNumber: 'ZAM-2026-00001',
      orderDate: '1 listopada 2026',
      itemTitles: ['Proteinowa Piekarnia'],
      downloadUrl: 'https://paulinamaciak.pl/sklep/pobierz/a1',
    },
    {
      orderNumber: 'ZAM-2026-00002',
      orderDate: '3 listopada 2026',
      itemTitles: ['E-book 2', 'E-book 3'],
      downloadUrl: 'https://paulinamaciak.pl/sklep/pobierz/b2',
    },
  ]

  it('lists every order with its download link and validity', async () => {
    const el = ShopDownloadLinks({ orders, account: { kind: 'none', purchasesUrl: PURCHASES_URL }, resendUrl: RESEND_URL })
    const html = await renderHtml(el)
    const text = await renderText(el)

    for (const o of orders) {
      expect(text).toContain(o.orderNumber)
      expect(text).toContain(o.orderDate)
      for (const t of o.itemTitles) expect(text).toContain(t)
      expect(html).toContain(`href="${o.downloadUrl}"`)
    }
    expect(text).toContain('ważne 30 dni')
    expect(text).toContain('E-booki są też w Twoim koncie: Moje zakupy')
  })

  it('reuses the account section (create emphasized / not, attach)', async () => {
    const emphasized = await renderText(
      ShopDownloadLinks({ orders, account: { kind: 'create', url: ACCOUNT_URL, emphasized: true }, resendUrl: RESEND_URL })
    )
    expect(emphasized).toContain('Ustaw hasło i załóż konto')

    const modest = await renderText(
      ShopDownloadLinks({ orders, account: { kind: 'create', url: ACCOUNT_URL, emphasized: false }, resendUrl: RESEND_URL })
    )
    expect(modest).toContain('Chcesz mieć e-booki zawsze w jednym miejscu?')

    const attach = await renderText(
      ShopDownloadLinks({ orders, account: { kind: 'attach', url: ACCOUNT_URL }, resendUrl: RESEND_URL })
    )
    expect(attach).toContain('Zaloguj się – zakupy pojawią się w Twoim koncie')
  })
})

describe('ShopAccountLink', () => {
  it('create → set password', async () => {
    const el = ShopAccountLink({ account: { kind: 'create', url: ACCOUNT_URL, emphasized: false } })
    const html = await renderHtml(el)
    const text = await renderText(el)
    expect(text).toContain('Ustaw hasło i załóż konto')
    expect(text).toContain('Link jest ważny 30 dni.')
    expect(text).toContain('Jeśli to nie Ty, zignoruj tę wiadomość.')
    expect(html).toContain(`href="${ACCOUNT_URL}"`)
  })

  it('attach → login', async () => {
    const text = await renderText(ShopAccountLink({ account: { kind: 'attach', url: ACCOUNT_URL } }))
    expect(text).toContain('Zaloguj się – zakupy pojawią się w Twoim koncie')
    expect(text).not.toContain('Ustaw hasło')
  })
})

describe('ShopLatePayment', () => {
  it('informs about refund and contains no download link', async () => {
    const el = ShopLatePayment({ firstName: 'Anna', orderNumber: 'ZAM-2026-00009' })
    const html = await renderHtml(el)
    const text = await renderText(el)
    expect(text).toContain('Płatność wpłynęła po wygaśnięciu zamówienia ZAM-2026-00009.')
    expect(text).toContain('Zwrócę pieniądze w ciągu 14 dni.')
    expect(text).toContain('Jeśli wolisz otrzymać e-book, odpisz na tego maila.')
    expect(text).toContain('§ 5 ust. 6')
    expect(html).not.toContain('/sklep/pobierz')
    expect(text).not.toContain('Pobierz')
  })
})

describe('ShopOwnerNotification', () => {
  const base: ShopOwnerOrderDetails = {
    orderNumber: 'ZAM-2026-00011',
    customerEmail: 'anna@example.com',
    firstName: 'Anna',
    items: [{ title: 'Proteinowa Piekarnia', price: '29,00 zł' }],
    total: '29,00 zł',
    tpayTransactionId: 'TR-XYZ-987',
    invoice: null,
    ordersPanelUrl: 'https://paulinamaciak.pl/dietetyk/zamowienia',
  }
  const invoice = { companyName: 'Firma Anna Kowalska', nip: '1234567890', address: 'ul. Lipowa 1, 00-001 Warszawa' }

  const render2 = async (props: ShopOwnerNotificationProps) => ({
    html: await renderHtml(ShopOwnerNotification(props)),
    text: await renderText(ShopOwnerNotification(props)),
  })

  it('new_order: order fields, no alert block, invoice data only when requested', async () => {
    const { html, text } = await render2({ variant: 'new_order', ...base })
    expect(text).toContain('anna@example.com')
    expect(text).toContain('Anna')
    expect(text).toContain('Proteinowa Piekarnia – 29,00 zł')
    expect(text).toContain('TR-XYZ-987')
    expect(html).toContain('href="https://paulinamaciak.pl/dietetyk/zamowienia"')
    expect(text).not.toContain('Co zrobić')
    expect(text).not.toContain('Faktura')

    const withInvoice = await render2({ variant: 'new_order', ...base, invoice })
    expect(withInvoice.text).toContain('Firma Anna Kowalska')
    expect(withInvoice.text).toContain('1234567890')
    expect(withInvoice.text).toContain('ul. Lipowa 1, 00-001 Warszawa')
  })

  it('amount_mismatch: expected / received amounts + what to do', async () => {
    const { text } = await render2({ variant: 'amount_mismatch', ...base, expectedAmount: '29,00 zł', receivedAmount: '1,00 zł' })
    expect(text).toContain('Co zrobić')
    expect(text).toContain('Oczekiwana kwota: 29,00 zł')
    expect(text).toContain('Otrzymana kwota: 1,00 zł')
    expect(text).toContain('Sprawdź w panelu Tpay, zwrot albo ręczna realizacja.')
  })

  it('late_payment: received amount, customer notification status, regulamin references', async () => {
    const notified = await render2({ variant: 'late_payment', ...base, receivedAmount: '29,00 zł', customerNotified: true })
    expect(notified.text).toContain('Co zrobić')
    expect(notified.text).toContain('wygasło')
    expect(notified.text).toContain('Otrzymana kwota: 29,00 zł')
    expect(notified.text).toContain('Mail do klientki: wysłany')
    expect(notified.text).toContain('Zwrot w 14 dni w panelu Tpay')
    expect(notified.text).toContain('§ 5 ust. 7')

    const notNotified = await render2({ variant: 'late_payment', ...base, receivedAmount: '29,00 zł', customerNotified: false })
    expect(notNotified.text).toContain('NIE został wysłany')
  })

  it('unexpected_payment: failed status, received amount', async () => {
    const { text } = await render2({ variant: 'unexpected_payment', ...base, receivedAmount: '29,00 zł' })
    expect(text).toContain('nieudane (failed)')
    expect(text).toContain('Otrzymana kwota: 29,00 zł')
    expect(text).toContain('Zwrot albo ręczna realizacja.')
  })

  it('unknown_payment: only Tpay data', async () => {
    const { html, text } = await render2({ variant: 'unknown_payment', trCrc: 'crc-abc', tpayTransactionId: 'TR-UNK-1', amount: '49,00' })
    expect(text).toContain('tr_crc: crc-abc')
    expect(text).toContain('ID transakcji Tpay: TR-UNK-1')
    expect(text).toContain('Kwota: 49,00')
    expect(text).toContain('Wyszukaj w panelu Tpay.')
    expect(html).not.toContain('/dietetyk/zamowienia')
  })

  it('escapes customer-provided data', async () => {
    const { html } = await render2({ variant: 'new_order', ...base, firstName: '<img src=x onerror=alert(1)>', invoice: { ...invoice, companyName: '"Firma" & <Co>' } })
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<Co>')
  })

  it('renders preview props when called without props (email dev)', async () => {
    const html = await renderHtml(ShopOwnerNotification({} as ShopOwnerNotificationProps))
    expect(html).toContain('Nowe zamówienie')
  })
})

describe('subjects', () => {
  const base: ShopOwnerOrderDetails = {
    orderNumber: 'ZAM-2026-00011',
    customerEmail: 'a@example.com',
    firstName: null,
    items: [],
    total: '29,00 zł',
    tpayTransactionId: null,
    invoice: null,
    ordersPanelUrl: 'https://paulinamaciak.pl/dietetyk/zamowienia',
  }

  it('owner notification subjects', () => {
    expect(shopOwnerNotificationSubject({ variant: 'new_order', ...base })).toBe('Nowe zamówienie ZAM-2026-00011')
    expect(
      shopOwnerNotificationSubject({ variant: 'new_order', ...base, invoice: { companyName: 'X', nip: null, address: null } })
    ).toBe('[FAKTURA] Zamówienie ZAM-2026-00011')
    expect(
      shopOwnerNotificationSubject({ variant: 'amount_mismatch', ...base, expectedAmount: '1', receivedAmount: '2' })
    ).toBe('[UWAGA] Niezgodna kwota ZAM-2026-00011')
    expect(
      shopOwnerNotificationSubject({ variant: 'late_payment', ...base, receivedAmount: '1', customerNotified: true })
    ).toBe('[UWAGA] Płatność po terminie ZAM-2026-00011')
    expect(shopOwnerNotificationSubject({ variant: 'unexpected_payment', ...base, receivedAmount: '1' })).toBe(
      '[UWAGA] Płatność dla nieudanego zamówienia ZAM-2026-00011'
    )
    expect(
      shopOwnerNotificationSubject({ variant: 'unknown_payment', trCrc: 'c', tpayTransactionId: 't', amount: '1' })
    ).toBe('[UWAGA] Płatność dla nieznanej transakcji')
  })

  it('customer subjects', () => {
    expect(shopOrderConfirmationSubject('ZAM-2026-00001')).toBe('Twoje zamówienie ZAM-2026-00001 – potwierdzenie i e-book')
    expect(SHOP_DOWNLOAD_LINKS_SUBJECT).toBe('Twoje linki do pobrania e-booków')
    expect(shopAccountLinkSubject({ kind: 'create' })).toBe('Załóż konto w sklepie paulinamaciak.pl')
    expect(shopAccountLinkSubject({ kind: 'attach' })).toBe('Zakupy w Twoim koncie')
    expect(shopLatePaymentSubject('ZAM-2026-00001')).toBe('Płatność po terminie – zamówienie ZAM-2026-00001')
  })
})
