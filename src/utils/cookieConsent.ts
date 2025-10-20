// Cookie Consent Management Utilities

export interface CookieConsent {
  necessary: boolean; // always true
  analytics: boolean;
  marketing: boolean;
  timestamp?: number;
}

const COOKIE_NAME = 'cookieConsent';
const COOKIE_EXPIRY_DAYS = 365;

/**
 * Get cookie consent preferences from browser cookie
 */
export function getCookieConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null;

  const cookieValue = document.cookie
    .split('; ')
    .find(row => row.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')[1];

  if (!cookieValue) return null;

  try {
    return JSON.parse(decodeURIComponent(cookieValue));
  } catch (e) {
    console.error('Failed to parse cookie consent:', e);
    return null;
  }
}

/**
 * Save cookie consent preferences to browser cookie (365 days expiry)
 */
export function setCookieConsent(consent: CookieConsent): void {
  if (typeof document === 'undefined') return;

  const consentWithTimestamp = {
    ...consent,
    timestamp: Date.now(),
  };

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + COOKIE_EXPIRY_DAYS);

  const cookieValue = encodeURIComponent(JSON.stringify(consentWithTimestamp));
  document.cookie = `${COOKIE_NAME}=${cookieValue}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Check if user has already made a cookie consent choice
 */
export function hasConsent(): boolean {
  return getCookieConsent() !== null;
}

/**
 * Clear cookie consent (for testing or user reset)
 */
export function clearCookieConsent(): void {
  if (typeof document === 'undefined') return;

  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/**
 * Default consent values
 */
export const DEFAULT_CONSENT: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
};

/**
 * Accept all cookies
 */
export const ACCEPT_ALL_CONSENT: CookieConsent = {
  necessary: true,
  analytics: true,
  marketing: true,
};

/**
 * Reject optional cookies (only necessary)
 */
export const REJECT_OPTIONAL_CONSENT: CookieConsent = {
  necessary: true,
  analytics: false,
  marketing: false,
};
