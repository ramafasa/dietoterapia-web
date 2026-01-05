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
  moduleNumber: 1 | 2 | 3,
  expiresAt: Date,
  smtpConfig: SMTPConfig,
  isDev: boolean = false
) {
  // In development mode, just log and return
  if (isDev) {
    console.log('📧 [DEV MODE] PZK purchase confirmation email would be sent:')
    console.log('  To:', to)
    console.log('  User name:', userName)
    console.log('  Module:', moduleNumber)
    console.log('  Expires at:', expiresAt.toISOString())
    console.log('📧 [DEV MODE] SMTP Config:', {
      host: smtpConfig.host,
      port: smtpConfig.port,
      user: smtpConfig.user,
    })
    return
  }

  const moduleName = `Moduł ${moduleNumber}`
  const expiresAtFormatted = format(expiresAt, 'd MMMM yyyy', { locale: pl })
  const catalogUrl = process.env.SITE_URL
    ? `${process.env.SITE_URL}/pacjent/pzk/katalog`
    : 'https://paulinamaciak.pl/pacjent/pzk/katalog'

  const html = await render(
    PzkPurchaseConfirmation({
      userName,
      moduleName,
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
