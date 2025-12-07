import { describe, it, expect } from 'vitest'
import { hashPasswordV2, verifyPasswordV2 } from '@/lib/password'

describe('Password v2 (client-side SHA-256 + bcrypt)', () => {
  // Valid SHA-256 hash (example: SHA-256 of "test")
  const validSHA256 = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

  describe('hashPasswordV2', () => {
    it('should hash SHA-256 to bcrypt', async () => {
      const bcryptHash = await hashPasswordV2(validSHA256)

      expect(bcryptHash).toBeDefined()
      expect(bcryptHash).toMatch(/^\$2[ab]\$08\$.{53}$/) // bcrypt format (SALT_ROUNDS=8)
    })

    it('should throw error for invalid length', async () => {
      await expect(hashPasswordV2('short')).rejects.toThrow('expected 64 chars')
    })

    it('should throw error for invalid characters', async () => {
      const invalidHash = 'G' + 'a'.repeat(63) // G is not hex
      await expect(hashPasswordV2(invalidHash)).rejects.toThrow('lowercase hexadecimal')
    })

    it('should throw error for non-string input', async () => {
      await expect(hashPasswordV2(123 as any)).rejects.toThrow('must be a string')
    })
  })

  describe('verifyPasswordV2', () => {
    it('should verify correct SHA-256 hash', async () => {
      const bcryptHash = await hashPasswordV2(validSHA256)
      const isValid = await verifyPasswordV2(validSHA256, bcryptHash)

      expect(isValid).toBe(true)
    })

    it('should reject incorrect SHA-256 hash', async () => {
      const bcryptHash = await hashPasswordV2(validSHA256)
      const wrongHash = 'a'.repeat(64) // Different hash
      const isValid = await verifyPasswordV2(wrongHash, bcryptHash)

      expect(isValid).toBe(false)
    })

    it('should throw error for invalid SHA-256 format', async () => {
      const bcryptHash = '$2b$10$abcdefghijk...' // Valid bcrypt
      await expect(verifyPasswordV2('invalid', bcryptHash)).rejects.toThrow()
    })
  })

  describe('hashPasswordV2 + verifyPasswordV2 roundtrip', () => {
    it('should work end-to-end', async () => {
      const sha256Hash = '1234567890abcdef'.repeat(4) // 64 chars

      // Hash
      const bcryptHash = await hashPasswordV2(sha256Hash)

      // Verify
      const isValid = await verifyPasswordV2(sha256Hash, bcryptHash)
      expect(isValid).toBe(true)

      // Wrong hash should fail
      const wrongHash = 'fedcba0987654321'.repeat(4)
      const isInvalid = await verifyPasswordV2(wrongHash, bcryptHash)
      expect(isInvalid).toBe(false)
    })
  })
})
