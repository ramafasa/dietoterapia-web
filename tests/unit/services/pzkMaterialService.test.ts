import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PzkMaterialService, MaterialNotFoundError } from '@/lib/services/pzkMaterialService';
import { PzkMaterialRepository } from '@/lib/repositories/pzkMaterialRepository';
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository';
import { PzkMaterialPdfRepository } from '@/lib/repositories/pzkMaterialPdfRepository';
import { PzkMaterialVideoRepository } from '@/lib/repositories/pzkMaterialVideoRepository';
import { PzkNoteRepository } from '@/lib/repositories/pzkNoteRepository';
import type { Database } from '@/db';

// Mock database
const mockDb = {} as Database;

// Mock repositories
vi.mock('@/lib/repositories/pzkMaterialRepository');
vi.mock('@/lib/repositories/pzkAccessRepository');
vi.mock('@/lib/repositories/pzkMaterialPdfRepository');
vi.mock('@/lib/repositories/pzkMaterialVideoRepository');
vi.mock('@/lib/repositories/pzkNoteRepository');
vi.mock('@/lib/pzk/config', () => ({
  buildPurchaseUrl: vi.fn((module) => `https://example.com/pzk?module=${module}`),
}));

describe('PzkMaterialService', () => {
  let service: PzkMaterialService;
  let getByIdSpy: ReturnType<typeof vi.spyOn>;
  let getByIdWithCategorySpy: ReturnType<typeof vi.spyOn>;
  let hasActiveAccessSpy: ReturnType<typeof vi.spyOn>;
  let listPdfsSpy: ReturnType<typeof vi.spyOn>;
  let listVideosSpy: ReturnType<typeof vi.spyOn>;
  let getNoteSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new PzkMaterialService(mockDb);

    getByIdSpy = vi
      .spyOn(PzkMaterialRepository.prototype, 'getById')
      .mockResolvedValue(null);
    getByIdWithCategorySpy = vi
      .spyOn(PzkMaterialRepository.prototype, 'getByIdWithCategory')
      .mockResolvedValue(null);
    hasActiveAccessSpy = vi
      .spyOn(PzkAccessRepository.prototype, 'hasActiveAccessToModule')
      .mockResolvedValue(false);
    listPdfsSpy = vi
      .spyOn(PzkMaterialPdfRepository.prototype, 'listByMaterialId')
      .mockResolvedValue([]);
    listVideosSpy = vi
      .spyOn(PzkMaterialVideoRepository.prototype, 'listByMaterialId')
      .mockResolvedValue([]);
    getNoteSpy = vi
      .spyOn(PzkNoteRepository.prototype, 'getByUserAndMaterial')
      .mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getMaterialDetails() - UNLOCKED (published + has access)', () => {
    it('should return full content when user has access', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Test Material',
        description: 'Test description',
        contentMd: '# Test Content',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);
      hasActiveAccessSpy.mockResolvedValue(true);
      getByIdWithCategorySpy.mockResolvedValue({
        ...mockMaterial,
        category: {
          id: 'cat-1',
          slug: 'test',
          label: 'Test Category',
          displayOrder: 1,
          description: null,
        },
      });

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: false, videos: false, note: false },
      });

      expect(result.access.isLocked).toBe(false);
      expect(result.title).toBe('Test Material');
      expect(result.contentMd).toBe('# Test Content');
      expect(result.category).not.toBeNull();
    });

    it('should include pdfs when include.pdfs = true', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Test',
        description: null,
        contentMd: '',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);
      hasActiveAccessSpy.mockResolvedValue(true);
      getByIdWithCategorySpy.mockResolvedValue({ ...mockMaterial, category: null });
      listPdfsSpy.mockResolvedValue([
        { id: 'pdf-1', fileName: 'test.pdf', displayOrder: 1 },
      ]);

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: true, videos: false, note: false },
      });

      expect(result.pdfs).toHaveLength(1);
      expect(result.pdfs[0].fileName).toBe('test.pdf');
    });

    it('should include videos when include.videos = true', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Test',
        description: null,
        contentMd: '',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);
      hasActiveAccessSpy.mockResolvedValue(true);
      getByIdWithCategorySpy.mockResolvedValue({ ...mockMaterial, category: null });
      listVideosSpy.mockResolvedValue([
        {
          id: 'vid-1',
          youtubeVideoId: 'abc123',
          title: 'Test Video',
          displayOrder: 1,
        },
      ]);

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: false, videos: true, note: false },
      });

      expect(result.videos).toHaveLength(1);
      expect(result.videos[0].youtubeVideoId).toBe('abc123');
    });

    it('should include note when include.note = true', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Test',
        description: null,
        contentMd: '',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);
      hasActiveAccessSpy.mockResolvedValue(true);
      getByIdWithCategorySpy.mockResolvedValue({ ...mockMaterial, category: null });
      getNoteSpy.mockResolvedValue({
        content: 'My notes',
        updatedAt: new Date('2024-01-01T00:00:00Z'),
      });

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: false, videos: false, note: true },
      });

      expect(result.note).not.toBeNull();
      expect(result.note!.content).toBe('My notes');
    });
  });

  describe('getMaterialDetails() - LOCKED (published + no access)', () => {
    it('should return locked state when user lacks access (CTA handled by UI)', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 2,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Locked Material',
        description: 'Locked description',
        contentMd: '# Secret Content',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);
      hasActiveAccessSpy.mockResolvedValue(false); // No access

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: false, videos: false, note: false },
      });

      expect(result.access.isLocked).toBe(true);
      expect(result.access.reason).toBe('no_module_access');
      expect(result.access.ctaUrl).toBeNull(); // CTA URL generated by PzkPurchaseButton in UI
      expect(result.contentMd).toBeNull(); // No content leaked
      expect(result.category).toBeNull();
    });

    it('should NOT include pdfs/videos/note when locked', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'published',
        order: 1,
        title: 'Locked',
        description: null,
        contentMd: '',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);
      hasActiveAccessSpy.mockResolvedValue(false);

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: true, videos: true, note: true },
      });

      expect(result.pdfs).toEqual([]);
      expect(result.videos).toEqual([]);
      expect(result.note).toBeNull();
    });
  });

  describe('getMaterialDetails() - LOCKED (publish_soon)', () => {
    it('should return locked state WITHOUT ctaUrl for publish_soon', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'publish_soon',
        order: 1,
        title: 'Coming Soon Material',
        description: 'Coming soon description',
        contentMd: '# Secret Content',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);

      const result = await service.getMaterialDetails({
        userId: 'user-1',
        materialId: 'mat-1',
        include: { pdfs: false, videos: false, note: false },
      });

      expect(result.access.isLocked).toBe(true);
      expect(result.access.reason).toBe('publish_soon');
      expect(result.access.ctaUrl).toBeNull(); // No CTA for publish_soon
      expect(result.contentMd).toBeNull();
    });
  });

  describe('getMaterialDetails() - NOT FOUND (draft/archived)', () => {
    it('should throw MaterialNotFoundError when material does not exist', async () => {
      getByIdSpy.mockResolvedValue(null);

      await expect(
        service.getMaterialDetails({
          userId: 'user-1',
          materialId: 'nonexistent',
          include: { pdfs: false, videos: false, note: false },
        })
      ).rejects.toThrow(MaterialNotFoundError);
    });

    it('should throw MaterialNotFoundError for draft material', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'draft',
        order: 1,
        title: 'Draft Material',
        description: null,
        contentMd: '',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);

      await expect(
        service.getMaterialDetails({
          userId: 'user-1',
          materialId: 'mat-1',
          include: { pdfs: false, videos: false, note: false },
        })
      ).rejects.toThrow(MaterialNotFoundError);
    });

    it('should throw MaterialNotFoundError for archived material', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        categoryId: 'cat-1',
        status: 'archived',
        order: 1,
        title: 'Archived Material',
        description: null,
        contentMd: '',
      };

      getByIdSpy.mockResolvedValue(mockMaterial);

      await expect(
        service.getMaterialDetails({
          userId: 'user-1',
          materialId: 'mat-1',
          include: { pdfs: false, videos: false, note: false },
        })
      ).rejects.toThrow(MaterialNotFoundError);
    });
  });
});
