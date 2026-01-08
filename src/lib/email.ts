import nodemailer from 'nodemailer'
import { render } from '@react-email/components'
import PasswordResetEmail from '@/emails/PasswordReset'
import InvitationEmail from '@/emails/Invitation'
import PzkPurchaseConfirmation from '@/emails/PzkPurchaseConfirmation'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'

export type SMTPConfig = {
  host: string
  port: number
  user: string
  pass: string
}

export type PzkPurchaseNotificationParams = {
  payerEmail: string
  payerName: string | null
  item: string
  amount: string
  purchasedAt: Date
  status: 'success' | 'failed'
  transactionId: string
  tpayTransactionId: string | null
}

function createTransporter(config: SMTPConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: true,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  })
}

export async function sendPasswordResetEmail(
  to: string,
  resetLink: string,
  firstName: string,
  smtpConfig: SMTPConfig,
  isDev: boolean = false
) {
  // In development mode, just log and return
  if (isDev) {
    console.log('📧 [DEV MODE] Password reset email would be sent:')
    console.log('  To:', to)
    console.log('  Reset link:', resetLink)
    console.log('  First name:', firstName)
    console.log('📧 [DEV MODE] SMTP Config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
    })
    return
  }

  const html = await render(PasswordResetEmail({ resetLink, firstName }))
  const transporter = createTransporter(smtpConfig)

  await transporter.sendMail({
    from: `"Dietoterapia - Paulina Maciak" <${smtpConfig.user}>`,
    to,
    subject: 'Reset hasła - Dietoterapia',
    html,
  })
}

export async function sendInvitationEmail(
  to: string,
  inviteLink: string,
  dietitianName: string | undefined,
  smtpConfig: SMTPConfig,
  isDev: boolean = false
) {
  // In development mode, just log and return
  if (isDev) {
    console.log('📧 [DEV MODE] Invitation email would be sent:')
    console.log('  To:', to)
    console.log('  Invite link:', inviteLink)
    console.log('  Dietitian name:', dietitianName || '(not provided)')
    console.log('📧 [DEV MODE] SMTP Config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
    })
    return
  }

  const html = await render(InvitationEmail({ inviteLink, dietitianName }))
  const transporter = createTransporter(smtpConfig)

  await transporter.sendMail({
    from: `"Dietoterapia - Paulina Maciak" <${smtpConfig.user}>`,
    to,
    subject: 'Zaproszenie do aplikacji Dietoterapia',
    html,
  })
}

export async function sendPzkPurchaseConfirmationEmail(
  to: string,
  userName: string,
  moduleNumberOrProduct: 1 | 2 | 3 | { productName: string; moduleNumber?: 1 | 2 | 3 },
  expiresAt: Date,
  smtpConfig: SMTPConfig,
  isDev: boolean = false
) {
  const { productName, moduleNumber } =
    typeof moduleNumberOrProduct === 'number'
      ? { productName: `Moduł ${moduleNumberOrProduct}`, moduleNumber: moduleNumberOrProduct }
      : {
          productName: moduleNumberOrProduct.productName,
          moduleNumber: moduleNumberOrProduct.moduleNumber ?? 1,
        }

  // In development mode, just log and return
  if (isDev) {
    console.log('📧 [DEV MODE] PZK purchase confirmation email would be sent:')
    console.log('  To:', to)
    console.log('  User name:', userName)
    console.log('  Product:', productName)
    console.log('  Module:', moduleNumber)
    console.log('  Expires at:', expiresAt.toISOString())
    console.log('📧 [DEV MODE] SMTP Config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
    })
    return
  }

  const expiresAtFormatted = format(expiresAt, 'd MMMM yyyy', { locale: pl })
  const catalogUrl = process.env.SITE_URL
    ? `${process.env.SITE_URL}/pacjent/pzk/katalog`
    : 'https://paulinamaciak.pl/pacjent/pzk/katalog'

  const html = await render(
    PzkPurchaseConfirmation({
      userName,
      moduleName: productName,
      moduleNumber,
      expiresAt: expiresAtFormatted,
      catalogUrl,
    })
  )
  const transporter = createTransporter(smtpConfig)

  await transporter.sendMail({
    from: `"Dietoterapia - Paulina Maciak" <${smtpConfig.user}>`,
    to,
    subject: 'Potwierdzenie zakupu - Przestrzeń Zdrowej Kobiety',
    html,
  })
}

export async function sendPzkPurchaseNotificationEmail(
  purchaseDetails: PzkPurchaseNotificationParams,
  smtpConfig: SMTPConfig,
  isDev: boolean = false
) {
  // Map item to readable product name
  const getProductName = (item: string): string => {
    switch (item) {
      case 'PZK_MODULE_1':
        return 'Moduł 1'
      case 'PZK_MODULE_2':
        return 'Moduł 2'
      case 'PZK_MODULE_3':
        return 'Moduł 3'
      case 'PZK_BUNDLE_ALL':
        return 'Pakiet - 3 moduły'
      default:
        return item
    }
  }

  const productName = getProductName(purchaseDetails.item)
  const statusText = purchaseDetails.status === 'success' ? 'SUKCES' : 'PORAŻKA'
  const statusLabel = purchaseDetails.status === 'success' ? 'Sukces' : 'Niepowodzenie'

  // Use payer name or email as fallback for subject
  const payerIdentifier = purchaseDetails.payerName || purchaseDetails.payerEmail

  // Format subject
  const subject = purchaseDetails.status === 'success'
    ? `Nowy zakup PZK - ${productName} - ${payerIdentifier}`
    : `Zakup PZK nieudany - ${productName} - ${payerIdentifier}`

  // Format date
  const purchasedAtFormatted = format(purchaseDetails.purchasedAt, 'd MMMM yyyy, HH:mm', { locale: pl })

  // Build email body (plain text with basic HTML formatting)
  const textBody = `
===================================
ZAKUP PZK - ${statusText}
===================================

Email kupującego: ${purchaseDetails.payerEmail}
Imię i nazwisko: ${purchaseDetails.payerName || 'Brak danych'}
Produkt: ${productName}
Cena: ${purchaseDetails.amount} PLN
Data zakupu: ${purchasedAtFormatted}
Status: ${statusLabel}

ID transakcji: ${purchaseDetails.transactionId}
ID Tpay: ${purchaseDetails.tpayTransactionId || 'Brak'}

---
Wiadomość wygenerowana automatycznie przez system Dietoterapia
`.trim()

  const htmlBody = `
<div style="font-family: monospace; white-space: pre-wrap;">
${textBody}
</div>
`.trim()

  // Recipients (hardcoded as per plan)
  const recipients = ['dietoterapia@paulinamaciak.pl', 'rafalmaciak@gmail.com']

  // In development mode, just log and return
  if (isDev) {
    console.log('📧 [DEV MODE] PZK purchase notification would be sent:')
    console.log('  To:', recipients.join(', '))
    console.log('  Subject:', subject)
    console.log('  Body:')
    console.log(textBody)
    console.log('📧 [DEV MODE] SMTP Config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
    })
    return
  }

  const transporter = createTransporter(smtpConfig)

  await transporter.sendMail({
    from: `"Dietoterapia - Paulina Maciak" <${smtpConfig.user}>`,
    to: recipients.join(', '),
    subject,
    text: textBody,
    html: htmlBody,
  })
}
