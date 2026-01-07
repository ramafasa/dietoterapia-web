/**
 * Rate limiting for PZK protected endpoints (presign, download actions)
 * Uses in-memory storage (Map) for MVP - consider Redis/Postgres for production
 * Limits reset on server restart (serverless limitation)
 *
 * Three-layer rate limiting:
 * 1. Per-user: Prevent individual user abuse
 * 2. Per-IP: Prevent IP-based attacks
 * 3. Per user+IP: Combined limit for tighter control
 *
 * MVP configuration:
 * - Window: 1 minute
 * - Per-user: 10 requests/min
 * - Per-IP: 30 requests/min
 * - Per user+IP: 10 requests/min
 */

interface RateLimitEntry {
  count: number
  firstAttempt: Date
  lastAttempt: Date
}

// MVP limits (adjust based on usage patterns)
const MAX_REQUESTS_PER_USER = 10
const MAX_REQUESTS_PER_IP = 30
const MAX_REQUESTS_PER_USER_IP = 10
const WINDOW_DURATION_MS = 60 * 1000 // 1 minute

// In-memory storage (MVP - replace with Redis/Postgres for production)
const userRateLimits = new Map<string, RateLimitEntry>()
const ipRateLimits = new Map<string, RateLimitEntry>()
const userIpRateLimits = new Map<string, RateLimitEntry>()

/**
 * Garbage collection: Clean up expired entries every minute
 */
const CLEANUP_INTERVAL_MS = 60 * 1000
setInterval(() => {
  const now = Date.now()

  // Clean user limits
  for (const [key, entry] of userRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
      userRateLimits.delete(key)
    }
  }

  // Clean IP limits
  for (const [key, entry] of ipRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
      ipRateLimits.delete(key)
    }
  }

  // Clean user+IP limits
  for (const [key, entry] of userIpRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
      userIpRateLimits.delete(key)
    }
  }

  if (import.meta.env.DEV) {
    console.log(
      `[PZK Rate Limit GC] Cleaned up expired entries. Current: ${userRateLimits.size} users, ${ipRateLimits.size} IPs, ${userIpRateLimits.size} user+IPs`
    )
  }
}, CLEANUP_INTERVAL_MS)

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean
  retryAfterSeconds?: number // For 429 response
  limitType?: 'user' | 'ip' | 'user_ip' // Which limit was hit
}

/**
 * Check if request is within rate limits (all three layers)
 *
 * @param userId - User ID from session
 * @param ip - IP address from request (x-forwarded-for or x-real-ip)
 * @returns RateLimitResult with allowed flag and retry info
 *
 * @example
 * const result = checkPzkRateLimit('user-123', '192.168.1.1')
 * if (!result.allowed) {
 *   return 429 with Retry-After header
 * }
 */
export function checkPzkRateLimit(userId: string, ip: string): RateLimitResult {
  const now = Date.now()

  // 1. Check per-user limit
  const userEntry = userRateLimits.get(`user:${userId}`)
  if (userEntry && now - userEntry.firstAttempt.getTime() <= WINDOW_DURATION_MS) {
    if (userEntry.count >= MAX_REQUESTS_PER_USER) {
      const windowEnd = userEntry.firstAttempt.getTime() + WINDOW_DURATION_MS
      const retryAfterMs = windowEnd - now
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

      return {
        allowed: false,
        retryAfterSeconds,
        limitType: 'user',
      }
    }
  }

  // 2. Check per-IP limit
  const ipEntry = ipRateLimits.get(`ip:${ip}`)
  if (ipEntry && now - ipEntry.firstAttempt.getTime() <= WINDOW_DURATION_MS) {
    if (ipEntry.count >= MAX_REQUESTS_PER_IP) {
      const windowEnd = ipEntry.firstAttempt.getTime() + WINDOW_DURATION_MS
      const retryAfterMs = windowEnd - now
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

      return {
        allowed: false,
        retryAfterSeconds,
        limitType: 'ip',
      }
    }
  }

  // 3. Check per user+IP limit
  const userIpEntry = userIpRateLimits.get(`userIp:${userId}:${ip}`)
  if (userIpEntry && now - userIpEntry.firstAttempt.getTime() <= WINDOW_DURATION_MS) {
    if (userIpEntry.count >= MAX_REQUESTS_PER_USER_IP) {
      const windowEnd = userIpEntry.firstAttempt.getTime() + WINDOW_DURATION_MS
      const retryAfterMs = windowEnd - now
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

      return {
        allowed: false,
        retryAfterSeconds,
        limitType: 'user_ip',
      }
    }
  }

  // All limits passed
  return { allowed: true }
}

/**
 * Record a PZK request (increment all three counters)
 *
 * @param userId - User ID from session
 * @param ip - IP address from request
 *
 * @example
 * recordPzkRequest('user-123', '192.168.1.1')
 */
export function recordPzkRequest(userId: string, ip: string): void {
  const now = new Date()

  // Record per-user
  const userKey = `user:${userId}`
  const userEntry = userRateLimits.get(userKey)
  if (!userEntry || now.getTime() - userEntry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    userRateLimits.set(userKey, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    userEntry.count++
    userEntry.lastAttempt = now
  }

  // Record per-IP
  const ipKey = `ip:${ip}`
  const ipEntry = ipRateLimits.get(ipKey)
  if (!ipEntry || now.getTime() - ipEntry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    ipRateLimits.set(ipKey, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    ipEntry.count++
    ipEntry.lastAttempt = now
  }

  // Record per user+IP
  const userIpKey = `userIp:${userId}:${ip}`
  const userIpEntry = userIpRateLimits.get(userIpKey)
  if (!userIpEntry || now.getTime() - userIpEntry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    userIpRateLimits.set(userIpKey, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    userIpEntry.count++
    userIpEntry.lastAttempt = now
  }
}

/**
 * Extract IP address from request headers (Vercel proxy)
 *
 * @param request - Astro request object
 * @returns IP address or 'unknown' fallback
 *
 * @example
 * const ip = getClientIp(request)
 */
export function getClientIp(request: Request): string {
  // Vercel sets x-forwarded-for header
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can be a comma-separated list (client, proxy1, proxy2)
    // Take the first IP (client IP)
    return forwardedFor.split(',')[0].trim()
  }

  // Fallback to x-real-ip
  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp
  }

  // Unknown IP (should rarely happen on Vercel)
  return 'unknown'
}

/**
 * Get current rate limit stats (for testing/debugging)
 */
export function getPzkRateLimitStats() {
  return {
    userCount: userRateLimits.size,
    ipCount: ipRateLimits.size,
    userIpCount: userIpRateLimits.size,
    maxRequestsPerUser: MAX_REQUESTS_PER_USER,
    maxRequestsPerIp: MAX_REQUESTS_PER_IP,
    maxRequestsPerUserIp: MAX_REQUESTS_PER_USER_IP,
    windowDurationSeconds: WINDOW_DURATION_MS / 1000,
  }
}

/**
 * Clear all rate limits (for testing only)
 */
export function clearPzkRateLimits(): void {
  userRateLimits.clear()
  ipRateLimits.clear()
  userIpRateLimits.clear()
}
