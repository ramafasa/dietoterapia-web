import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GET,
  PUT,
  DELETE,
} from '@/pages/api/pzk/materials/[materialId]/note';
import {
  PzkNotesService,
  MaterialNotFoundError,
  MaterialForbiddenError,
} from '@/lib/services/pzkNotesService';
import type { PzkNoteDto, ApiResponse } from '@/types/pzk-dto';
import {
  createMockAPIContext,
  parseJSONResponse,
} from '../../../helpers/api-helper';
import {
  createMockPatient,
  createMockDietitian,
  createMockUnauthenticated,
} from '../../../helpers/auth-helper';

// Mock PzkNotesService
vi.mock('@/lib/services/pzkNotesService');

// Mock CSRF protection (allow all requests by default)
vi.mock('@/lib/http/csrf', () => ({
  checkCsrfForUnsafeRequest: vi.fn(() => ({ ok: true })),
}));

describe('Notes API - /api/pzk/materials/:materialId/note', () => {
  let getNoteSpy: ReturnType<typeof vi.spyOn>;
  let upsertNoteSpy: ReturnType<typeof vi.spyOn>;
  let deleteNoteSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getNoteSpy = vi
      .spyOn(PzkNotesService.prototype, 'getNote')
      .mockResolvedValue(null);

    upsertNoteSpy = vi
      .spyOn(PzkNotesService.prototype, 'upsertNote')
      .mockResolvedValue({
        materialId: '00000000-0000-0000-0000-000000000001',
        content: 'Test note',
        updatedAt: '2025-12-30T12:00:00.000Z',
      });

    deleteNoteSpy = vi
      .spyOn(PzkNotesService.prototype, 'deleteNote')
      .mockResolvedValue(undefined);

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('GET - Fetch Note', () => {
    describe('SUCCESS - 200', () => {
      it('should return note when it exists', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const mockNote: PzkNoteDto = {
          materialId,
          content: 'My note content',
          updatedAt: '2025-12-30T12:00:00.000Z',
        };

        getNoteSpy.mockResolvedValue(mockNote);

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse<ApiResponse<PzkNoteDto>>(response);

        // Assert
        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toBe('application/json');
        expect(response.headers.get('Cache-Control')).toBe('no-store');

        expect(json.data).toBeDefined();
        expect(json.data!.materialId).toBe(materialId);
        expect(json.data!.content).toBe('My note content');
        expect(json.data!.updatedAt).toBe('2025-12-30T12:00:00.000Z');
        expect(json.error).toBeNull();

        expect(getNoteSpy).toHaveBeenCalledWith('patient-1', materialId);
      });

      it('should return null when note does not exist', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';

        getNoteSpy.mockResolvedValue(null);

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse<ApiResponse<PzkNoteDto | null>>(response);

        // Assert
        expect(response.status).toBe(200);
        expect(json.data).toBeNull();
        expect(json.error).toBeNull();

        expect(getNoteSpy).toHaveBeenCalledWith('patient-1', materialId);
      });
    });

    describe('ERROR - 400 Bad Request', () => {
      it('should return 400 when materialId is not a valid UUID', async () => {
        // Arrange
        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            'http://localhost/api/pzk/materials/invalid-id/note'
          ),
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

        expect(getNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 401 Unauthorized', () => {
      it('should return 401 when user is not authenticated', async () => {
        // Arrange
        const unauthLocals = createMockUnauthenticated();

        const context = createMockAPIContext({
          request: new Request(
            'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001/note'
          ),
          params: { materialId: '00000000-0000-0000-0000-000000000001' },
          locals: unauthLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(401);
        expect(json.error!.code).toBe('unauthorized');

        expect(getNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 403 Forbidden', () => {
      it('should return 403 when user is not a patient', async () => {
        // Arrange
        const dietitianLocals = createMockDietitian({ id: 'dietitian-1' });

        const context = createMockAPIContext({
          request: new Request(
            'http://localhost/api/pzk/materials/00000000-0000-0000-0000-000000000001/note'
          ),
          params: { materialId: '00000000-0000-0000-0000-000000000001' },
          locals: dietitianLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(403);
        expect(json.error!.code).toBe('forbidden');

        expect(getNoteSpy).not.toHaveBeenCalled();
      });

      it('should return 403 when user lacks module access', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';

        getNoteSpy.mockRejectedValue(
          new MaterialForbiddenError('no_module_access')
        );

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(403);
        expect(json.error!.code).toBe('forbidden');
        expect(json.error!.message).toContain('Brak');
      });
    });

    describe('ERROR - 404 Not Found', () => {
      it('should return 404 when material does not exist', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-999999999999';

        getNoteSpy.mockRejectedValue(
          new MaterialNotFoundError('Material not found')
        );

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(404);
        expect(json.error!.code).toBe('not_found');
      });
    });

    describe('ERROR - 500 Internal Server Error', () => {
      it('should return 500 when unexpected error occurs', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';

        getNoteSpy.mockRejectedValue(new Error('Unexpected database error'));

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await GET(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(500);
        expect(json.error!.code).toBe('internal_server_error');

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[GET /api/pzk/materials/:materialId/note] Error:',
          expect.any(Error)
        );
      });
    });
  });

  describe('PUT - Upsert Note', () => {
    describe('SUCCESS - 200', () => {
      it('should create or update note successfully', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const content = 'My updated note';

        const mockNote: PzkNoteDto = {
          materialId,
          content,
          updatedAt: '2025-12-30T12:00:00.000Z',
        };

        upsertNoteSpy.mockResolvedValue(mockNote);

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content }),
            }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse<ApiResponse<PzkNoteDto>>(response);

        // Assert
        expect(response.status).toBe(200);
        expect(json.data).toBeDefined();
        expect(json.data!.content).toBe(content);
        expect(json.error).toBeNull();

        expect(upsertNoteSpy).toHaveBeenCalledWith(
          'patient-1',
          materialId,
          content
        );
      });
    });

    describe('ERROR - 400 Bad Request', () => {
      it('should return 400 when materialId is invalid', async () => {
        // Arrange
        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            'http://localhost/api/pzk/materials/invalid-id/note',
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Test' }),
            }
          ),
          params: { materialId: 'invalid-id' },
          locals: patientLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(400);
        expect(json.error!.code).toBe('validation_error');

        expect(upsertNoteSpy).not.toHaveBeenCalled();
      });

      it('should return 400 when request body is invalid JSON', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: 'invalid json',
            }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(400);
        expect(json.error!.code).toBe('validation_error');
        expect(json.error!.message).toContain('JSON');

        expect(upsertNoteSpy).not.toHaveBeenCalled();
      });

      it('should return 400 when content is missing', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(400);
        expect(json.error!.code).toBe('validation_error');

        expect(upsertNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 401 Unauthorized', () => {
      it('should return 401 when user is not authenticated', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const unauthLocals = createMockUnauthenticated();

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Test' }),
            }
          ),
          params: { materialId },
          locals: unauthLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(401);
        expect(json.error!.code).toBe('unauthorized');

        expect(upsertNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 403 Forbidden', () => {
      it('should return 403 when user is not a patient', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const dietitianLocals = createMockDietitian({ id: 'dietitian-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Test' }),
            }
          ),
          params: { materialId },
          locals: dietitianLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(403);
        expect(json.error!.code).toBe('forbidden');

        expect(upsertNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 404 Not Found', () => {
      it('should return 404 when material does not exist', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-999999999999';

        upsertNoteSpy.mockRejectedValue(
          new MaterialNotFoundError('Material not found')
        );

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Test' }),
            }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(404);
        expect(json.error!.code).toBe('not_found');
      });
    });

    describe('ERROR - 500 Internal Server Error', () => {
      it('should return 500 when unexpected error occurs', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';

        upsertNoteSpy.mockRejectedValue(
          new Error('Unexpected database error')
        );

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: 'Test' }),
            }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await PUT(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(500);
        expect(json.error!.code).toBe('internal_server_error');

        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });

  describe('DELETE - Delete Note', () => {
    describe('SUCCESS - 204', () => {
      it('should delete note successfully (idempotent)', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            { method: 'DELETE' }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await DELETE(context);

        // Assert
        expect(response.status).toBe(204);
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(response.body).toBeNull();

        expect(deleteNoteSpy).toHaveBeenCalledWith('patient-1', materialId);
      });
    });

    describe('ERROR - 400 Bad Request', () => {
      it('should return 400 when materialId is invalid', async () => {
        // Arrange
        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            'http://localhost/api/pzk/materials/invalid-id/note',
            { method: 'DELETE' }
          ),
          params: { materialId: 'invalid-id' },
          locals: patientLocals,
        });

        // Act
        const response = await DELETE(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(400);
        expect(json.error!.code).toBe('validation_error');

        expect(deleteNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 401 Unauthorized', () => {
      it('should return 401 when user is not authenticated', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const unauthLocals = createMockUnauthenticated();

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            { method: 'DELETE' }
          ),
          params: { materialId },
          locals: unauthLocals,
        });

        // Act
        const response = await DELETE(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(401);
        expect(json.error!.code).toBe('unauthorized');

        expect(deleteNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 403 Forbidden', () => {
      it('should return 403 when user is not a patient', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';
        const dietitianLocals = createMockDietitian({ id: 'dietitian-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            { method: 'DELETE' }
          ),
          params: { materialId },
          locals: dietitianLocals,
        });

        // Act
        const response = await DELETE(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(403);
        expect(json.error!.code).toBe('forbidden');

        expect(deleteNoteSpy).not.toHaveBeenCalled();
      });
    });

    describe('ERROR - 404 Not Found', () => {
      it('should return 404 when material does not exist', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-999999999999';

        deleteNoteSpy.mockRejectedValue(
          new MaterialNotFoundError('Material not found')
        );

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            { method: 'DELETE' }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await DELETE(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(404);
        expect(json.error!.code).toBe('not_found');
      });
    });

    describe('ERROR - 500 Internal Server Error', () => {
      it('should return 500 when unexpected error occurs', async () => {
        // Arrange
        const materialId = '00000000-0000-0000-0000-000000000001';

        deleteNoteSpy.mockRejectedValue(
          new Error('Unexpected database error')
        );

        const patientLocals = createMockPatient({ id: 'patient-1' });

        const context = createMockAPIContext({
          request: new Request(
            `http://localhost/api/pzk/materials/${materialId}/note`,
            { method: 'DELETE' }
          ),
          params: { materialId },
          locals: patientLocals,
        });

        // Act
        const response = await DELETE(context);
        const json = await parseJSONResponse(response);

        // Assert
        expect(response.status).toBe(500);
        expect(json.error!.code).toBe('internal_server_error');

        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });
});
