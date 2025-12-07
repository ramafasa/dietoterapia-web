import { describe, it, expect } from 'vitest'
import { hashPasswordClient } from '@/lib/crypto'

describe('hashPasswordClient', () => {
  it('should hash password to SHA-256 hex string (64 chars)', async () => {
    const hash = await hashPasswordClient('test')

    expect(hash).toBeDefined()
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should produce consistent hash for same password', async () => {
    const password = 'MyPassword123'
    const hash1 = await hashPasswordClient(password)
    const hash2 = await hashPasswordClient(password)

    expect(hash1).toBe(hash2)
  })

  it('should produce different hashes for different passwords', async () => {
    const hash1 = await hashPasswordClient('password1')
    const hash2 = await hashPasswordClient('password2')

    expect(hash1).not.toBe(hash2)
  })

  it('should handle empty string', async () => {
    const hash = await hashPasswordClient('')

    // SHA-256 of empty string
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  it('should handle special characters', async () => {
    const hash = await hashPasswordClient('!@#$%^&*()_+-=[]{}|;:,.<>?')

    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should handle Unicode characters', async () => {
    const hash = await hashPasswordClient('Zażółć gęślą jaźń 🔒')

    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('should match known SHA-256 hash', async () => {
    // Test vector: "hello" → known SHA-256
    const hash = await hashPasswordClient('hello')

    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})
