import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/pages/api/pzk/access';
import { PzkAccessService } from '@/lib/services/pzkAccessService';
import type { PzkAccessSummary } from '@/types/pzk-dto';
import {
  createMockAPIContext,
  parseJSONResponse,
} from '../../../helpers/api-helper';
import {
  createMockPatient,
  createMockDietitian,
  createMockUnauthenticated,
} from '../../../helpers/auth-helper';

// Mock PzkAccessService
vi.mock('@/lib/services/pzkAccessService');

describe('GET /api/pzk/access - PZK Access Summary', () => {
  let getAccessSummarySpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getAccessSummarySpy = vi
      .spyOn(PzkAccessService.prototype, 'getAccessSummary')
      .mockResolvedValue({
        hasAnyActiveAccess: false,
        activeModules: [],
        access: [],
        serverTime: new Date('2024-01-01T12:00:00Z').toISOString(),
      });

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('SUCCESS - 200', () => {
    it('should return access summary for authenticated patient with no access', async () => {
      // Arrange
      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/access'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkAccessSummary>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Cache-Control')).toBe('no-store');

      expect(json.data).toBeDefined();
      expect(json.data!.hasAnyActiveAccess).toBe(false);
      expect(json.data!.activeModules).toEqual([]);
      expect(json.data!.access).toEqual([]);
      expect(json.data!.serverTime).toBeDefined();
      expect(json.error).toBeNull();

      expect(getAccessSummarySpy).toHaveBeenCalledWith('patient-1');
    });

    it('should return access summary with single active module', async () => {
      // Arrange
      const mockSummary: PzkAccessSummary = {
        hasAnyActiveAccess: true,
        activeModules: [1],
        access: [
          {
            module: 1,
            startAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            expiresAt: new Date('2025-01-01T00:00:00Z').toISOString(),
          },
        ],
        serverTime: new Date('2024-06-01T12:00:00Z').toISOString(),
      };

      getAccessSummarySpy.mockResolvedValue(mockSummary);

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/access'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkAccessSummary>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data!.hasAnyActiveAccess).toBe(true);
      expect(json.data!.activeModules).toEqual([1]);
      expect(json.data!.access).toHaveLength(1);
      expect(json.data!.access[0].module).toBe(1);
      expect(json.error).toBeNull();
    });

    it('should return access summary with multiple active modules', async () => {
      // Arrange
      const mockSummary: PzkAccessSummary = {
        hasAnyActiveAccess: true,
        activeModules: [1, 2, 3],
        access: [
          {
            module: 1,
            startAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            expiresAt: new Date('2025-01-01T00:00:00Z').toISOString(),
          },
          {
            module: 2,
            startAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            expiresAt: new Date('2025-01-01T00:00:00Z').toISOString(),
          },
          {
            module: 3,
            startAt: new Date('2024-01-01T00:00:00Z').toISOString(),
            expiresAt: new Date('2025-01-01T00:00:00Z').toISOString(),
          },
        ],
        serverTime: new Date('2024-06-01T12:00:00Z').toISOString(),
      };

      getAccessSummarySpy.mockResolvedValue(mockSummary);

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/access'),
        locals: patientLocals,
      });

      // Act
      const response = await GET(context);
      const json = await parseJSONResponse<PzkAccessSummary>(response);

      // Assert
      expect(response.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data!.hasAnyActiveAccess).toBe(true);
      expect(json.data!.activeModules).toEqual([1, 2, 3]);
      expect(json.data!.access).toHaveLength(3);
      expect(json.error).toBeNull();
    });
  });

  describe('ERROR - 401 Unauthorized', () => {
    it('should return 401 when user is not authenticated', async () => {
      // Arrange
      const unauthLocals = createMockUnauthenticated();

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/access'),
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
      expect(getAccessSummarySpy).not.toHaveBeenCalled();
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
        request: new Request('http://localhost/api/pzk/access'),
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
      expect(getAccessSummarySpy).not.toHaveBeenCalled();
    });
  });

  describe('ERROR - 500 Internal Server Error', () => {
    it('should return 500 when service throws unexpected error', async () => {
      // Arrange
      getAccessSummarySpy.mockRejectedValue(
        new Error('Unexpected database error')
      );

      const patientLocals = createMockPatient({
        id: 'patient-1',
        email: 'patient@example.com',
      });

      const context = createMockAPIContext({
        request: new Request('http://localhost/api/pzk/access'),
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
        '[GET /api/pzk/access] Error:',
        expect.any(Error)
      );
    });
  });
});
