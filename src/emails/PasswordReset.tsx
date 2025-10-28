import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Hr,
} from '@react-email/components'

interface PasswordResetEmailProps {
  resetLink: string
  firstName: string
}

export default function PasswordResetEmail({ resetLink, firstName }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            <Text style={heading}>Reset hasła</Text>
            <Text style={paragraph}>Cześć {firstName},</Text>
            <Text style={paragraph}>
              Otrzymaliśmy prośbę o zresetowanie hasła do Twojego konta w aplikacji Dietoterapia.
            </Text>
            <Text style={paragraph}>
              Kliknij poniższy przycisk, aby ustawić nowe hasło. Link jest ważny przez 60 minut.
            </Text>
            <Button style={button} href={resetLink}>
              Zresetuj hasło
            </Button>
            <Text style={paragraph}>
              Jeśli nie prosiłeś/aś o reset hasła, zignoruj tę wiadomość.
            </Text>
            <Hr style={hr} />
            <Text style={footer}>
              Dietoterapia - Paulina Maciak<br />
              https://paulinamaciak.pl
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const main = {
  backgroundColor: '#F9F6F3',
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
}

const box = {
  padding: '48px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#2C3E3A',
  marginBottom: '32px',
}

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#2C3E3A',
}

const button = {
  backgroundColor: '#4A7C59',
  borderRadius: '8px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
  margin: '24px 0',
}

const hr = {
  borderColor: '#E8B4A8',
  margin: '32px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '14px',
  lineHeight: '24px',
}
