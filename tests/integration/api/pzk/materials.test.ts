import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/pages/api/pzk/materials/[materialId]';
import {
  PzkMaterialService,
  MaterialNotFoundError,
} from '@/lib/services/pzkMaterialService';
import type { PzkMaterialDetails } from '@/types/pzk-dto';
import {
  createMockAPIContext,
  parseJSONResponse,
} from '../../../helpers/api-helper';
import {
  createMockPatient,
  createMockDietitian,
  createMockUnauthenticated,
} from '../../../helpers/auth-helper';

// Mock PzkMaterialService
vi.mock('@/lib/services/pzkMaterialService');

describe('GET /api/pzk/materials/:materialId - PZK Material Details', () => {
  let getMaterialDetailsSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getMaterialDetailsSpy = vi
      .spyOn(PzkMaterialService.prototype, 'getMaterialDetails')
      .mockResolvedValue({
        id: 'mat-1',
        module: 1,
        category: null,
        status: 'published',
        order: 1,
        title: 'Test Material',
        description: null,
        contentMd: null,
        pdfs: [],
        videos: [],
        note: null,
        access: {
          isLocked: true,
          ctaUrl: null,
        },
      });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('SUCCESS - 200 (unlocked material)', () => {
    it('should return unlocked material with full content and default includes', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000123';
      const mockMaterial: PzkMaterialDetails = {
        id: materialId,
        module: 1,
        category: {
          id: 'cat-1',
          slug: 'podstawy',
          label: 'Podstawy',
          displayOrder: 1,
          description: null,
        },
        status: 'published',
        order: 1,
        title: 'Wprowadzenie do PZK',
        description: 'Materiał wprowadzający',
        contentMd: '# Witaj w PZK\n\nTo jest treść...',
        pdfs: [{ id: 'pdf-1', fileName: 'intro.pdf', displayOrder: 1 }],
        videos: [
          {
            id: 'vid-1',
            youtubeVideoId: 'abc123',
            title: 'Film 1',
            displayOrder: 1,
          },
        ],
        note: { content: 'Moja notatka', updatedAt: '2025-12-30T12:00:00.000Z' },
        access: {
          isLocked: false,
          ctaUrl: null,
        },
      };

      getMaterialDetailsSpy.mockResolvedValue(mockMaterial);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}`
        ),
        url: new URL(`http://localhost/api/pzk/materials/${materialId}`),
        params: { materialId },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkMaterialDetails>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeDefined();
      expect(json.data!.id).toBe(materialId);
      expect(json.data!.access.isLocked).toBe(false);
      expect(json.data!.contentMd).toBe('# Witaj w PZK\n\nTo jest treść...');
      expect(json.data!.pdfs).toHaveLength(1);
      expect(json.data!.videos).toHaveLength(1);
      expect(json.data!.note).not.toBeNull();
      expect(json.error).toBeNull();

      // Service called with default includes
      expect(getMaterialDetailsSpy).toHaveBeenCalledWith({
        userId: 'patient-1',
        materialId,
        include: { pdfs: true, videos: true, note: true },
      });
    });

    it('should respect include query parameter (only pdfs)', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000124';
      const mockMaterial: PzkMaterialDetails = {
        id: materialId,
        module: 1,
        category: null,
        status: 'published',
        order: 1,
        title: 'Test',
        description: null,
        contentMd: '# Content',
        pdfs: [{ id: 'pdf-1', fileName: 'test.pdf', displayOrder: 1 }],
        videos: [],
        note: null,
        access: { isLocked: false, ctaUrl: null },
      };

      getMaterialDetailsSpy.mockResolvedValue(mockMaterial);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}?include=pdfs`
        ),
        url: new URL(
          `http://localhost/api/pzk/materials/${materialId}?include=pdfs`
        ),
        params: { materialId },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkMaterialDetails>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data!.pdfs).toHaveLength(1);
      expect(json.error).toBeNull();

      // Service called with selective include
      expect(getMaterialDetailsSpy).toHaveBeenCalledWith({
        userId: 'patient-1',
        materialId,
        include: { pdfs: true, videos: false, note: false },
      });
    });

    it('should respect include query parameter (multiple values)', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000125';
      const mockMaterial: PzkMaterialDetails = {
        id: materialId,
        module: 1,
        category: null,
        status: 'published',
        order: 1,
        title: 'Test',
        description: null,
        contentMd: '# Content',
        pdfs: [],
        videos: [
          {
            id: 'vid-1',
            youtubeVideoId: 'abc',
            title: 'Video',
            displayOrder: 1,
          },
        ],
        note: { content: 'Note', updatedAt: '2025-12-30T12:00:00.000Z' },
        access: { isLocked: false, ctaUrl: null },
      };

      getMaterialDetailsSpy.mockResolvedValue(mockMaterial);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}?include=videos,note`
        ),
        url: new URL(
          `http://localhost/api/pzk/materials/${materialId}?include=videos,note`
        ),
        params: { materialId },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkMaterialDetails>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.error).toBeNull();

      // Service called with videos + note only
      expect(getMaterialDetailsSpy).toHaveBeenCalledWith({
        userId: 'patient-1',
        materialId,
        include: { pdfs: false, videos: true, note: true },
      });
    });
  });

  describe('SUCCESS - 200 (locked material)', () => {
    it('should return locked material with no content leak (no_module_access)', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000126';
      const mockMaterial: PzkMaterialDetails = {
        id: materialId,
        module: 2,
        category: null,
        status: 'published',
        order: 1,
        title: 'Zaawansowane techniki',
        description: 'Dostępne po zakupie modułu 2',
        contentMd: null, // No content leak
        pdfs: [],
        videos: [],
        note: null,
        access: {
          isLocked: true,
          ctaUrl: 'https://example.com/pzk?module=2',
          reason: 'no_module_access',
        },
      };

      getMaterialDetailsSpy.mockResolvedValue(mockMaterial);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}`
        ),
        url: new URL(`http://localhost/api/pzk/materials/${materialId}`),
        params: { materialId },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkMaterialDetails>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data!.access.isLocked).toBe(true);
      expect(json.data!.access.reason).toBe('no_module_access');
      expect(json.data!.access.ctaUrl).toBe('https://example.com/pzk?module=2');
      expect(json.data!.contentMd).toBeNull(); // No content leak
      expect(json.data!.pdfs).toEqual([]);
      expect(json.data!.videos).toEqual([]);
      expect(json.data!.note).toBeNull();
      expect(json.error).toBeNull();
    });

    it('should return locked material with no CTA for publish_soon', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000127';
      const mockMaterial: PzkMaterialDetails = {
        id: materialId,
        module: 1,
        category: null,
        status: 'publish_soon',
        order: 1,
        title: 'Wkrótce dostępne',
        description: 'Ten materiał będzie wkrótce dostępny',
        contentMd: null,
        pdfs: [],
        videos: [],
        note: null,
        access: {
          isLocked: true,
          ctaUrl: null, // No CTA for publish_soon
          reason: 'publish_soon',
        },
      };

      getMaterialDetailsSpy.mockResolvedValue(mockMaterial);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}`
        ),
        url: new URL(`http://localhost/api/pzk/materials/${materialId}`),
        params: { materialId },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkMaterialDetails>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data!.access.isLocked).toBe(true);
      expect(json.data!.access.reason).toBe('publish_soon');
      expect(json.data!.access.ctaUrl).toBeNull();
      expect(json.error).toBeNull();
    });
  });

  describe('ERROR - 400 Bad Request', () => {
    it('should return 400 when materialId is not a valid UUID', async () => {
      // Arrange
      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/materials/invalid-id'),
        url: new URL('http://localhost/api/pzk/materials/invalid-id'),
        params: { materialId: 'invalid-id' },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('UUID');

      // Service should NOT be called
      expect(getMaterialDetailsSpy).not.toHaveBeenCalled();
    });

    it('should return 400 when include parameter is invalid', async () => {
      // Arrange
      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001?include=invalid'
        ),
        url: new URL(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001?include=invalid'
        ),
        params: { materialId: '00000000-0000-0000-0000-000000000001' },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('pdfs');
      expect(json.error!.message).toContain('videos');
      expect(json.error!.message).toContain('note');

      // Service should NOT be called
      expect(getMaterialDetailsSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 401 Unauthorized', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange
      const unauthLocals = createMockUnauthenticated();

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        url: new URL(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        params: { materialId: '00000000-0000-0000-0000-000000000001' },
        locals: unauthLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(401);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('unauthorized');

      // Service should NOT be called
      expect(getMaterialDetailsSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 403 Forbidden', () => {
    it('should return 403 when user is not a patient (dietitian)', async () => {
      // Arrange
      const dietitianLocals = createMockDietitian({ id: 'dietitian-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        url: new URL(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        params: { materialId: '00000000-0000-0000-0000-000000000001' },
        locals: dietitianLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(403);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('forbidden');

      // Service should NOT be called
      expect(getMaterialDetailsSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 404 Not Found', () => {
    it('should return 404 when material does not exist', async () => {
      // Arrange
      getMaterialDetailsSpy.mockRejectedValue(
        new MaterialNotFoundError('Material not found')
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000999'
        ),
        url: new URL(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000999'
        ),
        params: { materialId: '00000000-0000-0000-0000-000000000999' },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('not_found');
      expect(json.error!.message).toBe('Nie znaleziono zasobu');
    });

    it('should return 404 for draft material (no metadata leak)', async () => {
      // Arrange
      getMaterialDetailsSpy.mockRejectedValue(
        new MaterialNotFoundError('Draft material')
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        url: new URL(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        params: { materialId: '00000000-0000-0000-0000-000000000001' },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('not_found');
      // No metadata leak - same error message
      expect(json.error!.message).toBe('Nie znaleziono zasobu');
    });
  });

  describe('ERROR - 500 Internal Server Error', () => {
    it('should return 500 when service throws unexpected error', async () => {
      // Arrange
      getMaterialDetailsSpy.mockRejectedValue(
        new Error('Unexpected database error')
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        url: new URL(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001'
        ),
        params: { materialId: '00000000-0000-0000-0000-000000000001' },
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(500);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('internal_server_error');

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GET /api/pzk/materials/:materialId] Error:',
        expect.any(Error)
      );
    });
  });
});
