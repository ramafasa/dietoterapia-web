import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/pages/api/pzk/catalog';
import { PzkCatalogService } from '@/lib/services/pzkCatalogService';
import type { PzkCatalog, ApiResponse } from '@/types/pzk-dto';
import {
  createMockAPIContext,
  parseJSONResponse,
} from '../../../helpers/api-helper';
import {
  createMockPatient,
  createMockDietitian,
  createMockUnauthenticated,
} from '../../../helpers/auth-helper';

// Mock PzkCatalogService
vi.mock('@/lib/services/pzkCatalogService');

describe('GET /api/pzk/catalog - PZK Catalog', () => {
  let getCatalogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getCatalogSpy = vi
      .spyOn(PzkCatalogService.prototype, 'getCatalog')
      .mockResolvedValue({
        modules: [],
      });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('SUCCESS - 200', () => {
    it('should return catalog for authenticated patient with default parameters', async () => {
      // Arrange
      const mockCatalog: PzkCatalog = {
        modules: [
          {
            module: 1,
            isActive: true,
            categories: [
              {
                id: 'cat-1',
                slug: 'podstawy',
                label: 'Podstawy',
                description: null,
                displayOrder: 1,
                materials: [
                  {
                    id: 'mat-1',
                    title: 'Wprowadzenie',
                    description: null,
                    status: 'published',
                    order: 1,
                    module: 1,
                    isLocked: false,
                    isActionable: true,
                    hasPdf: true,
                    hasVideos: false,
                  },
                ],
              },
            ],
          },
        ],
      };

      getCatalogSpy.mockResolvedValue(mockCatalog);

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/catalog'),
        url: new URL('http://localhost/api/pzk/catalog'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<ApiResponse<PzkCatalog>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeDefined();
      expect(json.data!.modules).toHaveLength(1);
      expect(json.data!.modules[0].module).toBe(1);
      expect(json.error).toBeNull();

      // Service called with default params
      expect(getCatalogSpy).toHaveBeenCalledWith('patient-1', {
        modules: [1, 2, 3],
        includeStatuses: ['published', 'publish_soon'],
      });
    });

    it('should filter catalog by modules query param', async () => {
      // Arrange
      const mockCatalog: PzkCatalog = {
        modules: [
          {
            module: 1,
            isActive: true,
            categories: [],
          },
          {
            module: 2,
            isActive: false,
            categories: [],
          },
        ],
      };

      getCatalogSpy.mockResolvedValue(mockCatalog);

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/catalog?modules=1,2'),
        url: new URL('http://localhost/api/pzk/catalog?modules=1,2'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<ApiResponse<PzkCatalog>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data!.modules).toHaveLength(2);
      expect(json.error).toBeNull();

      // Service called with filtered modules
      expect(getCatalogSpy).toHaveBeenCalledWith('patient-1', {
        modules: [1, 2],
        includeStatuses: ['published', 'publish_soon'],
      });
    });

    it('should filter catalog by includeStatuses query param', async () => {
      // Arrange
      const mockCatalog: PzkCatalog = {
        modules: [],
      };

      getCatalogSpy.mockResolvedValue(mockCatalog);

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/catalog?includeStatuses=published'
        ),
        url: new URL(
          'http://localhost/api/pzk/catalog?includeStatuses=published'
        ),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<ApiResponse<PzkCatalog>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.error).toBeNull();

      // Service called with filtered statuses
      expect(getCatalogSpy).toHaveBeenCalledWith('patient-1', {
        modules: [1, 2, 3],
        includeStatuses: ['published'],
      });
    });

    it('should handle combined filters (modules + includeStatuses)', async () => {
      // Arrange
      const mockCatalog: PzkCatalog = {
        modules: [],
      };

      getCatalogSpy.mockResolvedValue(mockCatalog);

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/catalog?modules=1,3&includeStatuses=publish_soon'
        ),
        url: new URL(
          'http://localhost/api/pzk/catalog?modules=1,3&includeStatuses=publish_soon'
        ),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<ApiResponse<PzkCatalog>>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.error).toBeNull();

      // Service called with both filters
      expect(getCatalogSpy).toHaveBeenCalledWith('patient-1', {
        modules: [1, 3],
        includeStatuses: ['publish_soon'],
      });
    });
  });

  describe('ERROR - 400 Bad Request', () => {
    it('should return 400 when modules parameter is invalid', async () => {
      // Arrange
      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/catalog?modules=1,99'),
        url: new URL('http://localhost/api/pzk/catalog?modules=1,99'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('Module must be 1, 2, or 3');

      // Service should NOT be called
      expect(getCatalogSpy).not.toHaveBeenCalled();
    });

    it('should return 400 when includeStatuses parameter is invalid', async () => {
      // Arrange
      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/catalog?includeStatuses=draft'
        ),
        url: new URL('http://localhost/api/pzk/catalog?includeStatuses=draft'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('published');
      expect(json.error!.message).toContain('publish_soon');

      // Service should NOT be called
      expect(getCatalogSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 401 Unauthorized', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange
      const unauthLocals = createMockUnauthenticated();

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/catalog'),
        url: new URL('http://localhost/api/pzk/catalog'),
        locals: unauthLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('unauthorized');
      expect(json.error!.message).toBe('Authentication required');

      // Service should NOT be called
      expect(getCatalogSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 403 Forbidden', () => {
    it('should return 403 when user is not a patient (dietitian)', async () => {
      // Arrange
      const dietitianLocals = createMockDietitian({
        id: 'dietitian-1',
        email: 'dietitian@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/catalog'),
        url: new URL('http://localhost/api/pzk/catalog'),
        locals: dietitianLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(403);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('forbidden');
      expect(json.error!.message).toBe('Patient role required');

      // Service should NOT be called
      expect(getCatalogSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 500 Internal Server Error', () => {
    it('should return 500 when service throws unexpected error', async () => {
      // Arrange
      getCatalogSpy.mockRejectedValue(new Error('Unexpected database error'));

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/catalog'),
        url: new URL('http://localhost/api/pzk/catalog'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('internal_server_error');
      expect(json.error!.message).toBe('Wystąpił nieoczekiwany błąd serwera');

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GET /api/pzk/catalog] Error:',
        expect.any(Error)
      );
    });
  });
});
