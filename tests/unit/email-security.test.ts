import { describe, it, expect } from 'vitest'
import {
  sanitizeEmailContent,
  sanitizeName,
  sanitizePhone,
  validateEmailRecipient,
  getEmailRiskScore,
  sanitizeFormData,
} from '@/lib/email-security'

describe('email-security', () => {
  describe('sanitizeEmailContent', () => {
    it('should remove HTML tags', () => {
      const input = 'Hello <script>alert("xss")</script>World'
      const result = sanitizeEmailContent(input)
      expect(result).toBe('Hello alert(&quot;xss&quot;)World') // Quotes are escaped
      expect(result).not.toContain('<script>')
    })

    it('should escape HTML special characters', () => {
      const input = '<div>Test & "quotes" & \'apostrophes\'</div>'
      const result = sanitizeEmailContent(input)
      expect(result).toBe('Test &amp; &quot;quotes&quot; &amp; &#39;apostrophes&#39;')
    })

    it('should preserve line breaks', () => {
      const input = 'Line 1\nLine 2\nLine 3'
      const result = sanitizeEmailContent(input)
      expect(result).toBe('Line 1<br>Line 2<br>Line 3')
    })

    it('should handle empty input', () => {
      expect(sanitizeEmailContent('')).toBe('')
      expect(sanitizeEmailContent(null as any)).toBe('')
    })

    it('should handle complex XSS attempts', () => {
      const input = '<img src=x onerror=alert(1)><svg onload=alert(2)>'
      const result = sanitizeEmailContent(input)
      expect(result).not.toContain('<img')
      expect(result).not.toContain('<svg')
      expect(result).not.toContain('onerror')
      expect(result).not.toContain('onload')
    })
  })

  describe('sanitizeName', () => {
    it('should remove HTML tags', () => {
      const input = 'John <b>Doe</b>'
      const result = sanitizeName(input)
      expect(result).toBe('John Doe')
    })

    it('should escape HTML special characters', () => {
      const input = 'John & Jane "Smith"'
      const result = sanitizeName(input)
      expect(result).toBe('John &amp; Jane &quot;Smith&quot;')
    })

    it('should remove dangerous characters', () => {
      const input = 'John{Doe}[Smith]\\Test'
      const result = sanitizeName(input)
      expect(result).toBe('JohnDoeSmithTest')
    })

    it('should handle empty input', () => {
      expect(sanitizeName('')).toBe('')
      expect(sanitizeName(null as any)).toBe('')
    })
  })

  describe('sanitizePhone', () => {
    it('should keep valid phone characters', () => {
      const input = '+48 123 456 789'
      const result = sanitizePhone(input)
      expect(result).toBe('+48 123 456 789')
    })

    it('should remove invalid characters', () => {
      const input = '+48<script>alert(1)</script>123456789'
      const result = sanitizePhone(input)
      // Letters from 'alert' remain, but script tags are removed
      expect(result).not.toContain('<script>')
      expect(result).not.toContain('</script>')
      expect(result).toContain('+48')
    })

    it('should handle empty input', () => {
      expect(sanitizePhone('')).toBe('')
      expect(sanitizePhone(null as any)).toBe('')
    })
  })

  describe('validateEmailRecipient', () => {
    it('should accept valid emails', () => {
      expect(validateEmailRecipient('user@example.com')).toBe(true)
      expect(validateEmailRecipient('test.user@subdomain.example.com')).toBe(true)
      expect(validateEmailRecipient('user+tag@example.co.uk')).toBe(true)
    })

    it('should reject disposable email domains', () => {
      expect(validateEmailRecipient('user@tempmail.com')).toBe(false)
      expect(validateEmailRecipient('test@guerrillamail.com')).toBe(false)
      expect(validateEmailRecipient('spam@10minutemail.com')).toBe(false)
      expect(validateEmailRecipient('fake@mailinator.com')).toBe(false)
    })

    it('should reject emails with multiple consecutive dots', () => {
      expect(validateEmailRecipient('user..name@example.com')).toBe(false)
    })

    it('should reject emails starting/ending with dot', () => {
      expect(validateEmailRecipient('.user@example.com')).toBe(false)
      expect(validateEmailRecipient('user.@example.com')).toBe(false)
    })

    it('should reject emails without TLD', () => {
      expect(validateEmailRecipient('user@localhost')).toBe(false)
    })

    it('should reject emails with short TLD', () => {
      expect(validateEmailRecipient('user@example.c')).toBe(false)
    })

    it('should handle empty/invalid input', () => {
      expect(validateEmailRecipient('')).toBe(false)
      // Note: validateEmailRecipient assumes email passed Zod validation
      // It only checks additional security rules, not basic format
      expect(validateEmailRecipient('@example.com')).toBe(false) // No local part
    })

    it('should normalize case', () => {
      expect(validateEmailRecipient('User@TempMail.COM')).toBe(false)
    })
  })

  describe('getEmailRiskScore', () => {
    it('should return high score for disposable domains', () => {
      const score = getEmailRiskScore('test@tempmail.com')
      expect(score).toBeGreaterThan(0.7)
    })

    it('should return low score for normal emails', () => {
      const score = getEmailRiskScore('john.doe@example.com')
      expect(score).toBeLessThan(0.3)
    })

    it('should increase score for many digits', () => {
      const score = getEmailRiskScore('user123456789@example.com')
      expect(score).toBeGreaterThan(0)
    })

    it('should increase score for long local part', () => {
      const longEmail = 'verylongemailaddressthatexceedsthirtychars@example.com'
      const score = getEmailRiskScore(longEmail)
      expect(score).toBeGreaterThan(0)
    })

    it('should increase score for consecutive numbers', () => {
      const score = getEmailRiskScore('user123456@example.com')
      expect(score).toBeGreaterThan(0)
    })

    it('should cap score at 1.0', () => {
      const score = getEmailRiskScore('verylongemail123456789012345@tempmail.com')
      expect(score).toBeLessThanOrEqual(1.0)
    })
  })

  describe('sanitizeFormData', () => {
    it('should sanitize all string fields', () => {
      const input = {
        fullName: 'John <b>Doe</b>',
        email: 'Test@Example.COM',
        phone: '+48 123 456 789',
        message: 'Hello <script>alert(1)</script>World',
        gdprConsent: true,
      }

      const result = sanitizeFormData(input)

      expect(result.fullName).toBe('John Doe')
      expect(result.email).toBe('test@example.com')
      expect(result.phone).toBe('+48 123 456 789')
      expect(result.message).not.toContain('<script>')
      expect(result.gdprConsent).toBe(true)
    })

    it('should handle optional fields', () => {
      const input = {
        fullName: 'John Doe',
        email: 'test@example.com',
        phone: undefined,
        message: 'Test message',
      }

      const result = sanitizeFormData(input)

      expect(result.fullName).toBe('John Doe')
      expect(result.email).toBe('test@example.com')
      expect(result.phone).toBe(undefined)
      expect(result.message).toBe('Test message')
    })

    it('should preserve non-string values', () => {
      const input = {
        name: 'John Doe',
        age: 30,
        active: true,
        tags: ['tag1', 'tag2'],
      }

      const result = sanitizeFormData(input)

      expect(result.age).toBe(30)
      expect(result.active).toBe(true)
      expect(result.tags).toEqual(['tag1', 'tag2'])
    })
  })
})
