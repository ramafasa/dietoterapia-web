/**
 * Shop Mail Service (sklep) – implementacja ShopMailer (src/lib/shop/mailer.ts), Task 5.2.
 *
 * Buduje dane do szablonów react-email (src/emails/Shop*.tsx): absolutne URL-e z SITE_URL, daty
 * w Europe/Warsaw, kwoty przez formatPLN. Zgoda (tekst, data) i wersja regulaminu – ZAWSZE z wiersza
 * zamówienia (dowód z chwili zamówienia), nigdy ze stałych.
 *
 * Konfiguracja (env czytany przy każdej wysyłce):
 * - SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS – jak PzkPurchaseService,
 * - SITE_URL – baza linków,
 * - CONTACT_EMAIL – Reply-To maili do klientek (mail o spóźnionej płatności: „odpisz na tego maila”),
 *   powiadomienia o zamówieniu mają Reply-To = e-mail klientki (odpowiedź wprost do niej),
 * - SHOP_OWNER_NOTIFICATION_EMAILS – adresaci powiadomień (po przecinku); pusto → CONTACT_EMAIL.
 *
 * Tryb dev (log zamiast wysyłki, src/lib/email.ts sendShopEmail) TYLKO poza produkcją i bez danych SMTP.
 * Wtedy metody zwracają true – lokalnie da się przejść cały przepływ (confirmationSentAt, pobranie).
 * Produkcja (NODE_ENV=production albo VERCEL_ENV) bez SMTP lub bez SITE_URL → błąd w logu i false:
 * nigdy nie udajemy, że potwierdzenie umowy (trwały nośnik) wyszło.
 *
 * Metody nie rzucają – każdy błąd to log (tylko identyfikatory zamówień i nazwa błędu; bez e-maili,
 * tokenów i URL-i) i false.
 */

import { render } from '@react-email/components'
import { formatInTimeZone } from 'date-fns-tz'
import { pl } from 'date-fns/locale'
import { eq } from 'drizzle-orm'
import type { ReactElement } from 'react'
import type { Database } from '@/db'
import { shopOrderItems, type ShopOrder, type ShopOrderItem } from '@/db/schema'
import { sendShopEmail, type SMTPConfig, type ShopEmailAttachment } from '@/lib/email'
import type { AccountLink, ShopMailer } from '@/lib/shop/mailer'
import { formatPLN } from '@/lib/shop/money'
import { getTermsPdfAttachment } from '@/lib/shop/termsPdf'
import ShopOrderConfirmation from '@/emails/ShopOrderConfirmation'
import ShopDownloadLinks from '@/emails/ShopDownloadLinks'
import ShopAccountLink from '@/emails/ShopAccountLink'
import ShopLatePayment from '@/emails/ShopLatePayment'
import ShopOwnerNotification from '@/emails/ShopOwnerNotification'
import type {
  ShopEmailAccount,
  ShopEmailAccountLink,
  ShopEmailItem,
  ShopOwnerNotificationProps,
  ShopOwnerOrderDetails,
} from '@/emails/shop/types'
import {
  SHOP_DOWNLOAD_LINKS_SUBJECT,
  shopAccountLinkSubject,
  shopLatePaymentSubject,
  shopOrderConfirmationSubject,
  shopOwnerNotificationSubject,
} from '@/emails/shop/subjects'

const LOG = '[ShopMailService]'
const TIME_ZONE = 'Europe/Warsaw'
const DEV_SITE_URL = 'http://localhost:4321'

interface MailConfig {
  smtp: SMTPConfig
  isDev: boolean
  siteUrl: string
  replyTo: string | undefined
}

/** Kontekst logu – wyłącznie identyfikatory. */
type LogIds = Record<string, string | string[] | null>

/**
 * Produkcja = zbudowany artefakt (import.meta.env.PROD, wstawiane jako `true` przy `astro build`) albo
 * runtime produkcyjny/preview. Zbudowany kod nigdy nie wejdzie w tryb dev „log i true”.
 */
function isProductionRuntime(): boolean {
  return import.meta.env.PROD || process.env.NODE_ENV === 'production' || !!process.env.VERCEL_ENV
}

/** Data w czasie polskim, np. „1 listopada 2026, 12:30”. */
export function formatShopDate(date: Date): string {
  return formatInTimeZone(date, TIME_ZONE, 'd MMMM yyyy, HH:mm', { locale: pl })
}

/** Kwota do wyświetlenia; nieparsowalna (np. z Tpay) → surowa, przycięta wartość. */
function displayAmount(value: string): string {
  const trimmed = value.trim()
  try {
    return formatPLN(trimmed)
  } catch {
    return trimmed || '—'
  }
}

function toEmailItems(items: ShopOrderItem[]): ShopEmailItem[] {
  return items.map((i) => ({ title: i.titleSnapshot, price: displayAmount(i.unitPrice) }))
}

/**
 * Błąd do logu: nazwa + kody (nodemailer: `code` np. ETIMEDOUT/EAUTH, `responseCode` SMTP np. 550).
 * Nigdy `message` / `response` – mogą zawierać adresy e-mail.
 */
function errorLog(error: unknown): { name: string; code?: string; responseCode?: number } {
  if (!(error instanceof Error)) return { name: typeof error }
  const { code, responseCode } = error as { code?: unknown; responseCode?: unknown }
  return {
    name: error.name,
    ...(typeof code === 'string' && { code }),
    ...(typeof responseCode === 'number' && { responseCode }),
  }
}

export class ShopMailService implements ShopMailer {
  /** db – tylko do wczytania pozycji zamówienia w alertach dla właścicielki (bez db: lista pusta). */
  constructor(private db?: Database) {}

  // ===== Klientka =====

  async sendOrderConfirmation(
    order: ShopOrder,
    items: ShopOrderItem[],
    downloadToken: string,
    accountLink: AccountLink
  ): Promise<boolean> {
    const ids = { orderId: order.id, orderNumber: order.orderNumber }
    // Bez regulaminu w wersji z zamówienia nie ma potwierdzenia umowy (Task 5.1)
    const terms = getTermsPdfAttachment(order.termsVersion)
    if (!terms) {
      console.error(`${LOG} No terms PDF for order terms version – confirmation NOT sent`, {
        ...ids,
        termsVersion: order.termsVersion,
      })
      return false
    }

    return this.send('order_confirmation', ids, [order.email], (cfg) => ({
      subject: shopOrderConfirmationSubject(order.orderNumber),
      element: ShopOrderConfirmation({
        firstName: order.firstName,
        orderNumber: order.orderNumber,
        orderDate: formatShopDate(order.createdAt),
        items: toEmailItems(items),
        total: displayAmount(order.totalAmount),
        downloadUrl: this.downloadUrl(cfg, downloadToken),
        resendUrl: `${cfg.siteUrl}/sklep/wyslij-link`,
        account: this.account(cfg, accountLink),
        digitalContentConsentText: order.digitalContentConsentText,
        digitalContentConsentAt: formatShopDate(order.digitalContentConsentAt),
        termsVersion: order.termsVersion,
        invoiceRequested: order.invoiceRequested,
      }),
      attachments: [terms],
    }))
  }

  async notifyCustomerLatePayment(order: ShopOrder): Promise<boolean> {
    return this.send(
      'late_payment_customer',
      { orderId: order.id, orderNumber: order.orderNumber },
      [order.email],
      () => ({
        subject: shopLatePaymentSubject(order.orderNumber),
        element: ShopLatePayment({ firstName: order.firstName, orderNumber: order.orderNumber }),
      })
    )
  }

  async sendAccountLink(email: string, accountLink: Exclude<AccountLink, { kind: 'none' }>): Promise<boolean> {
    return this.send('account_link', { kind: accountLink.kind }, [email], (cfg) => {
      const account = this.accountLink(cfg, accountLink)
      return { subject: shopAccountLinkSubject(account), element: ShopAccountLink({ account }) }
    })
  }

  async sendDownloadLinks(
    email: string,
    downloads: { order: ShopOrder; items: ShopOrderItem[]; downloadToken: string }[],
    accountLink: AccountLink
  ): Promise<boolean> {
    const ids = { orderIds: downloads.map((d) => d.order.id) }
    return this.send('download_links', ids, [email], (cfg) => ({
      subject: SHOP_DOWNLOAD_LINKS_SUBJECT,
      element: ShopDownloadLinks({
        orders: downloads.map((d) => ({
          orderNumber: d.order.orderNumber,
          orderDate: formatShopDate(d.order.createdAt),
          itemTitles: d.items.map((i) => i.titleSnapshot),
          downloadUrl: this.downloadUrl(cfg, d.downloadToken),
        })),
        account: this.account(cfg, accountLink),
        resendUrl: `${cfg.siteUrl}/sklep/wyslij-link`,
      }),
    }))
  }

  // ===== Właścicielka =====

  async notifyOwner(
    order: ShopOrder,
    items: ShopOrderItem[],
    details: { confirmationSent: boolean; tpayTransactionId: string | null }
  ): Promise<void> {
    await this.sendOwner(
      'new_order',
      { orderId: order.id, orderNumber: order.orderNumber },
      (cfg) => ({
        variant: 'new_order',
        confirmationSent: details.confirmationSent,
        ...this.ownerOrderDetails(cfg, order, items, details.tpayTransactionId),
      }),
      order.email
    )
  }

  async notifyOwnerAmountMismatch(
    order: ShopOrder,
    details: { expected: string; received: string; tpayTransactionId: string | null }
  ): Promise<void> {
    const items = await this.loadItems(order.id)
    await this.sendOwner(
      'amount_mismatch',
      { orderId: order.id, orderNumber: order.orderNumber },
      (cfg) => ({
        variant: 'amount_mismatch',
        expectedAmount: displayAmount(details.expected),
        receivedAmount: displayAmount(details.received),
        ...this.ownerOrderDetails(cfg, order, items, details.tpayTransactionId),
      }),
      order.email
    )
  }

  async notifyOwnerLatePayment(
    order: ShopOrder,
    details: { receivedAmount: string; customerNotified: boolean; tpayTransactionId: string | null }
  ): Promise<boolean> {
    const items = await this.loadItems(order.id)
    return this.sendOwner(
      'late_payment',
      { orderId: order.id, orderNumber: order.orderNumber },
      (cfg) => ({
        variant: 'late_payment',
        receivedAmount: displayAmount(details.receivedAmount),
        customerNotified: details.customerNotified,
        ...this.ownerOrderDetails(cfg, order, items, details.tpayTransactionId),
      }),
      order.email
    )
  }

  async notifyOwnerUnexpectedPayment(
    order: ShopOrder,
    details: { receivedAmount: string; tpayTransactionId: string | null }
  ): Promise<void> {
    const items = await this.loadItems(order.id)
    await this.sendOwner(
      'unexpected_payment',
      { orderId: order.id, orderNumber: order.orderNumber },
      (cfg) => ({
        variant: 'unexpected_payment',
        receivedAmount: displayAmount(details.receivedAmount),
        ...this.ownerOrderDetails(cfg, order, items, details.tpayTransactionId),
      }),
      order.email
    )
  }

  async notifyOwnerUnknownPayment(details: {
    trCrc: string
    tpayTransactionId: string
    amount: string
  }): Promise<void> {
    await this.sendOwner('unknown_payment', { tpayTransactionId: details.tpayTransactionId }, () => ({
      variant: 'unknown_payment',
      trCrc: details.trCrc,
      tpayTransactionId: details.tpayTransactionId,
      amount: displayAmount(details.amount),
    }))
  }

  // ===== Wspólne =====

  private ownerOrderDetails(
    cfg: MailConfig,
    order: ShopOrder,
    items: ShopOrderItem[],
    tpayTransactionId: string | null
  ): ShopOwnerOrderDetails {
    return {
      orderNumber: order.orderNumber,
      customerEmail: order.email,
      firstName: order.firstName,
      items: toEmailItems(items),
      total: displayAmount(order.totalAmount),
      tpayTransactionId: tpayTransactionId?.trim() || null,
      invoice: order.invoiceRequested
        ? { companyName: order.invoiceCompanyName, nip: order.invoiceNip, address: order.invoiceAddress }
        : null,
      ordersPanelUrl: `${cfg.siteUrl}/dietetyk/zamowienia`,
    }
  }

  /** Pozycje do alertu; błąd / brak db → [] (alert i tak wychodzi – kwoty i numer zamówienia wystarczą). */
  private async loadItems(orderId: string): Promise<ShopOrderItem[]> {
    if (!this.db) return []
    try {
      return await this.db.select().from(shopOrderItems).where(eq(shopOrderItems.orderId, orderId))
    } catch (error) {
      console.error(`${LOG} Error loading order items for owner alert`, { orderId, ...errorLog(error) })
      return []
    }
  }

  private downloadUrl(cfg: MailConfig, token: string): string {
    return `${cfg.siteUrl}/sklep/pobierz/${encodeURIComponent(token)}`
  }

  private account(cfg: MailConfig, link: AccountLink): ShopEmailAccount {
    if (link.kind === 'none') return { kind: 'none', purchasesUrl: `${cfg.siteUrl}/konto/zakupy` }
    return this.accountLink(cfg, link)
  }

  private accountLink(cfg: MailConfig, link: Exclude<AccountLink, { kind: 'none' }>): ShopEmailAccountLink {
    const url = `${cfg.siteUrl}/sklep/konto/${encodeURIComponent(link.token)}`
    return link.kind === 'create' ? { kind: 'create', url, emphasized: link.emphasized } : { kind: 'attach', url }
  }

  private ownerRecipients(): string[] {
    const configured = (process.env.SHOP_OWNER_NOTIFICATION_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean)
    if (configured.length > 0) return configured
    const fallback = process.env.CONTACT_EMAIL?.trim()
    return fallback ? [fallback] : []
  }

  /** replyTo = e-mail klientki (warianty z zamówieniem) – Paulina odpowiada jej wprost. */
  private async sendOwner(
    variant: ShopOwnerNotificationProps['variant'],
    ids: LogIds,
    build: (cfg: MailConfig) => ShopOwnerNotificationProps,
    replyTo?: string
  ): Promise<boolean> {
    const recipients = this.ownerRecipients()
    if (recipients.length === 0) {
      console.warn(`${LOG} No owner recipients (SHOP_OWNER_NOTIFICATION_EMAILS / CONTACT_EMAIL) – not sent`, {
        variant,
        ...ids,
      })
      return false
    }
    return this.send(`owner_${variant}`, ids, recipients, (cfg) => {
      const props = build(cfg)
      return {
        subject: shopOwnerNotificationSubject(props),
        element: ShopOwnerNotification(props),
        replyTo: replyTo ?? null,
      }
    })
  }

  /** Konfiguracja z env; null = wysyłka niemożliwa (produkcja bez SMTP / SITE_URL). */
  private config(kind: string, ids: LogIds): MailConfig | null {
    const user = process.env.SMTP_USER ?? ''
    const pass = process.env.SMTP_PASS ?? ''
    const hasSmtp = !!user && !!pass
    const production = isProductionRuntime()
    const siteUrl = process.env.SITE_URL?.trim().replace(/\/+$/, '')

    if (production && (!hasSmtp || !siteUrl)) {
      console.error(`${LOG} Missing ${!hasSmtp ? 'SMTP credentials' : 'SITE_URL'} in production – e-mail NOT sent`, {
        kind,
        ...ids,
      })
      return null
    }
    return {
      smtp: {
        host: process.env.SMTP_HOST || 'ssl0.ovh.net',
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        user,
        pass,
      },
      isDev: !hasSmtp,
      siteUrl: siteUrl || DEV_SITE_URL,
      replyTo: process.env.CONTACT_EMAIL?.trim() || undefined,
    }
  }

  private async send(
    kind: string,
    ids: LogIds,
    to: string[],
    build: (cfg: MailConfig) => {
      subject: string
      element: ReactElement
      attachments?: ShopEmailAttachment[]
      replyTo?: string | null // undefined = CONTACT_EMAIL (maile do klientek), null = bez Reply-To
    }
  ): Promise<boolean> {
    try {
      const cfg = this.config(kind, ids)
      if (!cfg) return false

      const { subject, element, attachments, replyTo: explicitReplyTo } = build(cfg)
      const replyTo = explicitReplyTo === undefined ? cfg.replyTo : explicitReplyTo || undefined
      const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
      await sendShopEmail({ to, subject, html, text, ...(replyTo && { replyTo }), attachments }, cfg.smtp, cfg.isDev)
      console.log(`${LOG} E-mail ${cfg.isDev ? 'logged (dev mode)' : 'sent'}`, { kind, ...ids })
      return true
    } catch (error) {
      console.error(`${LOG} Error sending e-mail`, { kind, ...ids, ...errorLog(error) })
      return false
    }
  }
}
