/**
 * Unit Tests: ShopMailService (maile sklepu, Task 5.2) – transport nodemailer zamockowany.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Database } from '@/db'
import type { ShopOrder, ShopOrderItem } from '@/db/schema'
import { ShopMailService, formatShopDate } from '@/lib/services/shopMailService'
import { SHOP_TERMS_VERSION, DIGITAL_CONTENT_CONSENT_TEXT } from '@/lib/shop/constants'

const sendMail = vi.hoisted(() => vi.fn())
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }))

const EMAIL = 'anna.kowalska@example.com'
const DOWNLOAD_TOKEN = 'd'.repeat(64)
const ACCOUNT_TOKEN = 'a'.repeat(64)
const ORDER_CONSENT_TEXT = 'Tekst zgody zapisany w zamówieniu (inny niż bieżąca stała).'

const ENV_KEYS = [
  'NODE_ENV',
  'VERCEL_ENV',
  'SMTP_USER',
  'SMTP_PASS',
  'SITE_URL',
  'CONTACT_EMAIL',
  'SHOP_OWNER_NOTIFICATION_EMAILS',
] as const
const savedEnv: Record<string, string | undefined> = {}

function order(overrides: Partial<ShopOrder> = {}): ShopOrder {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    orderNumber: 'ZAM-2026-00001',
    email: EMAIL,
    firstName: 'Anna',
    userId: null,
    status: 'paid',
    totalAmount: '29.00',
    currency: 'PLN',
    invoiceRequested: false,
    invoiceCompanyName: null,
    invoiceNip: null,
    invoiceAddress: null,
    termsVersion: SHOP_TERMS_VERSION,
    termsAcceptedAt: new Date('2026-11-01T11:29:00Z'),
    digitalContentConsentAt: new Date('2026-11-01T11:29:00Z'),
    digitalContentConsentText: ORDER_CONSENT_TEXT,
    accountRequested: false,
    checkoutSecretHash: null,
    confirmationSentAt: null,
    paidAt: new Date('2026-11-01T11:31:00Z'),
    anonymizedAt: null,
    createdAt: new Date('2026-11-01T11:30:00Z'), // 12:30 w Warszawie (CET)
    updatedAt: new Date('2026-11-01T11:31:00Z'),
    ...overrides,
  }
}

const items: ShopOrderItem[] = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    orderId: '11111111-1111-4111-8111-111111111111',
    productId: '33333333-3333-4333-8333-333333333333',
    titleSnapshot: 'Proteinowa Piekarnia',
    unitPrice: '29.00',
    fileObjectKey: null,
  },
]

/** Minimalny db do wczytania pozycji w alertach (select().from().where()). */
const fakeDb = { select: () => ({ from: () => ({ where: async () => items }) }) } as unknown as Database

function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

const mail = (i = 0) => sendMail.mock.calls[i][0]

/** Cały output konsoli (log/warn/error) jako tekst. */
function consoleOutput(): string {
  return [console.log, console.warn, console.error]
    .flatMap((fn) => (fn as unknown as ReturnType<typeof vi.fn>).mock.calls)
    .map((args) => JSON.stringify(args))
    .join('\n')
}

function expectNoSecretsInConsole() {
  const out = consoleOutput()
  expect(out).not.toContain(EMAIL)
  expect(out).not.toContain(DOWNLOAD_TOKEN)
  expect(out).not.toContain(ACCOUNT_TOKEN)
  expect(out).not.toContain('/sklep/pobierz/')
  expect(out).not.toContain('owner@')
}

describe('ShopMailService', () => {
  let service: ShopMailService

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key]
    setEnv({
      NODE_ENV: 'test',
      VERCEL_ENV: undefined,
      SMTP_USER: 'sklep@paulinamaciak.pl',
      SMTP_PASS: 'secret',
      SITE_URL: 'https://paulinamaciak.pl/',
      CONTACT_EMAIL: 'kontakt@paulinamaciak.pl',
      SHOP_OWNER_NOTIFICATION_EMAILS: ' owner@example.com , owner2@example.com,',
    })
    sendMail.mockReset().mockResolvedValue({ messageId: 'x' })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    service = new ShopMailService(fakeDb)
  })

  afterEach(() => {
    setEnv(savedEnv)
    vi.restoreAllMocks()
  })

  describe('sendOrderConfirmation', () => {
    it('sends the contract confirmation with the terms PDF and consent data from the order', async () => {
      const sent = await service.sendOrderConfirmation(order({ invoiceRequested: true }), items, DOWNLOAD_TOKEN, {
        kind: 'create',
        token: ACCOUNT_TOKEN,
        emphasized: true,
      })

      expect(sent).toBe(true)
      expect(sendMail).toHaveBeenCalledTimes(1)
      const m = mail()
      expect(m.to).toBe(EMAIL)
      expect(m.from).toContain('<sklep@paulinamaciak.pl>')
      expect(m.replyTo).toBe('kontakt@paulinamaciak.pl')
      expect(m.subject).toBe('Twoje zamówienie ZAM-2026-00001 – potwierdzenie i e-book')

      expect(m.attachments).toHaveLength(1)
      expect(m.attachments[0]).toMatchObject({
        filename: `Regulamin-sklepu-${SHOP_TERMS_VERSION}.pdf`,
        contentType: 'application/pdf',
      })
      expect(m.attachments[0].content.subarray(0, 5).toString()).toBe('%PDF-')

      for (const body of [m.html, m.text]) {
        expect(body).toContain(`https://paulinamaciak.pl/sklep/pobierz/${DOWNLOAD_TOKEN}`)
        expect(body).toContain(`https://paulinamaciak.pl/sklep/konto/${ACCOUNT_TOKEN}`)
        expect(body).toContain('https://paulinamaciak.pl/sklep/wyslij-link')
        expect(body).toContain('1 listopada 2026, 12:30') // data zamówienia, Europe/Warsaw
        expect(body).toContain('1 listopada 2026, 12:29') // data oświadczenia
        expect(body).toContain('29,00 zł')
        expect(body).toContain('Proteinowa Piekarnia')
        expect(body).toContain('Fakturę wyślę')
      }
      // Zgoda z wiersza zamówienia, nie ze stałej
      expect(m.text).toContain(ORDER_CONSENT_TEXT)
      expect(m.text).not.toContain(DIGITAL_CONTENT_CONSENT_TEXT)
      expectNoSecretsInConsole()
    })

    it('logged-in order → „Moje zakupy” link', async () => {
      await service.sendOrderConfirmation(order(), items, DOWNLOAD_TOKEN, { kind: 'none' })
      expect(mail().html).toContain('https://paulinamaciak.pl/konto/zakupy')
    })

    it('no terms PDF for the order terms version → false, nothing sent', async () => {
      const sent = await service.sendOrderConfirmation(order({ termsVersion: '1999-01-01' }), items, DOWNLOAD_TOKEN, {
        kind: 'none',
      })
      expect(sent).toBe(false)
      expect(sendMail).not.toHaveBeenCalled()
      expect(consoleOutput()).toContain('No terms PDF')
      expectNoSecretsInConsole()
    })
  })

  describe('environment', () => {
    it('dev mode (no SMTP, not production): logs instead of sending, returns true, no secrets in logs', async () => {
      setEnv({ SMTP_USER: undefined, SMTP_PASS: undefined, SITE_URL: undefined })

      const sent = await service.sendOrderConfirmation(order(), items, DOWNLOAD_TOKEN, {
        kind: 'attach',
        token: ACCOUNT_TOKEN,
      })

      expect(sent).toBe(true)
      expect(sendMail).not.toHaveBeenCalled()
      expect(consoleOutput()).toContain('[DEV MODE]')
      expectNoSecretsInConsole()
    })

    it.each([
      ['NODE_ENV=production', { NODE_ENV: 'production' }],
      ['VERCEL_ENV=preview', { VERCEL_ENV: 'preview' }],
    ])('production (%s) without SMTP credentials → false, nothing sent or logged as dev', async (_l, env) => {
      setEnv({ ...env, SMTP_PASS: undefined })

      expect(await service.sendOrderConfirmation(order(), items, DOWNLOAD_TOKEN, { kind: 'none' })).toBe(false)
      expect(
        await service.sendDownloadLinks(EMAIL, [{ order: order(), items, downloadToken: DOWNLOAD_TOKEN }], {
          kind: 'none',
        })
      ).toBe(false)
      expect(sendMail).not.toHaveBeenCalled()
      expect(consoleOutput()).not.toContain('[DEV MODE]')
      expect(consoleOutput()).toContain('SMTP credentials')
      expectNoSecretsInConsole()
    })

    it('production without SITE_URL → false', async () => {
      setEnv({ NODE_ENV: 'production', SITE_URL: undefined })
      expect(await service.sendOrderConfirmation(order(), items, DOWNLOAD_TOKEN, { kind: 'none' })).toBe(false)
      expect(sendMail).not.toHaveBeenCalled()
    })

    it('production with SMTP → really sends', async () => {
      setEnv({ NODE_ENV: 'production' })
      expect(await service.notifyCustomerLatePayment(order())).toBe(true)
      expect(sendMail).toHaveBeenCalledTimes(1)
    })
  })

  describe('transport errors never throw', () => {
    beforeEach(() => {
      sendMail.mockRejectedValue(Object.assign(new Error(`550 mailbox ${EMAIL} unavailable`), { name: 'SMTPError' }))
    })

    it.each([
      [
        'sendOrderConfirmation',
        (s: ShopMailService) => s.sendOrderConfirmation(order(), items, DOWNLOAD_TOKEN, { kind: 'none' }),
      ],
      ['notifyCustomerLatePayment', (s: ShopMailService) => s.notifyCustomerLatePayment(order())],
      [
        'notifyOwnerLatePayment',
        (s: ShopMailService) =>
          s.notifyOwnerLatePayment(order(), {
            receivedAmount: '29.00',
            customerNotified: true,
            tpayTransactionId: 'TR-1',
          }),
      ],
      [
        'sendAccountLink',
        (s: ShopMailService) => s.sendAccountLink(EMAIL, { kind: 'create', token: ACCOUNT_TOKEN, emphasized: false }),
      ],
      [
        'sendDownloadLinks',
        (s: ShopMailService) =>
          s.sendDownloadLinks(EMAIL, [{ order: order(), items, downloadToken: DOWNLOAD_TOKEN }], {
            kind: 'attach',
            token: ACCOUNT_TOKEN,
          }),
      ],
    ])('%s → false', async (_name, run) => {
      await expect(run(service)).resolves.toBe(false)
      expect(sendMail).toHaveBeenCalledTimes(1)
      expect(consoleOutput()).toContain('SMTPError')
      expectNoSecretsInConsole()
    })

    it('void owner notifications resolve', async () => {
      await expect(
        service.notifyOwner(order(), items, { confirmationSent: true, tpayTransactionId: null })
      ).resolves.toBeUndefined()
      await expect(
        service.notifyOwnerUnknownPayment({ trCrc: 'abc', tpayTransactionId: 'TR-1', amount: '29.00' })
      ).resolves.toBeUndefined()
      expectNoSecretsInConsole()
    })
  })

  describe('owner notifications', () => {
    it('new order with invoice → [FAKTURA] subject, recipients from SHOP_OWNER_NOTIFICATION_EMAILS, invoice data', async () => {
      await service.notifyOwner(
        order({
          invoiceRequested: true,
          invoiceCompanyName: 'Firma Anna',
          invoiceNip: '1234567890',
          invoiceAddress: 'ul. Długa 1',
        }),
        items,
        { confirmationSent: true, tpayTransactionId: 'TR-ABC-123' }
      )

      const m = mail()
      expect(m.to).toBe('owner@example.com, owner2@example.com')
      expect(m.subject).toBe('[FAKTURA] Zamówienie ZAM-2026-00001')
      expect(m.replyTo).toBeUndefined()
      expect(m.attachments).toBeUndefined()
      for (const text of [
        'Firma Anna',
        '1234567890',
        'ul. Długa 1',
        'TR-ABC-123',
        EMAIL,
        'https://paulinamaciak.pl/dietetyk/zamowienia',
      ]) {
        expect(m.text).toContain(text)
      }
    })

    it('new order without invoice → „Nowe zamówienie”, confirmationSent=false shown', async () => {
      await service.notifyOwner(order(), items, { confirmationSent: false, tpayTransactionId: null })
      expect(mail().subject).toBe('Nowe zamówienie ZAM-2026-00001')
      expect(mail().text).toContain('NIE zostało wysłane')
      expect(mail().text).not.toContain('Faktura – do wystawienia')
    })

    it('no SHOP_OWNER_NOTIFICATION_EMAILS → falls back to CONTACT_EMAIL', async () => {
      setEnv({ SHOP_OWNER_NOTIFICATION_EMAILS: ' , ' })
      await service.notifyOwnerAmountMismatch(order(), { expected: '29.00', received: '5', tpayTransactionId: 'TR-1' })
      expect(mail().to).toBe('kontakt@paulinamaciak.pl')
      expect(mail().subject).toBe('[UWAGA] Niezgodna kwota ZAM-2026-00001')
      expect(mail().text).toContain('5,00 zł')
    })

    it('no recipients at all → warn, nothing sent, late-payment alert returns false', async () => {
      setEnv({ SHOP_OWNER_NOTIFICATION_EMAILS: undefined, CONTACT_EMAIL: undefined })
      const sent = await service.notifyOwnerLatePayment(order(), {
        receivedAmount: '29.00',
        customerNotified: true,
        tpayTransactionId: null,
      })
      expect(sent).toBe(false)
      expect(sendMail).not.toHaveBeenCalled()
      expect(consoleOutput()).toContain('No owner recipients')
    })

    it('late payment alert: items loaded from the db, customerNotified shown', async () => {
      const sent = await service.notifyOwnerLatePayment(order({ status: 'expired' }), {
        receivedAmount: '29.00',
        customerNotified: false,
        tpayTransactionId: 'TR-1',
      })
      expect(sent).toBe(true)
      expect(mail().subject).toBe('[UWAGA] Płatność po terminie ZAM-2026-00001')
      expect(mail().text).toContain('Proteinowa Piekarnia')
      expect(mail().text).toContain('NIE został wysłany')
    })

    it('unknown payment: unparseable amount shown raw (trimmed)', async () => {
      await service.notifyOwnerUnknownPayment({ trCrc: 'crc-1', tpayTransactionId: 'TR-9', amount: '  29,00 ' })
      expect(mail().subject).toBe('[UWAGA] Płatność dla nieznanej transakcji')
      expect(mail().text).toContain('29,00')
      expect(mail().text).toContain('crc-1')
    })

    it('unexpected payment', async () => {
      await service.notifyOwnerUnexpectedPayment(order({ status: 'failed' }), {
        receivedAmount: '29.00',
        tpayTransactionId: 'TR-2',
      })
      expect(mail().subject).toBe('[UWAGA] Płatność dla nieudanego zamówienia ZAM-2026-00001')
    })
  })

  describe('customer e-mails', () => {
    it('late payment → reply-to CONTACT_EMAIL, no download link', async () => {
      expect(await service.notifyCustomerLatePayment(order())).toBe(true)
      expect(mail().to).toBe(EMAIL)
      expect(mail().replyTo).toBe('kontakt@paulinamaciak.pl')
      expect(mail().subject).toBe('Płatność po terminie – zamówienie ZAM-2026-00001')
      expect(mail().html).not.toContain('/sklep/pobierz/')
    })

    it('account link (create / attach) → subject by kind, URL with token', async () => {
      await service.sendAccountLink(EMAIL, { kind: 'create', token: ACCOUNT_TOKEN, emphasized: false })
      await service.sendAccountLink(EMAIL, { kind: 'attach', token: ACCOUNT_TOKEN })
      expect(mail(0).subject).toBe('Załóż konto w sklepie paulinamaciak.pl')
      expect(mail(1).subject).toBe('Zakupy w Twoim koncie')
      expect(mail(0).html).toContain(`https://paulinamaciak.pl/sklep/konto/${ACCOUNT_TOKEN}`)
      expectNoSecretsInConsole()
    })

    it('download links → one link per order', async () => {
      const second = order({ id: '44444444-4444-4444-8444-444444444444', orderNumber: 'ZAM-2026-00002' })
      await service.sendDownloadLinks(
        EMAIL,
        [
          { order: order(), items, downloadToken: DOWNLOAD_TOKEN },
          { order: second, items, downloadToken: 'e'.repeat(64) },
        ],
        { kind: 'none' }
      )
      const m = mail()
      expect(m.subject).toBe('Twoje linki do pobrania e-booków')
      expect(m.html).toContain(`/sklep/pobierz/${DOWNLOAD_TOKEN}`)
      expect(m.html).toContain(`/sklep/pobierz/${'e'.repeat(64)}`)
      expect(m.html).toContain('ZAM-2026-00002')
    })
  })

  it('formatShopDate uses Europe/Warsaw (summer and winter time)', () => {
    expect(formatShopDate(new Date('2026-11-01T11:30:00Z'))).toBe('1 listopada 2026, 12:30')
    expect(formatShopDate(new Date('2026-07-15T22:05:00Z'))).toBe('16 lipca 2026, 00:05')
  })
})
