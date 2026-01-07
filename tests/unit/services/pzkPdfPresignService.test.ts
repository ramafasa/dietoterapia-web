import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  PzkPdfPresignService,
  MaterialNotFoundError,
  MaterialForbiddenError,
  PdfNotFoundError,
  PresignStorageError,
} from '@/lib/services/pzkPdfPresignService';
import { PzkMaterialRepository } from '@/lib/repositories/pzkMaterialRepository';
import { PzkMaterialPdfRepository } from '@/lib/repositories/pzkMaterialPdfRepository';
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository';
import { EventRepository } from '@/lib/repositories/eventRepository';
import type { Database } from '@/db';

// Mock database
const mockDb = {} as Database;

// Mock repositories
vi.mock('@/lib/repositories/pzkMaterialRepository');
vi.mock('@/lib/repositories/pzkMaterialPdfRepository');
vi.mock('@/lib/repositories/pzkAccessRepository');
vi.mock('@/lib/repositories/eventRepository');

// Mock storage presign function
vi.mock('@/lib/storage/s3-presign', () => ({
  generatePresignedUrl: vi.fn(async () => 'https://storage.example.com/presigned-url'),
}));

describe('PzkPdfPresignService', () => {
  let service: PzkPdfPresignService;
  let findForPresignSpy: ReturnType<typeof vi.spyOn>;
  let listActiveAccessSpy: ReturnType<typeof vi.spyOn>;
  let findPdfSpy: ReturnType<typeof vi.spyOn>;
  let createEventSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    service = new PzkPdfPresignService(mockDb);

    findForPresignSpy = vi
      .spyOn(PzkMaterialRepository.prototype, 'findForPresign')
      .mockResolvedValue(null);
    listActiveAccessSpy = vi
      .spyOn(PzkAccessRepository.prototype, 'listActiveAccessByUserId')
      .mockResolvedValue([]);
    findPdfSpy = vi
      .spyOn(PzkMaterialPdfRepository.prototype, 'findByMaterialIdAndPdfId')
      .mockResolvedValue(null);
    createEventSpy = vi
      .spyOn(EventRepository.prototype, 'create')
      .mockResolvedValue(undefined);

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('generatePresignUrl() - SUCCESS', () => {
    it('should generate presigned URL for authorized user', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'published',
      };

      const mockPdf = {
        id: 'pdf-1',
        materialId: 'mat-1',
        objectKey: 'pzk/test.pdf',
        fileName: 'test.pdf',
        contentType: 'application/pdf',
        displayOrder: 1,
      };

      const mockAccess = [
        { module: 1, startAt: new Date(), expiresAt: new Date() },
      ];

      findForPresignSpy.mockResolvedValue(mockMaterial);
      listActiveAccessSpy.mockResolvedValue(mockAccess);
      findPdfSpy.mockResolvedValue(mockPdf);

      const result = await service.generatePresignUrl({
        userId: 'user-1',
        materialId: 'mat-1',
        pdfId: 'pdf-1',
        ttlSeconds: 60,
      });

      expect(result.url).toBe('https://storage.example.com/presigned-url');
      expect(result.ttlSeconds).toBe(60);
      expect(result.expiresAt).toBeDefined();
      expect(createEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          eventType: 'pzk_pdf_presign_success',
        })
      );
    });

    it('should set expiresAt = now + ttlSeconds', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'published',
      };

      const mockPdf = {
        id: 'pdf-1',
        materialId: 'mat-1',
        objectKey: 'pzk/test.pdf',
        fileName: 'test.pdf',
        contentType: null,
        displayOrder: 1,
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);
      listActiveAccessSpy.mockResolvedValue([{ module: 1, startAt: new Date(), expiresAt: new Date() }]);
      findPdfSpy.mockResolvedValue(mockPdf);

      const beforeCall = Date.now();
      const result = await service.generatePresignUrl({
        userId: 'user-1',
        materialId: 'mat-1',
        pdfId: 'pdf-1',
        ttlSeconds: 120,
      });
      const afterCall = Date.now();

      const expiresAtTime = new Date(result.expiresAt).getTime();
      const expectedMin = beforeCall + 120 * 1000;
      const expectedMax = afterCall + 120 * 1000;

      expect(expiresAtTime).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresAtTime).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('generatePresignUrl() - MaterialNotFoundError', () => {
    it('should throw MaterialNotFoundError when material does not exist', async () => {
      findForPresignSpy.mockResolvedValue(null);

      await expect(
        service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'nonexistent',
          pdfId: 'pdf-1',
          ttlSeconds: 60,
        })
      ).rejects.toThrow(MaterialNotFoundError);

      expect(createEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pzk_pdf_presign_error',
          properties: expect.objectContaining({
            reason: 'material_not_found',
          }),
        })
      );
    });

    it('should throw MaterialNotFoundError for draft material', async () => {
      findForPresignSpy.mockResolvedValue(null); // findForPresign filters out draft

      await expect(
        service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'draft-mat',
          pdfId: 'pdf-1',
          ttlSeconds: 60,
        })
      ).rejects.toThrow(MaterialNotFoundError);
    });
  });

  describe('generatePresignUrl() - MaterialForbiddenError', () => {
    it('should throw MaterialForbiddenError (publish_soon)', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'publish_soon',
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);

      await expect(
        service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'mat-1',
          pdfId: 'pdf-1',
          ttlSeconds: 60,
        })
      ).rejects.toThrow(MaterialForbiddenError);

      expect(createEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pzk_pdf_presign_forbidden',
          properties: expect.objectContaining({
            reason: 'publish_soon',
          }),
        })
      );
    });

    it('should throw MaterialForbiddenError (no_module_access)', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 2,
        status: 'published',
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);
      listActiveAccessSpy.mockResolvedValue([
        { module: 1, startAt: new Date(), expiresAt: new Date() }, // User has module 1, not 2
      ]);

      await expect(
        service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'mat-1',
          pdfId: 'pdf-1',
          ttlSeconds: 60,
        })
      ).rejects.toThrow(MaterialForbiddenError);

      expect(createEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pzk_pdf_presign_forbidden',
          properties: expect.objectContaining({
            reason: 'no_module_access',
          }),
        })
      );
    });

    it('should set reason property on MaterialForbiddenError', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'publish_soon',
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);

      try {
        await service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'mat-1',
          pdfId: 'pdf-1',
          ttlSeconds: 60,
        });
        expect.fail('Should have thrown MaterialForbiddenError');
      } catch (error) {
        expect(error).toBeInstanceOf(MaterialForbiddenError);
        expect((error as MaterialForbiddenError).reason).toBe('publish_soon');
      }
    });
  });

  describe('generatePresignUrl() - PdfNotFoundError (IDOR protection)', () => {
    it('should throw PdfNotFoundError when PDF does not exist', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'published',
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);
      listActiveAccessSpy.mockResolvedValue([{ module: 1, startAt: new Date(), expiresAt: new Date() }]);
      findPdfSpy.mockResolvedValue(null); // PDF not found

      await expect(
        service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'mat-1',
          pdfId: 'nonexistent-pdf',
          ttlSeconds: 60,
        })
      ).rejects.toThrow(PdfNotFoundError);

      expect(createEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'pzk_pdf_presign_error',
          properties: expect.objectContaining({
            reason: 'pdf_not_found',
          }),
        })
      );
    });

    it('should throw PdfNotFoundError when PDF belongs to different material (IDOR)', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'published',
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);
      listActiveAccessSpy.mockResolvedValue([{ module: 1, startAt: new Date(), expiresAt: new Date() }]);
      findPdfSpy.mockResolvedValue(null); // Repository returns null (IDOR protection)

      await expect(
        service.generatePresignUrl({
          userId: 'user-1',
          materialId: 'mat-1',
          pdfId: 'pdf-from-mat-2', // PDF from different material
          ttlSeconds: 60,
        })
      ).rejects.toThrow(PdfNotFoundError);
    });
  });

  describe('generatePresignUrl() - Event logging (best-effort)', () => {
    it('should not fail if event logging throws error', async () => {
      const mockMaterial = {
        id: 'mat-1',
        module: 1,
        status: 'published',
      };

      const mockPdf = {
        id: 'pdf-1',
        materialId: 'mat-1',
        objectKey: 'pzk/test.pdf',
        fileName: 'test.pdf',
        contentType: 'application/pdf',
        displayOrder: 1,
      };

      findForPresignSpy.mockResolvedValue(mockMaterial);
      listActiveAccessSpy.mockResolvedValue([{ module: 1, startAt: new Date(), expiresAt: new Date() }]);
      findPdfSpy.mockResolvedValue(mockPdf);
      createEventSpy.mockRejectedValue(new Error('Event DB error')); // Event logging fails

      // Should NOT throw, event logging is best-effort
      const result = await service.generatePresignUrl({
        userId: 'user-1',
        materialId: 'mat-1',
        pdfId: 'pdf-1',
        ttlSeconds: 60,
      });

      expect(result.url).toBe('https://storage.example.com/presigned-url');
      expect(consoleErrorSpy).toHaveBeenCalled(); // Logs error but doesn't throw
    });
  });
});
