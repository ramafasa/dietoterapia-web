import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/pages/api/pzk/materials/[materialId]/pdfs/[pdfId]/presign';
import {
  PzkPdfPresignService,
  MaterialNotFoundError,
  MaterialForbiddenError,
  PdfNotFoundError,
  PresignStorageError,
} from '@/lib/services/pzkPdfPresignService';
import type { PzkPresignResponse } from '@/types/pzk-dto';
import {
  createMockAPIContext,
  parseJSONResponse,
} from '../../../helpers/api-helper';
import {
  createMockPatient,
  createMockDietitian,
  createMockUnauthenticated,
} from '../../../helpers/auth-helper';

// Mock PzkPdfPresignService
vi.mock('@/lib/services/pzkPdfPresignService');

// Mock rate limiting (allow all requests by default)
vi.mock('@/lib/rate-limit-pzk', () => ({
  checkPzkRateLimit: vi.fn(() => ({ allowed: true })),
  recordPzkRequest: vi.fn(),
  getClientIp: vi.fn(() => '127.0.0.1'),
}));

// Mock CSRF protection (allow all requests by default)
vi.mock('@/lib/http/csrf', () => ({
  checkCsrfForUnsafeRequest: vi.fn(() => ({ ok: true })),
}));

describe('POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign - PDF Presign', () => {
  let generatePresignUrlSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    generatePresignUrlSpy = vi
      .spyOn(PzkPdfPresignService.prototype, 'generatePresignUrl')
      .mockResolvedValue({
        url: 'https://storage.example.com/presigned-url?signature=abc123',
        expiresAt: new Date('2025-12-30T14:01:00.000Z').toISOString(),
        ttlSeconds: 60,
      });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('SUCCESS - 200', () => {
    it('should generate presigned URL for authorized patient with default TTL', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse<PzkPresignResponse>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeDefined();
      expect(json.data!.url).toBe(
        'https://storage.example.com/presigned-url?signature=abc123'
      );
      expect(json.data!.expiresAt).toBe('2025-12-30T14:01:00.000Z');
      expect(json.data!.ttlSeconds).toBe(60);
      expect(json.error).toBeNull();

      // Service called with default TTL
      expect(generatePresignUrlSpy).toHaveBeenCalledWith({
        userId: 'patient-1',
        materialId,
        pdfId,
        ttlSeconds: 60,
        ip: '127.0.0.1',
      });
    });

    it('should respect ttlSeconds=60 from request body', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttlSeconds: 60 }),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse<PzkPresignResponse>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.error).toBeNull();

      expect(generatePresignUrlSpy).toHaveBeenCalledWith({
        userId: 'patient-1',
        materialId,
        pdfId,
        ttlSeconds: 60,
        ip: '127.0.0.1',
      });
    });
  });

  describe('ERROR - 400 Bad Request', () => {
    it('should return 400 when materialId is not a valid UUID', async () => {
      // Arrange
      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/invalid-id/pdfs/00000000-0000-0000-0000-000000000002/presign',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: {
          materialId: 'invalid-id',
          pdfId: '00000000-0000-0000-0000-000000000002',
        },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('UUID');

      // Service should NOT be called
      expect(generatePresignUrlSpy).not.toHaveBeenCalled();
    });

    it('should return 400 when pdfId is not a valid UUID', async () => {
      // Arrange
      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001/pdfs/invalid-id/presign',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: {
          materialId: '00000000-0000-0000-0000-000000000001',
          pdfId: 'invalid-id',
        },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('UUID');

      // Service should NOT be called
      expect(generatePresignUrlSpy).not.toHaveBeenCalled();
    });

    it('should return 400 when ttlSeconds is not 60 (MVP restriction)', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttlSeconds: 120 }), // Invalid: must be 60
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(400);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('validation_error');
      expect(json.error!.message).toContain('60');
      expect(json.error!.message).toContain('MVP');

      // Service should NOT be called
      expect(generatePresignUrlSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 401 Unauthorized', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange
      const unauthLocals = createMockUnauthenticated();

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001/pdfs/00000000-0000-0000-0000-000000000002/presign',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: {
          materialId: '00000000-0000-0000-0000-000000000001',
          pdfId: '00000000-0000-0000-0000-000000000002',
        },
        locals: unauthLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(401);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('unauthorized');

      // Service should NOT be called
      expect(generatePresignUrlSpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 403 Forbidden', () => {
    it('should return 403 when user is not a patient (dietitian)', async () => {
      // Arrange
      const dietitianLocals = createMockDietitian({ id: 'dietitian-1' });

      const context = createMockAPIContext({
        request: new Request(
          'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001/pdfs/00000000-0000-0000-0000-000000000002/presign',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: {
          materialId: '00000000-0000-0000-0000-000000000001',
          pdfId: '00000000-0000-0000-0000-000000000002',
        },
        locals: dietitianLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(403);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('forbidden');

      // Service should NOT be called
      expect(generatePresignUrlSpy).not.toHaveBeenCalled();
    });

    it('should return 403 for material with no_module_access', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      const forbiddenError = new MaterialForbiddenError('no_module_access');
      forbiddenError.reason = 'no_module_access';
      generatePresignUrlSpy.mockRejectedValue(forbiddenError);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(403);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('forbidden');
      expect(json.error!.message).toContain('Brak dostępu do modułu');
      expect(json.error!.details).toEqual({ reason: 'no_module_access' });
    });

    it('should return 403 for publish_soon material', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      const forbiddenError = new MaterialForbiddenError('publish_soon');
      forbiddenError.reason = 'publish_soon';
      generatePresignUrlSpy.mockRejectedValue(forbiddenError);

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(403);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('forbidden');
      expect(json.error!.message).toContain('wkrótce');
      expect(json.error!.details).toEqual({ reason: 'publish_soon' });
    });
  });

  describe('ERROR - 404 Not Found', () => {
    it('should return 404 when material does not exist', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-999999999999';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      generatePresignUrlSpy.mockRejectedValue(
        new MaterialNotFoundError('Material not found')
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('not_found');
    });

    it('should return 404 when PDF does not exist (IDOR protection)', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-999999999999';

      generatePresignUrlSpy.mockRejectedValue(
        new PdfNotFoundError('PDF not found or belongs to different material')
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(404);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('not_found');
    });
  });

  describe('ERROR - 500 Internal Server Error', () => {
    it('should return 500 when storage presign fails', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      const storageError = new Error('S3 connection failed');
      generatePresignUrlSpy.mockRejectedValue(
        new PresignStorageError('Failed to generate presigned URL', storageError)
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(500);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('internal_server_error');

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should return 500 when unexpected error occurs', async () => {
      // Arrange
      const materialId = '00000000-0000-0000-0000-000000000001';
      const pdfId = '00000000-0000-0000-0000-000000000002';

      generatePresignUrlSpy.mockRejectedValue(
        new Error('Unexpected database error')
      );

      const patientLocals = createMockPatient({ id: 'patient-1' });

      const context = createMockAPIContext({
        request: new Request(
          `http://localhost/api/pzk/materials/${materialId}/pdfs/${pdfId}/presign`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          }
        ),
        params: { materialId, pdfId },
        locals: patientLocals,
      });

      // Act
      const response = await POST(context);
      const json = await parseJSONResponse(response);

      // Assert
      expect(response.status).toBe(500);
      expect(json.data).toBeNull();
      expect(json.error).toBeDefined();
      expect(json.error!.code).toBe('internal_server_error');

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[POST /api/pzk/materials/:materialId/pdfs/:pdfId/presign] Error:',
        expect.any(Error)
      );
    });
  });
});
