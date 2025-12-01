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

interface InvitationEmailProps {
  inviteLink: string
  dietitianName?: string
}

export default function InvitationEmail({ inviteLink, dietitianName }: InvitationEmailProps) {
  const greeting = dietitianName
    ? `Dietetyk ${dietitianName} zaprasza Cię do współpracy`
    : 'Zostałeś/aś zaproszony/a do aplikacji Dietoterapia'

  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            <Text style={heading}>Zaproszenie do aplikacji</Text>
            <Text style={paragraph}>Witaj!</Text>
            <Text style={paragraph}>
              {greeting} w aplikacji do monitorowania postępów terapii żywieniowej.
            </Text>
            <Text style={paragraph}>
              Aplikacja umożliwia proste śledzenie Twojej wagi oraz współpracę z dietetykiem.
              Kliknij poniższy przycisk, aby założyć konto i rozpocząć.
            </Text>
            <Text style={paragraph}>
              Link jest ważny przez 7 dni.
            </Text>
            <Button style={button} href={inviteLink}>
              Utwórz konto
            </Button>
            <Text style={note}>
              Jeśli nie spodziewałeś/aś się tej wiadomości, po prostu ją zignoruj.
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

// Styles - zgodne z designem "Naturalna Harmonia"
const main = {
  backgroundColor: '#F9F6F3', // neutral-light
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
}

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '600px',
}

const box = {
  padding: '48px',
  backgroundColor: '#ffffff',
  borderRadius: '8px',
}

const heading = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#2C3E3A', // neutral-dark
  marginBottom: '32px',
}

const paragraph = {
  fontSize: '16px',
  lineHeight: '26px',
  color: '#2C3E3A', // neutral-dark
  marginBottom: '16px',
}

const button = {
  backgroundColor: '#4A7C59', // primary
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 24px',
  margin: '24px 0',
}

const note = {
  fontSize: '14px',
  lineHeight: '24px',
  color: '#666666',
  marginTop: '24px',
}

const hr = {
  borderColor: '#E8B4A8', // secondary
  margin: '32px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '14px',
  lineHeight: '24px',
}
