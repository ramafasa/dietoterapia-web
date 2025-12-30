/**
 * Integration Tests: PZK Module Access Repository
 *
 * Tests PzkAccessRepository operations with real PostgreSQL database.
 * Uses Testcontainers for isolated database instances.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { Database } from '@/db'
import * as schema from '@/db/schema'
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../helpers/db-container'
import { createUser } from '../../helpers/fixtures'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'

// Mock SHA-256 hash (64 hex chars) for tests
const mockSHA256Hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08' // SHA-256 of "test"

describe('Integration: PZK Access Repository', () => {
  let db: Database
  let repository: PzkAccessRepository
  let testUserId: string

  beforeAll(async () => {
    const result = await startTestDatabase()
    db = result.db
    repository = new PzkAccessRepository(db)
  })

  afterAll(async () => {
    await stopTestDatabase()
  })

  beforeEach(async () => {
    await cleanDatabase(db)

    // Create test user
    const user = await createUser(db, {
      email: 'patient@example.com',
      password: mockSHA256Hash,
      role: 'patient',
      status: 'active',
    })
    testUserId = user.id
  })

  describe('listActiveAccessByUserId()', () => {
    it('should return empty array when user has no access records', async () => {
      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toEqual([])
    })

    it('should return active access records', async () => {
      // Insert active access record
      await db.insert(schema.pzkModuleAccess).values({
        userId: testUserId,
        module: 1,
        startAt: new Date('2025-01-01T00:00:00.000Z'),
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        revokedAt: null,
      })

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        module: 1,
        startAt: new Date('2025-01-01T00:00:00.000Z'),
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
      })
    })

    it('should return multiple active access records', async () => {
      // Insert multiple active access records
      await db.insert(schema.pzkModuleAccess).values([
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: testUserId,
          module: 2,
          startAt: new Date('2025-02-01T00:00:00.000Z'),
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: testUserId,
          module: 3,
          startAt: new Date('2025-03-01T00:00:00.000Z'),
          expiresAt: new Date('2026-03-01T00:00:00.000Z'),
          revokedAt: null,
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(3)
      expect(result[0].module).toBe(1)
      expect(result[1].module).toBe(2)
      expect(result[2].module).toBe(3)
    })

    it('should exclude revoked access records (revokedAt IS NOT NULL)', async () => {
      await db.insert(schema.pzkModuleAccess).values([
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null, // Active
        },
        {
          userId: testUserId,
          module: 2,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: new Date('2025-12-01T00:00:00.000Z'), // Revoked
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(1)
      expect(result[0].module).toBe(1)
    })

    it('should exclude access records that have not started yet (startAt > now)', async () => {
      await db.insert(schema.pzkModuleAccess).values([
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null, // Active
        },
        {
          userId: testUserId,
          module: 2,
          startAt: new Date('2026-01-01T00:00:00.000Z'), // Starts in future
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(1)
      expect(result[0].module).toBe(1)
    })

    it('should exclude expired access records (expiresAt <= now)', async () => {
      await db.insert(schema.pzkModuleAccess).values([
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null, // Active
        },
        {
          userId: testUserId,
          module: 2,
          startAt: new Date('2024-01-01T00:00:00.000Z'),
          expiresAt: new Date('2025-01-01T00:00:00.000Z'), // Expired
          revokedAt: null,
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(1)
      expect(result[0].module).toBe(1)
    })

    it('should include access that expires exactly at now boundary (expiresAt = now)', async () => {
      // Business rule: now < expiresAt (strictly less than)
      // So record expiring AT now should be excluded
      await db.insert(schema.pzkModuleAccess).values({
        userId: testUserId,
        module: 1,
        startAt: new Date('2025-01-01T00:00:00.000Z'),
        expiresAt: new Date('2025-12-30T12:00:00.000Z'), // Expires exactly at now
        revokedAt: null,
      })

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      // Should be excluded because expiresAt <= now (not strictly greater)
      expect(result).toHaveLength(0)
    })

    it('should include access that starts exactly at now boundary (startAt = now)', async () => {
      // Business rule: startAt <= now
      // So record starting AT now should be included
      await db.insert(schema.pzkModuleAccess).values({
        userId: testUserId,
        module: 1,
        startAt: new Date('2025-12-30T12:00:00.000Z'), // Starts exactly at now
        expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        revokedAt: null,
      })

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(1)
      expect(result[0].module).toBe(1)
    })

    it('should sort results by module ASC, then startAt ASC', async () => {
      await db.insert(schema.pzkModuleAccess).values([
        {
          userId: testUserId,
          module: 2,
          startAt: new Date('2025-03-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-02-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(3)
      // First: module 1, earliest startAt
      expect(result[0].module).toBe(1)
      expect(result[0].startAt).toEqual(new Date('2025-01-01T00:00:00.000Z'))
      // Second: module 1, later startAt
      expect(result[1].module).toBe(1)
      expect(result[1].startAt).toEqual(new Date('2025-02-01T00:00:00.000Z'))
      // Third: module 2
      expect(result[2].module).toBe(2)
      expect(result[2].startAt).toEqual(new Date('2025-03-01T00:00:00.000Z'))
    })

    it('should only return access for specified user', async () => {
      // Create another user
      const otherUser = await createUser(db, {
        email: 'other@example.com',
        password: mockSHA256Hash,
        role: 'patient',
        status: 'active',
      })

      await db.insert(schema.pzkModuleAccess).values([
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
        {
          userId: otherUser.id,
          module: 2,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(1)
      expect(result[0].module).toBe(1)
    })

    it('should handle complex scenario with mixed active/inactive records', async () => {
      await db.insert(schema.pzkModuleAccess).values([
        // Active module 1
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
        // Revoked module 1 (older period)
        {
          userId: testUserId,
          module: 1,
          startAt: new Date('2024-01-01T00:00:00.000Z'),
          expiresAt: new Date('2025-01-01T00:00:00.000Z'),
          revokedAt: new Date('2024-12-01T00:00:00.000Z'),
        },
        // Active module 2
        {
          userId: testUserId,
          module: 2,
          startAt: new Date('2025-06-01T00:00:00.000Z'),
          expiresAt: new Date('2026-06-01T00:00:00.000Z'),
          revokedAt: null,
        },
        // Expired module 3
        {
          userId: testUserId,
          module: 3,
          startAt: new Date('2024-01-01T00:00:00.000Z'),
          expiresAt: new Date('2025-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
        // Future module 3
        {
          userId: testUserId,
          module: 3,
          startAt: new Date('2026-01-01T00:00:00.000Z'),
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          revokedAt: null,
        },
      ])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const result = await repository.listActiveAccessByUserId(testUserId, now)

      expect(result).toHaveLength(2)
      expect(result[0].module).toBe(1)
      expect(result[1].module).toBe(2)
    })
  })
})
