import { describe, expect, it } from 'vitest'
import { hashToken } from '@/lib/crypto'

describe('crypto utils', () => {
  describe('hashToken', () => {
    it('generates 64-character hexadecimal hash', () => {
      const token = 'abc123'
      const hash = hashToken(token)

      // SHA-256 produces 32 bytes = 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).toHaveLength(64)
    })

    it('generates same hash for same token (deterministic)', () => {
      const token = 'test-token-123'

      const hash1 = hashToken(token)
      const hash2 = hashToken(token)

      expect(hash1).toBe(hash2)
    })

    it('generates different hashes for different tokens', () => {
      const token1 = 'token-1'
      const token2 = 'token-2'

      const hash1 = hashToken(token1)
      const hash2 = hashToken(token2)

      expect(hash1).not.toBe(hash2)
    })

    it('handles empty string', () => {
      const hash = hashToken('')

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).toHaveLength(64)
      // SHA-256 of empty string is a known constant
      expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    })

    it('handles typical 64-character token (randomBytes(32).toString("hex"))', () => {
      // Simulate typical token format
      const token = 'a'.repeat(64)
      const hash = hashToken(token)

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).toHaveLength(64)
    })

    it('handles special characters', () => {
      const token = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~'
      const hash = hashToken(token)

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).toHaveLength(64)
    })

    it('handles unicode characters', () => {
      const token = 'Zażółć gęślą jaźń 🔐'
      const hash = hashToken(token)

      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).toHaveLength(64)
    })

    it('handles very long tokens', () => {
      const token = 'a'.repeat(1000)
      const hash = hashToken(token)

      // SHA-256 always produces 64-char hex regardless of input length
      expect(hash).toMatch(/^[a-f0-9]{64}$/)
      expect(hash).toHaveLength(64)
    })

    it('hash is different from raw token', () => {
      const token = 'my-secret-token'
      const hash = hashToken(token)

      expect(hash).not.toBe(token)
      expect(hash).not.toContain(token)
    })

    it('produces known hash for known input (test vector)', () => {
      // Test vector from SHA-256 specification
      const token = 'abc'
      const expectedHash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'

      const hash = hashToken(token)

      expect(hash).toBe(expectedHash)
    })

    it('is case-sensitive', () => {
      const token1 = 'Token'
      const token2 = 'token'

      const hash1 = hashToken(token1)
      const hash2 = hashToken(token2)

      expect(hash1).not.toBe(hash2)
    })

    it('detects even small differences in input', () => {
      const token1 = 'password-reset-token-123'
      const token2 = 'password-reset-token-124' // Last char different

      const hash1 = hashToken(token1)
      const hash2 = hashToken(token2)

      expect(hash1).not.toBe(hash2)
    })
  })
})
