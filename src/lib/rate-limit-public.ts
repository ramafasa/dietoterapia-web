/**
 * IP-based rate limiting for public endpoints (contact forms)
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

// In-memory storage
const ipRateLimits = new Map<string, RateLimitEntry>()
const emailRateLimits = new Map<string, EmailRateLimitEntry>()

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

  if (import.meta.env.DEV) {
    console.log(`[Rate Limit GC] Cleaned up expired entries. Current: ${ipRateLimits.size} IPs, ${emailRateLimits.size} emails`)
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
 * Get current rate limit stats (for testing/debugging)
 */
export function getRateLimitStats() {
  return {
    ipCount: ipRateLimits.size,
    emailCount: emailRateLimits.size,
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
}
