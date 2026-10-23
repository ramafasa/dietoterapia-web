/**
 * IP-based rate limiting for public endpoints (contact forms, shop cart quote, shop orders)
 * Uses in-memory storage (Map) for simplicity
 * Limits reset on server restart
 */

interface RateLimitEntry {
  count: number
  firstAttempt: Date
  lastAttempt: Date
}

interface EmailRateLimitEntry {
  count: number
  firstAttempt: Date
}

const MAX_REQUESTS_PER_IP = 5
const MAX_EMAILS_PER_ADDRESS = 2
const WINDOW_DURATION_MS = 60 * 60 * 1000 // 1 hour

// Sklep (wycena koszyka itp.) – osobny, luźniejszy licznik: UI odpytuje przy każdym wejściu na koszyk
const MAX_SHOP_REQUESTS_PER_IP = 60
const SHOP_WINDOW_DURATION_MS = 10 * 60 * 1000 // 10 minutes

// Sklep – status zamówienia dla strony sukcesu (GET /api/sklep/orders/[id]/status): własny licznik,
// żeby odpytywanie (3 s × 60 s = 21 żądań na wejście) i odświeżenia nie zużywały limitu wyceny koszyka
const MAX_SHOP_STATUS_REQUESTS_PER_IP = 120
const SHOP_STATUS_WINDOW_DURATION_MS = 10 * 60 * 1000 // 10 minutes

// Sklep – tworzenie zamówień (POST /api/sklep/orders): osobny, ostrzejszy licznik
const MAX_SHOP_ORDERS_PER_IP = 10
const SHOP_ORDER_WINDOW_DURATION_MS = 60 * 60 * 1000 // 1 hour

// Sklep – własne liczniki per e-mail (niezależne od formularzy kontaktowych i od siebie nawzajem):
// „Wyślij link ponownie” to jedyna droga odzyskania linków, więc przycisk „Załóż konto” jej nie zużywa
const MAX_SHOP_RESEND_EMAILS_PER_ADDRESS = 3
const MAX_SHOP_ACCOUNT_LINK_EMAILS_PER_ADDRESS = 2
const SHOP_EMAIL_WINDOW_DURATION_MS = 60 * 60 * 1000 // 1 hour

// In-memory storage
const ipRateLimits = new Map<string, RateLimitEntry>()
const emailRateLimits = new Map<string, EmailRateLimitEntry>()
const shopIpRateLimits = new Map<string, RateLimitEntry>()
const shopOrderIpRateLimits = new Map<string, RateLimitEntry>()
const shopStatusIpRateLimits = new Map<string, RateLimitEntry>()
const shopResendEmailLimits = new Map<string, EmailRateLimitEntry>()
const shopAccountLinkEmailLimits = new Map<string, EmailRateLimitEntry>()

/**
 * Garbage collection: Clean up expired entries every 10 minutes
 */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000
setInterval(() => {
  const now = Date.now()

  // Clean IP limits
  for (const [ip, entry] of ipRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
      ipRateLimits.delete(ip)
    }
  }

  // Clean email limits
  for (const [email, entry] of emailRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
      emailRateLimits.delete(email)
    }
  }

  // Clean shop IP limits
  for (const [ip, entry] of shopIpRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > SHOP_WINDOW_DURATION_MS) {
      shopIpRateLimits.delete(ip)
    }
  }

  // Clean shop order-status IP limits
  for (const [ip, entry] of shopStatusIpRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > SHOP_STATUS_WINDOW_DURATION_MS) {
      shopStatusIpRateLimits.delete(ip)
    }
  }

  // Clean shop order IP limits
  for (const [ip, entry] of shopOrderIpRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > SHOP_ORDER_WINDOW_DURATION_MS) {
      shopOrderIpRateLimits.delete(ip)
    }
  }

  // Clean shop e-mail limits
  for (const map of [shopResendEmailLimits, shopAccountLinkEmailLimits]) {
    for (const [email, entry] of map.entries()) {
      if (now - entry.firstAttempt.getTime() > SHOP_EMAIL_WINDOW_DURATION_MS) {
        map.delete(email)
      }
    }
  }

  if (import.meta.env.DEV) {
    console.log(`[Rate Limit GC] Cleaned up expired entries. Current: ${ipRateLimits.size} IPs, ${emailRateLimits.size} emails, ${shopIpRateLimits.size} shop IPs, ${shopOrderIpRateLimits.size} shop order IPs`)
  }
}, CLEANUP_INTERVAL_MS)

/**
 * Check if IP address is within rate limit
 */
export function checkPublicRateLimit(ip: string): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const entry = ipRateLimits.get(ip)
  const now = Date.now()

  // No previous attempts or window expired
  if (!entry || now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    return { allowed: true, remaining: MAX_REQUESTS_PER_IP - 1 }
  }

  // Within window
  if (entry.count >= MAX_REQUESTS_PER_IP) {
    const windowEnd = entry.firstAttempt.getTime() + WINDOW_DURATION_MS
    const retryAfterMs = windowEnd - now
    const retryAfterMinutes = Math.ceil(retryAfterMs / 60000)

    return {
      allowed: false,
      retryAfter: retryAfterMinutes
    }
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_IP - entry.count - 1
  }
}

/**
 * Record a request from an IP address
 */
export function recordPublicRequest(ip: string): void {
  const entry = ipRateLimits.get(ip)
  const now = new Date()

  if (!entry || now.getTime() - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    // First request or new window
    ipRateLimits.set(ip, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    // Increment counter
    entry.count++
    entry.lastAttempt = now
  }
}

/**
 * Check if email address is within rate limit for confirmation emails
 */
export function checkEmailRateLimit(email: string): { allowed: boolean; retryAfter?: number } {
  const normalizedEmail = email.toLowerCase().trim()
  const entry = emailRateLimits.get(normalizedEmail)
  const now = Date.now()

  // No previous attempts or window expired
  if (!entry || now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    return { allowed: true }
  }

  // Within window
  if (entry.count >= MAX_EMAILS_PER_ADDRESS) {
    const windowEnd = entry.firstAttempt.getTime() + WINDOW_DURATION_MS
    const retryAfterMs = windowEnd - now
    const retryAfterMinutes = Math.ceil(retryAfterMs / 60000)

    return {
      allowed: false,
      retryAfter: retryAfterMinutes
    }
  }

  return { allowed: true }
}

/**
 * Record a confirmation email sent to an address
 */
export function recordEmailSent(email: string): void {
  const normalizedEmail = email.toLowerCase().trim()
  const entry = emailRateLimits.get(normalizedEmail)
  const now = new Date()

  if (!entry || now.getTime() - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    // First email or new window
    emailRateLimits.set(normalizedEmail, {
      count: 1,
      firstAttempt: now,
    })
  } else {
    // Increment counter
    entry.count++
  }
}

/**
 * Check if IP address is within the shop rate limit (60 requests / 10 minutes)
 * Separate from checkPublicRateLimit (contact forms) – counters don't affect each other.
 *
 * @returns retryAfterSeconds (for the Retry-After header) when blocked
 */
export function checkShopRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number; remaining?: number } {
  const entry = shopIpRateLimits.get(ip)
  const now = Date.now()

  // No previous attempts or window expired
  if (!entry || now - entry.firstAttempt.getTime() > SHOP_WINDOW_DURATION_MS) {
    return { allowed: true, remaining: MAX_SHOP_REQUESTS_PER_IP - 1 }
  }

  // Within window
  if (entry.count >= MAX_SHOP_REQUESTS_PER_IP) {
    const windowEnd = entry.firstAttempt.getTime() + SHOP_WINDOW_DURATION_MS
    const retryAfterSeconds = Math.max(1, Math.ceil((windowEnd - now) / 1000))

    return {
      allowed: false,
      retryAfterSeconds,
    }
  }

  return {
    allowed: true,
    remaining: MAX_SHOP_REQUESTS_PER_IP - entry.count - 1,
  }
}

/**
 * Record a shop request from an IP address
 */
export function recordShopRequest(ip: string): void {
  const entry = shopIpRateLimits.get(ip)
  const now = new Date()

  if (!entry || now.getTime() - entry.firstAttempt.getTime() > SHOP_WINDOW_DURATION_MS) {
    // First request or new window
    shopIpRateLimits.set(ip, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    // Increment counter
    entry.count++
    entry.lastAttempt = now
  }
}

/**
 * Status zamówienia (strona sukcesu): 120 żądań / 10 min / IP. Osobny licznik – nie wpływa na
 * checkShopRateLimit (wycena koszyka) ani nie jest przez niego zużywany.
 */
export function checkShopStatusRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number; remaining?: number } {
  const entry = shopStatusIpRateLimits.get(ip)
  const now = Date.now()
  if (!entry || now - entry.firstAttempt.getTime() > SHOP_STATUS_WINDOW_DURATION_MS) {
    return { allowed: true, remaining: MAX_SHOP_STATUS_REQUESTS_PER_IP - 1 }
  }
  if (entry.count >= MAX_SHOP_STATUS_REQUESTS_PER_IP) {
    const windowEnd = entry.firstAttempt.getTime() + SHOP_STATUS_WINDOW_DURATION_MS
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)) }
  }
  return { allowed: true, remaining: MAX_SHOP_STATUS_REQUESTS_PER_IP - entry.count - 1 }
}

export function recordShopStatusRequest(ip: string): void {
  const entry = shopStatusIpRateLimits.get(ip)
  const now = new Date()
  if (!entry || now.getTime() - entry.firstAttempt.getTime() > SHOP_STATUS_WINDOW_DURATION_MS) {
    shopStatusIpRateLimits.set(ip, { count: 1, firstAttempt: now, lastAttempt: now })
  } else {
    entry.count++
    entry.lastAttempt = now
  }
}

/**
 * Check if IP address is within the shop order limit (10 orders / hour)
 * Separate from checkShopRateLimit (cart quote) – counters don't affect each other.
 *
 * @returns retryAfterSeconds (for the Retry-After header) when blocked
 */
export function checkShopOrderRateLimit(ip: string): { allowed: boolean; retryAfterSeconds?: number; remaining?: number } {
  const entry = shopOrderIpRateLimits.get(ip)
  const now = Date.now()

  if (!entry || now - entry.firstAttempt.getTime() > SHOP_ORDER_WINDOW_DURATION_MS) {
    return { allowed: true, remaining: MAX_SHOP_ORDERS_PER_IP - 1 }
  }

  if (entry.count >= MAX_SHOP_ORDERS_PER_IP) {
    const windowEnd = entry.firstAttempt.getTime() + SHOP_ORDER_WINDOW_DURATION_MS
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)),
    }
  }

  return {
    allowed: true,
    remaining: MAX_SHOP_ORDERS_PER_IP - entry.count - 1,
  }
}

/**
 * Record a shop order attempt from an IP address
 */
export function recordShopOrderRequest(ip: string): void {
  const entry = shopOrderIpRateLimits.get(ip)
  const now = new Date()

  if (!entry || now.getTime() - entry.firstAttempt.getTime() > SHOP_ORDER_WINDOW_DURATION_MS) {
    shopOrderIpRateLimits.set(ip, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    entry.count++
    entry.lastAttempt = now
  }
}

/** Licznik per e-mail (bez wielkości liter) w oknie SHOP_EMAIL_WINDOW_DURATION_MS. */
function checkShopEmailBucket(
  map: Map<string, EmailRateLimitEntry>,
  max: number,
  email: string
): { allowed: boolean; retryAfterSeconds?: number } {
  const entry = map.get(email.toLowerCase().trim())
  const now = Date.now()
  if (!entry || now - entry.firstAttempt.getTime() > SHOP_EMAIL_WINDOW_DURATION_MS) return { allowed: true }
  if (entry.count >= max) {
    const windowEnd = entry.firstAttempt.getTime() + SHOP_EMAIL_WINDOW_DURATION_MS
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - now) / 1000)) }
  }
  return { allowed: true }
}

function recordShopEmailBucket(map: Map<string, EmailRateLimitEntry>, email: string): void {
  const key = email.toLowerCase().trim()
  const entry = map.get(key)
  const now = new Date()
  if (!entry || now.getTime() - entry.firstAttempt.getTime() > SHOP_EMAIL_WINDOW_DURATION_MS) {
    map.set(key, { count: 1, firstAttempt: now })
  } else {
    entry.count++
  }
}

/**
 * „Wyślij link ponownie” (POST /api/sklep/resend-link): 3 / godzinę na adres.
 * Osobny licznik – nie dzieli limitu z formularzami kontaktowymi ani z przyciskiem „Załóż konto”.
 */
export function checkShopResendEmailLimit(email: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkShopEmailBucket(shopResendEmailLimits, MAX_SHOP_RESEND_EMAILS_PER_ADDRESS, email)
}

export function recordShopResendEmail(email: string): void {
  recordShopEmailBucket(shopResendEmailLimits, email)
}

/**
 * Przycisk „Załóż konto” na stronie pobierania (POST /api/sklep/pobierz/[token]/account-link):
 * 2 / godzinę na adres. Osobny licznik od „Wyślij link ponownie”.
 */
export function checkShopAccountLinkEmailLimit(email: string): { allowed: boolean; retryAfterSeconds?: number } {
  return checkShopEmailBucket(shopAccountLinkEmailLimits, MAX_SHOP_ACCOUNT_LINK_EMAILS_PER_ADDRESS, email)
}

export function recordShopAccountLinkEmail(email: string): void {
  recordShopEmailBucket(shopAccountLinkEmailLimits, email)
}

/**
 * Get current rate limit stats (for testing/debugging)
 */
export function getRateLimitStats() {
  return {
    ipCount: ipRateLimits.size,
    emailCount: emailRateLimits.size,
    shopIpCount: shopIpRateLimits.size,
    shopOrderIpCount: shopOrderIpRateLimits.size,
    shopStatusIpCount: shopStatusIpRateLimits.size,
    shopResendEmailCount: shopResendEmailLimits.size,
    shopAccountLinkEmailCount: shopAccountLinkEmailLimits.size,
    maxRequestsPerIp: MAX_REQUESTS_PER_IP,
    maxEmailsPerAddress: MAX_EMAILS_PER_ADDRESS,
    windowDurationMinutes: WINDOW_DURATION_MS / 60000,
  }
}

/**
 * Clear all rate limits (for testing only)
 */
export function clearRateLimits(): void {
  ipRateLimits.clear()
  emailRateLimits.clear()
  shopIpRateLimits.clear()
  shopOrderIpRateLimits.clear()
  shopStatusIpRateLimits.clear()
  shopResendEmailLimits.clear()
  shopAccountLinkEmailLimits.clear()
}
