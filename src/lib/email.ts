import nodemailer from 'nodemailer'
import { render } from '@react-email/components'
import PasswordResetEmail from '@/emails/PasswordReset'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendPasswordResetEmail(to: string, resetLink: string, firstName: string) {
  const html = await render(PasswordResetEmail({ resetLink, firstName }))

  await transporter.sendMail({
    from: `"Dietoterapia - Paulina Maciak" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Reset hasła - Dietoterapia',
    html,
  })
}
