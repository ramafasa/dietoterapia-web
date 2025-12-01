import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  checkPublicRateLimit,
  recordPublicRequest,
  checkEmailRateLimit,
  recordEmailSent,
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
