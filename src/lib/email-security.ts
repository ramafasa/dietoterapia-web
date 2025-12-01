/**
 * Email security utilities
 * - HTML sanitization for email content
 * - Email validation (disposable domains check)
 */

// Common disposable email domains to block
const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com',
  'guerrillamail.com',
  '10minutemail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'trashmail.com',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamail.info',
  'grr.la',
  'spam4.me',
  'maildrop.cc',
]

/**
 * Sanitize HTML content for email
 * Removes all HTML tags and escapes special characters
 * This is strict sanitization for maximum security
 *
 * @param content - User-provided content
 * @returns Sanitized content safe for HTML email
 */
export function sanitizeEmailContent(content: string): string {
  if (!content) return ''

  // Remove all HTML tags
  let sanitized = content.replace(/<[^>]*>/g, '')

  // Escape HTML special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Preserve line breaks (convert \n to <br> for HTML email)
  sanitized = sanitized.replace(/\n/g, '<br>')

  return sanitized.trim()
}

/**
 * Validate email recipient address
 * Checks for:
 * - Basic email format (already validated by Zod)
 * - Disposable email domains
 * - Suspicious patterns
 *
 * @param email - Email address to validate
 * @returns true if email is valid and safe
 */
export function validateEmailRecipient(email: string): boolean {
  if (!email) return false

  const normalizedEmail = email.toLowerCase().trim()

  // Check basic format (must have @ and parts on both sides)
  const parts = normalizedEmail.split('@')
  if (parts.length !== 2) return false

  const localPart = parts[0]
  const domain = parts[1]

  if (!localPart || !domain) return false

  // Check against disposable domains
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    console.warn(`Blocked disposable email domain: ${domain}`)
    return false
  }

  // Check for suspicious patterns
  // 1. Multiple dots in a row
  if (normalizedEmail.includes('..')) {
    return false
  }

  // 2. Starts or ends with dot (use existing localPart variable)
  if (localPart.startsWith('.') || localPart.endsWith('.')) {
    return false
  }

  // 3. Domain must have at least one dot (TLD)
  if (!domain.includes('.')) {
    return false
  }

  // 4. TLD should be 2+ characters
  const tld = domain.split('.').pop()
  if (!tld || tld.length < 2) {
    return false
  }

  return true
}

/**
 * Sanitize name for email display
 * Removes HTML and special characters that could be exploited
 *
 * @param name - User's name
 * @returns Sanitized name
 */
export function sanitizeName(name: string): string {
  if (!name) return ''

  // Remove HTML tags
  let sanitized = name.replace(/<[^>]*>/g, '')

  // Escape HTML special characters
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Remove potentially dangerous characters
  sanitized = sanitized.replace(/[<>{}[\]\\]/g, '')

  return sanitized.trim()
}

/**
 * Sanitize phone number for display
 *
 * @param phone - Phone number
 * @returns Sanitized phone number
 */
export function sanitizePhone(phone: string): string {
  if (!phone) return ''

  // Remove all non-digit and non-plus characters
  let sanitized = phone.replace(/[^\d+\s-]/g, '')

  return sanitized.trim()
}

/**
 * Check if email domain is suspicious
 * Returns a risk score (0-1, higher = more suspicious)
 *
 * @param email - Email address
 * @returns Risk score (0 = safe, 1 = highly suspicious)
 */
export function getEmailRiskScore(email: string): number {
  const normalizedEmail = email.toLowerCase().trim()
  let score = 0

  // Check for disposable domains (high risk)
  const domain = normalizedEmail.split('@')[1]
  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    score += 0.8
  }

  // Check for suspicious patterns
  // 1. Many numbers in local part (moderate risk)
  const localPart = normalizedEmail.split('@')[0]
  const digitCount = (localPart.match(/\d/g) || []).length
  if (digitCount > localPart.length * 0.5) {
    score += 0.2
  }

  // 2. Very long local part (low risk)
  if (localPart.length > 30) {
    score += 0.1
  }

  // 3. Multiple consecutive numbers (low risk)
  if (/\d{6,}/.test(localPart)) {
    score += 0.15
  }

  return Math.min(score, 1.0)
}

/**
 * Sanitize all form data for email
 *
 * @param data - Form data object
 * @returns Sanitized data object
 */
export function sanitizeFormData<T extends Record<string, any>>(data: T): T {
  const sanitized = { ...data }

  for (const key in sanitized) {
    const value = sanitized[key]

    if (typeof value === 'string') {
      // Sanitize based on field name
      if (key === 'email') {
        // Email already validated, just trim
        sanitized[key] = value.toLowerCase().trim() as any
      } else if (key === 'phone') {
        sanitized[key] = sanitizePhone(value) as any
      } else if (key.includes('name') || key.includes('Name')) {
        sanitized[key] = sanitizeName(value) as any
      } else if (key === 'message' || key.includes('Info') || key.includes('Date')) {
        sanitized[key] = sanitizeEmailContent(value) as any
      } else {
        // Default: sanitize as text
        sanitized[key] = sanitizeEmailContent(value) as any
      }
    }
  }

  return sanitized
}
