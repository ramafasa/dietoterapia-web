/**
 * PZK Purchase Confirmation Email Template
 *
 * Sent after successful payment for PZK module.
 * Includes module info, access period, and link to catalog.
 */

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

interface PzkPurchaseConfirmationProps {
  userName: string // First name or email
  moduleName: string // e.g., "Moduł 1"
  moduleNumber: 1 | 2 | 3
  expiresAt: string // Formatted date (e.g., "1 stycznia 2027")
  catalogUrl: string // Link to PZK catalog
}

export default function PzkPurchaseConfirmation({
  userName = 'Użytkowniku',
  moduleName = 'Moduł 1',
  moduleNumber = 1,
  expiresAt = '1 stycznia 2027',
  catalogUrl = 'https://paulinamaciak.pl/pacjent/pzk/katalog',
}: PzkPurchaseConfirmationProps) {
  return (
    <Html>
      <Head />
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            {/* Header */}
            <Text style={heading}>Dziękujemy za zakup!</Text>

            {/* Greeting */}
            <Text style={paragraph}>Witaj {userName},</Text>

            {/* Main Message */}
            <Text style={paragraph}>
              Dziękujemy za zakup dostępu do <strong>{moduleName}</strong> w
              programie Przestrzeń Zdrowej Kobiety (PZK).
            </Text>

            {/* Access Info Box */}
            <Section style={highlightBox}>
              <Text style={highlightText}>
                ✅ Dostęp aktywny do: <strong>{expiresAt}</strong>
              </Text>
              <Text style={highlightText}>
                📚 {moduleName} - materiały PDF i wideo
              </Text>
            </Section>

            {/* Benefits */}
            <Text style={paragraph}>
              Możesz już korzystać z:
            </Text>
            <Text style={list}>
              • Materiałów edukacyjnych w formacie PDF<br />
              • Filmów instruktażowych<br />
              • Możliwości tworzenia własnych notatek<br />
              • Dostępu bez ograniczeń czasowych do {expiresAt}
            </Text>

            {/* CTA Button */}
            <Button style={button} href={catalogUrl}>
              Przejdź do katalogu PZK
            </Button>

            {/* Additional Info */}
            <Text style={note}>
              Materiały są dostępne online w Twojej strefie pacjenta. Możesz do
              nich wracać kiedy tylko chcesz przez cały okres dostępu.
            </Text>

            {/* Footer */}
            <Hr style={hr} />
            <Text style={footer}>
              Pozdrawiam,<br />
              <strong>Paulina Maciak</strong><br />
              Dietetyk Kliniczny<br />
              <br />
              https://paulinamaciak.pl<br />
              dietoterapia@paulinamaciak.pl
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

// ===== STYLES - zgodne z designem "Naturalna Harmonia" =====

const main = {
  backgroundColor: '#F9F6F3', // neutral-light
  fontFamily:
    '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
  padding: '20px',
}

const container = {
  margin: '0 auto',
  maxWidth: '600px',
}

const box = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '40px 32px',
  boxShadow: '0 2px 8px rgba(44, 62, 58, 0.1)',
}

const heading = {
  color: '#4A7C59', // primary
  fontSize: '28px',
  fontWeight: 'bold',
  margin: '0 0 24px 0',
  fontFamily: '"Montserrat", sans-serif',
}

const paragraph = {
  color: '#2C3E3A', // neutral-dark
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

const list = {
  color: '#2C3E3A',
  fontSize: '15px',
  lineHeight: '22px',
  margin: '0 0 24px 0',
}

const highlightBox = {
  backgroundColor: '#F9F6F3', // neutral-light
  borderLeft: '4px solid #4A7C59', // primary
  padding: '16px 20px',
  margin: '24px 0',
  borderRadius: '8px',
}

const highlightText = {
  color: '#2C3E3A',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 8px 0',
}

const button = {
  backgroundColor: '#4A7C59', // primary
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '14px 32px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  margin: '24px 0',
}

const note = {
  color: '#8898aa', // gray
  fontSize: '14px',
  lineHeight: '20px',
  margin: '16px 0 0 0',
}

const hr = {
  borderColor: '#e6e6e6',
  margin: '32px 0',
}

const footer = {
  color: '#8898aa',
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
}
