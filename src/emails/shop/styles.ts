// Style maili sklepu – zgodne z designem "Naturalna Harmonia" (jak PzkPurchaseConfirmation)

const colors = {
  primary: '#4A7C59',
  accent: '#F4A460',
  neutralDark: '#2C3E3A',
  neutralLight: '#F9F6F3',
  muted: '#8898aa',
  border: '#e6e6e6',
}

export const main = {
  backgroundColor: colors.neutralLight,
  fontFamily:
    '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif',
  padding: '20px',
}

export const container = {
  margin: '0 auto',
  maxWidth: '600px',
}

export const box = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '40px 32px',
  boxShadow: '0 2px 8px rgba(44, 62, 58, 0.1)',
}

export const heading = {
  color: colors.primary,
  fontSize: '26px',
  fontWeight: 'bold',
  lineHeight: '32px',
  margin: '0 0 24px 0',
  fontFamily: '"Montserrat", sans-serif',
}

export const subheading = {
  color: colors.neutralDark,
  fontSize: '18px',
  fontWeight: 'bold',
  lineHeight: '24px',
  margin: '24px 0 12px 0',
  fontFamily: '"Montserrat", sans-serif',
}

export const paragraph = {
  color: colors.neutralDark,
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

export const small = {
  color: colors.neutralDark,
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 8px 0',
}

export const note = {
  color: colors.muted,
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0 0 16px 0',
}

export const link = {
  color: colors.primary,
  textDecoration: 'underline',
}

export const highlightBox = {
  backgroundColor: colors.neutralLight,
  borderLeft: `4px solid ${colors.primary}`,
  padding: '16px 20px',
  margin: '24px 0',
  borderRadius: '8px',
}

export const alertBox = {
  backgroundColor: '#FFF6EC',
  borderLeft: `4px solid ${colors.accent}`,
  padding: '16px 20px',
  margin: '24px 0',
  borderRadius: '8px',
}

export const contractBox = {
  border: `1px solid ${colors.border}`,
  padding: '16px 20px',
  margin: '24px 0',
  borderRadius: '8px',
}

export const itemRow = {
  color: colors.neutralDark,
  fontSize: '15px',
  lineHeight: '22px',
  margin: '0 0 4px 0',
}

export const totalRow = {
  color: colors.neutralDark,
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: '24px',
  margin: '8px 0 0 0',
}

export const button = {
  backgroundColor: colors.primary,
  borderRadius: '8px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 'bold',
  padding: '14px 32px',
  textDecoration: 'none',
  textAlign: 'center' as const,
  margin: '8px 0 16px 0',
}

export const buttonSecondary = {
  ...button,
  backgroundColor: '#ffffff',
  color: colors.primary,
  border: `2px solid ${colors.primary}`,
  padding: '12px 28px',
}

export const hr = {
  borderColor: colors.border,
  margin: '32px 0',
}

export const footer = {
  color: colors.muted,
  fontSize: '14px',
  lineHeight: '22px',
  margin: '0',
}

export const quote = {
  color: colors.neutralDark,
  fontSize: '14px',
  lineHeight: '20px',
  fontStyle: 'italic',
  margin: '0 0 8px 0',
}
