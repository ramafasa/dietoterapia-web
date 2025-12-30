import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { PzkAccessService } from '@/lib/services/pzkAccessService'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import type { ActiveAccessRecord } from '@/lib/repositories/pzkAccessRepository'
import type { Database } from '@/db'

// Mock database
const mockDb = {} as Database

// Mock repository
vi.mock('@/lib/repositories/pzkAccessRepository')

describe('PzkAccessService', () => {
  let service: PzkAccessService
  let listActiveAccessSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    service = new PzkAccessService(mockDb)

    // Mock repository method
    listActiveAccessSpy = vi
      .spyOn(PzkAccessRepository.prototype, 'listActiveAccessByUserId')
      .mockResolvedValue([])

    // Mock console.error to avoid polluting test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.clearAllMocks()
    consoleErrorSpy.mockRestore()
  })

  describe('getAccessSummary()', () => {
    it('should return empty summary when no active access records exist', async () => {
      listActiveAccessSpy.mockResolvedValue([])

      const now = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', now)

      expect(summary).toEqual({
        hasAnyActiveAccess: false,
        activeModules: [],
        access: [],
        serverTime: '2025-12-30T12:00:00.000Z',
      })

      expect(listActiveAccessSpy).toHaveBeenCalledWith('user-123', now)
    })

    it('should return summary with single active module', async () => {
      const mockRecords: ActiveAccessRecord[] = [
        {
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', now)

      expect(summary).toEqual({
        hasAnyActiveAccess: true,
        activeModules: [1],
        access: [
          {
            module: 1,
            startAt: '2025-01-01T00:00:00.000Z',
            expiresAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        serverTime: '2025-12-30T12:00:00.000Z',
      })
    })

    it('should return summary with multiple active modules', async () => {
      const mockRecords: ActiveAccessRecord[] = [
        {
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          module: 2,
          startAt: new Date('2025-02-01T00:00:00.000Z'),
          expiresAt: new Date('2026-02-01T00:00:00.000Z'),
        },
        {
          module: 3,
          startAt: new Date('2025-03-01T00:00:00.000Z'),
          expiresAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      ]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', now)

      expect(summary).toEqual({
        hasAnyActiveAccess: true,
        activeModules: [1, 2, 3],
        access: [
          {
            module: 1,
            startAt: '2025-01-01T00:00:00.000Z',
            expiresAt: '2026-01-01T00:00:00.000Z',
          },
          {
            module: 2,
            startAt: '2025-02-01T00:00:00.000Z',
            expiresAt: '2026-02-01T00:00:00.000Z',
          },
          {
            module: 3,
            startAt: '2025-03-01T00:00:00.000Z',
            expiresAt: '2026-03-01T00:00:00.000Z',
          },
        ],
        serverTime: '2025-12-30T12:00:00.000Z',
      })
    })

    it('should deduplicate activeModules when same module has multiple access records', async () => {
      const mockRecords: ActiveAccessRecord[] = [
        {
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2025-06-01T00:00:00.000Z'),
        },
        {
          module: 1,
          startAt: new Date('2025-06-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          module: 2,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', now)

      expect(summary.activeModules).toEqual([1, 2])
      expect(summary.access).toHaveLength(3) // All access records included
    })

    it('should sort activeModules in ascending order', async () => {
      const mockRecords: ActiveAccessRecord[] = [
        {
          module: 3,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          module: 2,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', now)

      expect(summary.activeModules).toEqual([1, 2, 3])
    })

    it('should use current date when now parameter is not provided', async () => {
      listActiveAccessSpy.mockResolvedValue([])

      const beforeCall = new Date()
      const summary = await service.getAccessSummary('user-123')
      const afterCall = new Date()

      // Verify serverTime is between beforeCall and afterCall
      const serverTime = new Date(summary.serverTime)
      expect(serverTime.getTime()).toBeGreaterThanOrEqual(beforeCall.getTime())
      expect(serverTime.getTime()).toBeLessThanOrEqual(afterCall.getTime())

      // Verify repository was called with a Date object
      expect(listActiveAccessSpy).toHaveBeenCalledWith(
        'user-123',
        expect.any(Date)
      )
    })

    it('should convert Date objects to ISO strings in response', async () => {
      const mockRecords: ActiveAccessRecord[] = [
        {
          module: 1,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', now)

      // Verify all dates are ISO strings
      expect(typeof summary.serverTime).toBe('string')
      expect(summary.serverTime).toBe('2025-12-30T12:00:00.000Z')

      expect(typeof summary.access[0].startAt).toBe('string')
      expect(summary.access[0].startAt).toBe('2025-01-01T00:00:00.000Z')

      expect(typeof summary.access[0].expiresAt).toBe('string')
      expect(summary.access[0].expiresAt).toBe('2026-01-01T00:00:00.000Z')
    })

    it('should throw error when repository returns invalid module number', async () => {
      const mockRecords = [
        {
          module: 4, // Invalid module number
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ] as ActiveAccessRecord[]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')

      await expect(
        service.getAccessSummary('user-123', now)
      ).rejects.toThrow('Invalid module number in database: 4')
    })

    it('should throw error when repository returns module 0', async () => {
      const mockRecords = [
        {
          module: 0,
          startAt: new Date('2025-01-01T00:00:00.000Z'),
          expiresAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ] as ActiveAccessRecord[]
      listActiveAccessSpy.mockResolvedValue(mockRecords)

      const now = new Date('2025-12-30T12:00:00.000Z')

      await expect(
        service.getAccessSummary('user-123', now)
      ).rejects.toThrow('Invalid module number in database: 0')
    })

    it('should handle repository errors and log them', async () => {
      const repositoryError = new Error('Database connection failed')
      listActiveAccessSpy.mockRejectedValue(repositoryError)

      const now = new Date('2025-12-30T12:00:00.000Z')

      await expect(
        service.getAccessSummary('user-123', now)
      ).rejects.toThrow('Database connection failed')

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[PzkAccessService] Error getting access summary:',
        repositoryError
      )
    })

    it('should use same now timestamp for both repository call and serverTime', async () => {
      listActiveAccessSpy.mockResolvedValue([])

      const fixedNow = new Date('2025-12-30T12:00:00.000Z')
      const summary = await service.getAccessSummary('user-123', fixedNow)

      expect(summary.serverTime).toBe('2025-12-30T12:00:00.000Z')
      expect(listActiveAccessSpy).toHaveBeenCalledWith('user-123', fixedNow)
    })
  })
})
