/**
 * User-based rate limiting for authenticated endpoints
 * Uses in-memory storage (Map) for simplicity
 * Limits reset on server restart
 */

interface UserRateLimitEntry {
  count: number
  firstAttempt: Date
  lastAttempt: Date
}

const MAX_REQUESTS_PER_USER = 5
const WINDOW_DURATION_MS = 60 * 1000 // 1 minute

// In-memory storage
const userRateLimits = new Map<string, UserRateLimitEntry>()

/**
 * Garbage collection: Clean up expired entries every 5 minutes
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()

  for (const [userId, entry] of userRateLimits.entries()) {
    if (now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
      userRateLimits.delete(userId)
    }
  }

  if (import.meta.env.DEV) {
    console.log(`[User Rate Limit GC] Cleaned up expired entries. Current: ${userRateLimits.size} users`)
  }
}, CLEANUP_INTERVAL_MS)

/**
 * Check if user is within rate limit
 *
 * @param userId - User UUID
 * @returns Rate limit status
 */
export function checkUserRateLimit(userId: string): {
  allowed: boolean
  retryAfter?: number
  remaining?: number
} {
  const entry = userRateLimits.get(userId)
  const now = Date.now()

  // No previous attempts or window expired
  if (!entry || now - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    return { allowed: true, remaining: MAX_REQUESTS_PER_USER - 1 }
  }

  // Within window
  if (entry.count >= MAX_REQUESTS_PER_USER) {
    const windowEnd = entry.firstAttempt.getTime() + WINDOW_DURATION_MS
    const retryAfterMs = windowEnd - now
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000)

    return {
      allowed: false,
      retryAfter: retryAfterSeconds,
    }
  }

  return {
    allowed: true,
    remaining: MAX_REQUESTS_PER_USER - entry.count - 1,
  }
}

/**
 * Record a request attempt
 *
 * @param userId - User UUID
 */
export function recordUserRequest(userId: string): void {
  const entry = userRateLimits.get(userId)
  const now = new Date()

  if (!entry || now.getTime() - entry.firstAttempt.getTime() > WINDOW_DURATION_MS) {
    // Start new window
    userRateLimits.set(userId, {
      count: 1,
      firstAttempt: now,
      lastAttempt: now,
    })
  } else {
    // Increment count in current window
    entry.count++
    entry.lastAttempt = now
  }

  if (import.meta.env.DEV) {
    const current = userRateLimits.get(userId)
    console.log(`[User Rate Limit] User ${userId.slice(0, 8)}: ${current?.count}/${MAX_REQUESTS_PER_USER} requests in current window`)
  }
}
