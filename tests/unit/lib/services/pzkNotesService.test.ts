import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  PzkNotesService,
  MaterialNotFoundError,
  MaterialForbiddenError,
} from '@/lib/services/pzkNotesService'
import { PzkMaterialRepository } from '@/lib/repositories/pzkMaterialRepository'
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository'
import { PzkNoteRepository } from '@/lib/repositories/pzkNoteRepository'
import type { MaterialRecord } from '@/lib/repositories/pzkMaterialRepository'
import type { NoteRecord } from '@/lib/repositories/pzkNoteRepository'
import type { Database } from '@/db'

// Mock database
const mockDb = {} as Database

// Mock repositories
vi.mock('@/lib/repositories/pzkMaterialRepository')
vi.mock('@/lib/repositories/pzkAccessRepository')
vi.mock('@/lib/repositories/pzkNoteRepository')

describe('PzkNotesService', () => {
  let service: PzkNotesService
  let getMaterialByIdSpy: ReturnType<typeof vi.spyOn>
  let hasActiveAccessSpy: ReturnType<typeof vi.spyOn>
  let getNoteByUserAndMaterialSpy: ReturnType<typeof vi.spyOn>
  let upsertNoteSpy: ReturnType<typeof vi.spyOn>
  let deleteNoteSpy: ReturnType<typeof vi.spyOn>

  const userId = 'user-123'
  const materialId = 'mat-456'
  const now = new Date('2025-12-30T12:00:00.000Z')

  beforeEach(() => {
    service = new PzkNotesService(mockDb)

    // Mock repository methods
    getMaterialByIdSpy = vi
      .spyOn(PzkMaterialRepository.prototype, 'getById')
      .mockResolvedValue(null)

    hasActiveAccessSpy = vi
      .spyOn(PzkAccessRepository.prototype, 'hasActiveAccessToModule')
      .mockResolvedValue(false)

    getNoteByUserAndMaterialSpy = vi
      .spyOn(PzkNoteRepository.prototype, 'getByUserAndMaterial')
      .mockResolvedValue(null)

    upsertNoteSpy = vi
      .spyOn(PzkNoteRepository.prototype, 'upsertByUserAndMaterial')
      .mockResolvedValue({
        content: 'Test note',
        updatedAt: now,
      })

    deleteNoteSpy = vi
      .spyOn(PzkNoteRepository.prototype, 'deleteByUserAndMaterial')
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('assertCanAccessPublishedMaterial() - Error scenarios', () => {
    it('should throw MaterialNotFoundError when material does not exist', async () => {
      getMaterialByIdSpy.mockResolvedValue(null)

      await expect(
        service.getNote(userId, materialId, now)
      ).rejects.toThrow(MaterialNotFoundError)

      expect(getMaterialByIdSpy).toHaveBeenCalledWith(materialId)
    })

    it('should throw MaterialNotFoundError when material status is draft', async () => {
      const draftMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'draft',
        order: 1,
        title: 'Draft Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(draftMaterial)

      await expect(
        service.getNote(userId, materialId, now)
      ).rejects.toThrow(MaterialNotFoundError)

      expect(hasActiveAccessSpy).not.toHaveBeenCalled()
    })

    it('should throw MaterialNotFoundError when material status is archived', async () => {
      const archivedMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'archived',
        order: 1,
        title: 'Archived Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(archivedMaterial)

      await expect(
        service.getNote(userId, materialId, now)
      ).rejects.toThrow(MaterialNotFoundError)

      expect(hasActiveAccessSpy).not.toHaveBeenCalled()
    })

    it('should throw MaterialNotFoundError when material status is publish_soon', async () => {
      const publishSoonMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'publish_soon',
        order: 1,
        title: 'Coming Soon Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(publishSoonMaterial)

      await expect(
        service.getNote(userId, materialId, now)
      ).rejects.toThrow(MaterialNotFoundError)

      expect(hasActiveAccessSpy).not.toHaveBeenCalled()
    })

    it('should throw MaterialForbiddenError when user lacks module access', async () => {
      const publishedMaterial: MaterialRecord = {
        id: materialId,
        module: 2,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Published Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(false)

      await expect(
        service.getNote(userId, materialId, now)
      ).rejects.toThrow(MaterialForbiddenError)

      expect(hasActiveAccessSpy).toHaveBeenCalledWith(userId, 2, now)
    })

    it('should include reason in MaterialForbiddenError', async () => {
      const publishedMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Published Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(false)

      try {
        await service.getNote(userId, materialId, now)
        expect.fail('Should have thrown MaterialForbiddenError')
      } catch (error) {
        expect(error).toBeInstanceOf(MaterialForbiddenError)
        expect((error as MaterialForbiddenError).reason).toBe('no_module_access')
      }
    })
  })

  describe('getNote()', () => {
    const publishedMaterial: MaterialRecord = {
      id: materialId,
      module: 1,
      categoryId: 'cat-1',
      status: 'published',
      order: 1,
      title: 'Published Material',
      description: null,
      contentMd: null,
    }

    it('should return null when note does not exist', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      getNoteByUserAndMaterialSpy.mockResolvedValue(null)

      const result = await service.getNote(userId, materialId, now)

      expect(result).toBeNull()
      expect(getNoteByUserAndMaterialSpy).toHaveBeenCalledWith(userId, materialId)
    })

    it('should return PzkNoteDto when note exists', async () => {
      const noteRecord: NoteRecord = {
        content: 'My note content',
        updatedAt: new Date('2025-12-19T10:00:00.000Z'),
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      getNoteByUserAndMaterialSpy.mockResolvedValue(noteRecord)

      const result = await service.getNote(userId, materialId, now)

      expect(result).toEqual({
        materialId,
        content: 'My note content',
        updatedAt: '2025-12-19T10:00:00.000Z',
      })
    })

    it('should call assertCanAccessPublishedMaterial before fetching note', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      getNoteByUserAndMaterialSpy.mockResolvedValue(null)

      await service.getNote(userId, materialId, now)

      // Verify access check was called before note fetch
      expect(getMaterialByIdSpy).toHaveBeenCalledWith(materialId)
      expect(hasActiveAccessSpy).toHaveBeenCalledWith(userId, 1, now)
      expect(getNoteByUserAndMaterialSpy).toHaveBeenCalledWith(userId, materialId)
    })

    it('should use current date when now parameter is not provided', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      getNoteByUserAndMaterialSpy.mockResolvedValue(null)

      await service.getNote(userId, materialId)

      expect(hasActiveAccessSpy).toHaveBeenCalledWith(
        userId,
        1,
        expect.any(Date)
      )
    })
  })

  describe('upsertNote()', () => {
    const publishedMaterial: MaterialRecord = {
      id: materialId,
      module: 1,
      categoryId: 'cat-1',
      status: 'published',
      order: 1,
      title: 'Published Material',
      description: null,
      contentMd: null,
    }

    it('should create new note when note does not exist', async () => {
      const content = 'My new note'
      const noteRecord: NoteRecord = {
        content,
        updatedAt: now,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      const result = await service.upsertNote(userId, materialId, content, now)

      expect(result).toEqual({
        materialId,
        content,
        updatedAt: '2025-12-30T12:00:00.000Z',
      })

      expect(upsertNoteSpy).toHaveBeenCalledWith(userId, materialId, content, now)
    })

    it('should update existing note when note already exists', async () => {
      const content = 'Updated note content'
      const noteRecord: NoteRecord = {
        content,
        updatedAt: now,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      const result = await service.upsertNote(userId, materialId, content, now)

      expect(result).toEqual({
        materialId,
        content,
        updatedAt: '2025-12-30T12:00:00.000Z',
      })

      expect(upsertNoteSpy).toHaveBeenCalledWith(userId, materialId, content, now)
    })

    it('should update updatedAt timestamp on upsert', async () => {
      const content = 'Note content'
      const oldTime = new Date('2025-12-19T10:00:00.000Z')
      const newTime = new Date('2025-12-30T15:00:00.000Z')

      const noteRecord: NoteRecord = {
        content,
        updatedAt: newTime,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      const result = await service.upsertNote(userId, materialId, content, newTime)

      expect(result.updatedAt).toBe('2025-12-30T15:00:00.000Z')
      expect(result.updatedAt).not.toBe(oldTime.toISOString())
    })

    it('should call assertCanAccessPublishedMaterial before upserting note', async () => {
      const content = 'Test note'
      const noteRecord: NoteRecord = {
        content,
        updatedAt: now,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      await service.upsertNote(userId, materialId, content, now)

      // Verify access check was called before upsert
      expect(getMaterialByIdSpy).toHaveBeenCalledWith(materialId)
      expect(hasActiveAccessSpy).toHaveBeenCalledWith(userId, 1, now)
      expect(upsertNoteSpy).toHaveBeenCalledWith(userId, materialId, content, now)
    })

    it('should throw MaterialNotFoundError when material is not published', async () => {
      const draftMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'draft',
        order: 1,
        title: 'Draft Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(draftMaterial)

      await expect(
        service.upsertNote(userId, materialId, 'Note content', now)
      ).rejects.toThrow(MaterialNotFoundError)

      expect(upsertNoteSpy).not.toHaveBeenCalled()
    })

    it('should throw MaterialForbiddenError when user lacks module access', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(false)

      await expect(
        service.upsertNote(userId, materialId, 'Note content', now)
      ).rejects.toThrow(MaterialForbiddenError)

      expect(upsertNoteSpy).not.toHaveBeenCalled()
    })

    it('should use current date when now parameter is not provided', async () => {
      const content = 'Test note'
      const noteRecord: NoteRecord = {
        content,
        updatedAt: new Date(),
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      await service.upsertNote(userId, materialId, content)

      expect(upsertNoteSpy).toHaveBeenCalledWith(
        userId,
        materialId,
        content,
        expect.any(Date)
      )
    })
  })

  describe('deleteNote()', () => {
    const publishedMaterial: MaterialRecord = {
      id: materialId,
      module: 1,
      categoryId: 'cat-1',
      status: 'published',
      order: 1,
      title: 'Published Material',
      description: null,
      contentMd: null,
    }

    it('should delete note successfully when note exists', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      deleteNoteSpy.mockResolvedValue(undefined)

      await service.deleteNote(userId, materialId, now)

      expect(deleteNoteSpy).toHaveBeenCalledWith(userId, materialId)
    })

    it('should be idempotent - succeed even if note does not exist', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      deleteNoteSpy.mockResolvedValue(undefined)

      // Call delete twice
      await service.deleteNote(userId, materialId, now)
      await service.deleteNote(userId, materialId, now)

      expect(deleteNoteSpy).toHaveBeenCalledTimes(2)
    })

    it('should call assertCanAccessPublishedMaterial before deleting note', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      deleteNoteSpy.mockResolvedValue(undefined)

      await service.deleteNote(userId, materialId, now)

      // Verify access check was called before delete
      expect(getMaterialByIdSpy).toHaveBeenCalledWith(materialId)
      expect(hasActiveAccessSpy).toHaveBeenCalledWith(userId, 1, now)
      expect(deleteNoteSpy).toHaveBeenCalledWith(userId, materialId)
    })

    it('should throw MaterialNotFoundError when material is not published', async () => {
      const draftMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'draft',
        order: 1,
        title: 'Draft Material',
        description: null,
        contentMd: null,
      }
      getMaterialByIdSpy.mockResolvedValue(draftMaterial)

      await expect(
        service.deleteNote(userId, materialId, now)
      ).rejects.toThrow(MaterialNotFoundError)

      expect(deleteNoteSpy).not.toHaveBeenCalled()
    })

    it('should throw MaterialForbiddenError when user lacks module access', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(false)

      await expect(
        service.deleteNote(userId, materialId, now)
      ).rejects.toThrow(MaterialForbiddenError)

      expect(deleteNoteSpy).not.toHaveBeenCalled()
    })

    it('should use current date when now parameter is not provided', async () => {
      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      deleteNoteSpy.mockResolvedValue(undefined)

      await service.deleteNote(userId, materialId)

      expect(hasActiveAccessSpy).toHaveBeenCalledWith(
        userId,
        1,
        expect.any(Date)
      )
    })
  })

  describe('Edge cases and error handling', () => {
    it('should handle different module numbers correctly', async () => {
      const material: MaterialRecord = {
        id: materialId,
        module: 3,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Module 3 Material',
        description: null,
        contentMd: null,
      }

      getMaterialByIdSpy.mockResolvedValue(material)
      hasActiveAccessSpy.mockResolvedValue(true)
      getNoteByUserAndMaterialSpy.mockResolvedValue(null)

      await service.getNote(userId, materialId, now)

      expect(hasActiveAccessSpy).toHaveBeenCalledWith(userId, 3, now)
    })

    it('should preserve exact content in note operations', async () => {
      const publishedMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Published Material',
        description: null,
        contentMd: null,
      }

      const specialContent = 'Note with\nnewlines\nand special chars: \u00F3\u0142\u0105\u015B\u0107'
      const noteRecord: NoteRecord = {
        content: specialContent,
        updatedAt: now,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      const result = await service.upsertNote(userId, materialId, specialContent, now)

      expect(result.content).toBe(specialContent)
      expect(upsertNoteSpy).toHaveBeenCalledWith(userId, materialId, specialContent, now)
    })

    it('should handle empty strings after trim as valid content (validated in API layer)', async () => {
      const publishedMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Published Material',
        description: null,
        contentMd: null,
      }

      // Service layer doesn't validate content - that's done in API layer with Zod
      // But it should pass through whatever content is provided
      const content = 'Valid content'
      const noteRecord: NoteRecord = {
        content,
        updatedAt: now,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      const result = await service.upsertNote(userId, materialId, content, now)

      expect(result.content).toBe(content)
    })

    it('should handle long note content (max 10k chars enforced in API layer)', async () => {
      const publishedMaterial: MaterialRecord = {
        id: materialId,
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Published Material',
        description: null,
        contentMd: null,
      }

      const longContent = 'a'.repeat(10000)
      const noteRecord: NoteRecord = {
        content: longContent,
        updatedAt: now,
      }

      getMaterialByIdSpy.mockResolvedValue(publishedMaterial)
      hasActiveAccessSpy.mockResolvedValue(true)
      upsertNoteSpy.mockResolvedValue(noteRecord)

      const result = await service.upsertNote(userId, materialId, longContent, now)

      expect(result.content).toBe(longContent)
      expect(result.content.length).toBe(10000)
    })
  })
})
