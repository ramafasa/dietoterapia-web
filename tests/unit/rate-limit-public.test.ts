import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  checkPublicRateLimit,
  recordPublicRequest,
  checkEmailRateLimit,
  recordEmailSent,
  checkShopRateLimit,
  recordShopRequest,
  checkShopOrderRateLimit,
  recordShopOrderRequest,
  getRateLimitStats,
  clearRateLimits,
} from '@/lib/rate-limit-public'

describe('rate-limit-public', () => {
  beforeEach(() => {
    // Clear rate limits before each test
    clearRateLimits()
  })

  describe('IP rate limiting', () => {
    it('should allow first request', () => {
      const result = checkPublicRateLimit('192.168.1.1')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4) // MAX_REQUESTS_PER_IP - 1
    })

    it('should track multiple requests from same IP', () => {
      const ip = '192.168.1.1'

      // First request
      recordPublicRequest(ip)
      let result = checkPublicRateLimit(ip)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(3)

      // Second request
      recordPublicRequest(ip)
      result = checkPublicRateLimit(ip)
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('should block after MAX_REQUESTS_PER_IP (5)', () => {
      const ip = '192.168.1.1'

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        recordPublicRequest(ip)
      }

      // 6th request should be blocked
      const result = checkPublicRateLimit(ip)
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should track different IPs independently', () => {
      const ip1 = '192.168.1.1'
      const ip2 = '192.168.1.2'

      // Block ip1
      for (let i = 0; i < 5; i++) {
        recordPublicRequest(ip1)
      }

      // ip2 should still be allowed
      const result1 = checkPublicRateLimit(ip1)
      const result2 = checkPublicRateLimit(ip2)

      expect(result1.allowed).toBe(false)
      expect(result2.allowed).toBe(true)
    })

    it('should reset window after WINDOW_DURATION_MS', () => {
      const ip = '192.168.1.1'

      // Mock timers
      vi.useFakeTimers()

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        recordPublicRequest(ip)
      }

      // Should be blocked
      let result = checkPublicRateLimit(ip)
      expect(result.allowed).toBe(false)

      // Fast forward 1 hour + 1 second
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000)

      // Should be allowed again
      result = checkPublicRateLimit(ip)
      expect(result.allowed).toBe(true)

      vi.useRealTimers()
    })
  })

  describe('Email rate limiting', () => {
    it('should allow first email', () => {
      const result = checkEmailRateLimit('test@example.com')
      expect(result.allowed).toBe(true)
    })

    it('should normalize email addresses', () => {
      const email = 'Test@Example.COM'

      recordEmailSent(email)
      const result = checkEmailRateLimit('test@example.com')

      expect(result.allowed).toBe(true) // Still allowed (1 out of 2)
    })

    it('should block after MAX_EMAILS_PER_ADDRESS (2)', () => {
      const email = 'test@example.com'

      // Send 2 emails
      recordEmailSent(email)
      recordEmailSent(email)

      // 3rd email should be blocked
      const result = checkEmailRateLimit(email)
      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBeGreaterThan(0)
    })

    it('should track different emails independently', () => {
      const email1 = 'user1@example.com'
      const email2 = 'user2@example.com'

      // Block email1
      recordEmailSent(email1)
      recordEmailSent(email1)

      // email2 should still be allowed
      const result1 = checkEmailRateLimit(email1)
      const result2 = checkEmailRateLimit(email2)

      expect(result1.allowed).toBe(false)
      expect(result2.allowed).toBe(true)
    })

    it('should reset window after WINDOW_DURATION_MS', () => {
      const email = 'test@example.com'

      // Mock timers
      vi.useFakeTimers()

      // Send 2 emails
      recordEmailSent(email)
      recordEmailSent(email)

      // Should be blocked
      let result = checkEmailRateLimit(email)
      expect(result.allowed).toBe(false)

      // Fast forward 1 hour + 1 second
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000)

      // Should be allowed again
      result = checkEmailRateLimit(email)
      expect(result.allowed).toBe(true)

      vi.useRealTimers()
    })
  })

  describe('getRateLimitStats', () => {
    it('should return correct stats', () => {
      recordPublicRequest('192.168.1.1')
      recordEmailSent('test@example.com')

      const stats = getRateLimitStats()

      expect(stats.ipCount).toBe(1)
      expect(stats.emailCount).toBe(1)
      expect(stats.maxRequestsPerIp).toBe(5)
      expect(stats.maxEmailsPerAddress).toBe(2)
      expect(stats.windowDurationMinutes).toBe(60)
    })
  })

  describe('clearRateLimits', () => {
    it('should clear all rate limits', () => {
      recordPublicRequest('192.168.1.1')
      recordEmailSent('test@example.com')

      let stats = getRateLimitStats()
      expect(stats.ipCount).toBe(1)
      expect(stats.emailCount).toBe(1)

      clearRateLimits()

      stats = getRateLimitStats()
      expect(stats.ipCount).toBe(0)
      expect(stats.emailCount).toBe(0)
    })
  })
})

describe('rate-limit-public – shop (sklep)', () => {
  beforeEach(() => {
    clearRateLimits()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows the first request with 59 remaining', () => {
    expect(checkShopRateLimit('10.0.0.1')).toEqual({ allowed: true, remaining: 59 })
  })

  it('allows 60 requests and blocks the 61st with retryAfterSeconds', () => {
    const ip = '10.0.0.1'

    for (let i = 0; i < 60; i++) {
      expect(checkShopRateLimit(ip).allowed).toBe(true)
      recordShopRequest(ip)
    }

    const result = checkShopRateLimit(ip)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(10 * 60)
  })

  it('resets after the 10-minute window', () => {
    vi.useFakeTimers()
    const ip = '10.0.0.1'
    for (let i = 0; i < 60; i++) recordShopRequest(ip)
    expect(checkShopRateLimit(ip).allowed).toBe(false)

    vi.advanceTimersByTime(10 * 60 * 1000 + 1000)

    expect(checkShopRateLimit(ip).allowed).toBe(true)
  })

  it('tracks IPs independently', () => {
    for (let i = 0; i < 60; i++) recordShopRequest('10.0.0.1')

    expect(checkShopRateLimit('10.0.0.1').allowed).toBe(false)
    expect(checkShopRateLimit('10.0.0.2').allowed).toBe(true)
  })

  it('is independent from the public (contact form) limiter', () => {
    const ip = '10.0.0.1'
    for (let i = 0; i < 5; i++) recordPublicRequest(ip)
    expect(checkPublicRateLimit(ip).allowed).toBe(false)
    expect(checkShopRateLimit(ip).allowed).toBe(true)

    clearRateLimits()
    for (let i = 0; i < 60; i++) recordShopRequest(ip)
    expect(checkShopRateLimit(ip).allowed).toBe(false)
    expect(checkPublicRateLimit(ip).allowed).toBe(true)
  })

  it('clearRateLimits() clears the shop counter', () => {
    const ip = '10.0.0.1'
    for (let i = 0; i < 60; i++) recordShopRequest(ip)
    expect(getRateLimitStats().shopIpCount).toBe(1)

    clearRateLimits()

    expect(getRateLimitStats().shopIpCount).toBe(0)
    expect(checkShopRateLimit(ip).allowed).toBe(true)
  })
})

describe('rate-limit-public – shop orders (sklep)', () => {
  beforeEach(() => {
    clearRateLimits()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows the first order with 9 remaining', () => {
    expect(checkShopOrderRateLimit('10.0.0.1')).toEqual({ allowed: true, remaining: 9 })
  })

  it('allows 10 orders and blocks the 11th with retryAfterSeconds', () => {
    const ip = '10.0.0.1'

    for (let i = 0; i < 10; i++) {
      expect(checkShopOrderRateLimit(ip).allowed).toBe(true)
      recordShopOrderRequest(ip)
    }

    const result = checkShopOrderRateLimit(ip)
    expect(result.allowed).toBe(false)
    expect(result.retryAfterSeconds).toBeGreaterThan(10 * 60)
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60 * 60)
  })

  it('resets after the 1-hour window', () => {
    vi.useFakeTimers()
    const ip = '10.0.0.1'
    for (let i = 0; i < 10; i++) recordShopOrderRequest(ip)
    expect(checkShopOrderRateLimit(ip).allowed).toBe(false)

    vi.advanceTimersByTime(30 * 60 * 1000)
    expect(checkShopOrderRateLimit(ip).allowed).toBe(false)

    vi.advanceTimersByTime(30 * 60 * 1000 + 1000)
    expect(checkShopOrderRateLimit(ip).allowed).toBe(true)
  })

  it('tracks IPs independently', () => {
    for (let i = 0; i < 10; i++) recordShopOrderRequest('10.0.0.1')

    expect(checkShopOrderRateLimit('10.0.0.1').allowed).toBe(false)
    expect(checkShopOrderRateLimit('10.0.0.2').allowed).toBe(true)
  })

  it('is independent from the shop (cart quote) and public limiters', () => {
    const ip = '10.0.0.1'
    for (let i = 0; i < 10; i++) recordShopOrderRequest(ip)
    expect(checkShopOrderRateLimit(ip).allowed).toBe(false)
    expect(checkShopRateLimit(ip).allowed).toBe(true)
    expect(checkPublicRateLimit(ip).allowed).toBe(true)

    clearRateLimits()
    for (let i = 0; i < 60; i++) recordShopRequest(ip)
    for (let i = 0; i < 5; i++) recordPublicRequest(ip)
    expect(checkShopOrderRateLimit(ip).allowed).toBe(true)
  })

  it('clearRateLimits() clears the shop order counter', () => {
    const ip = '10.0.0.1'
    for (let i = 0; i < 10; i++) recordShopOrderRequest(ip)
    expect(getRateLimitStats().shopOrderIpCount).toBe(1)

    clearRateLimits()

    expect(getRateLimitStats().shopOrderIpCount).toBe(0)
    expect(checkShopOrderRateLimit(ip).allowed).toBe(true)
  })
})
