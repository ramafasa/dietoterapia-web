import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Check if Upstash credentials are configured
const isConfigured = import.meta.env.UPSTASH_REDIS_REST_URL &&
                     import.meta.env.UPSTASH_REDIS_REST_TOKEN

// Create Redis client only if configured
const redis = isConfigured
  ? new Redis({
      url: import.meta.env.UPSTASH_REDIS_REST_URL,
      token: import.meta.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null

// Rate limiter for login attempts: 5 attempts per 15 minutes
export const loginRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '15 m'),
      analytics: true,
    })
  : null

// Rate limiter for password reset: 3 attempts per hour
export const passwordResetRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(3, '60 m'),
      analytics: true,
    })
  : null

// Rate limiter for API endpoints: 100 requests per minute
export const apiRateLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 m'),
      analytics: true,
    })
  : null
