import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  cleanDatabase,
} from '../../helpers/db-container';
import { createPatient, createPzkModuleAccess } from '../../fixtures';
import { PzkAccessRepository } from '@/lib/repositories/pzkAccessRepository';

describe('PzkAccessRepository', () => {
  let db: any;
  let repository: PzkAccessRepository;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
    repository = new PzkAccessRepository(db);
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('listActiveAccessByUserId()', () => {
    it('should return empty array for user without access', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date();

      // Act
      const result = await repository.listActiveAccessByUserId(patient.id, now);

      // Assert
      expect(result).toEqual([]);
    });

    it('should return only active access (filters expired)', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      // Expired access (expiresAt < now)
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2023-01-01T00:00:00Z'),
        expiresAt: new Date('2024-01-01T00:00:00Z'), // Expired 5 months ago
      });

      // Active access (startAt <= now < expiresAt)
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'), // Valid until December
      });

      // Act
      const result = await repository.listActiveAccessByUserId(patient.id, now);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe(2);
    });

    it('should filter out revoked access (revokedAt IS NOT NULL)', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      // Revoked access (even if technically valid)
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
        revokedAt: new Date('2024-05-01T00:00:00Z'), // Revoked
      });

      // Active access
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
        revokedAt: null,
      });

      // Act
      const result = await repository.listActiveAccessByUserId(patient.id, now);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe(2);
    });

    it('should filter out access that has not started yet (startAt > now)', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      // Future access (startAt > now)
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2024-07-01T00:00:00Z'), // Starts in 1 month
        expiresAt: new Date('2025-07-01T00:00:00Z'),
      });

      // Active access
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
      });

      // Act
      const result = await repository.listActiveAccessByUserId(patient.id, now);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].module).toBe(2);
    });

    it('should use custom timestamp for "now"', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2024-01-01T00:00:00Z'),
        expiresAt: new Date('2024-06-30T23:59:59Z'),
      });

      // Act: Check with timestamp BEFORE expiry
      const nowBefore = new Date('2024-06-01T12:00:00Z');
      const resultBefore = await repository.listActiveAccessByUserId(patient.id, nowBefore);

      // Act: Check with timestamp AFTER expiry
      const nowAfter = new Date('2024-07-01T00:00:00Z');
      const resultAfter = await repository.listActiveAccessByUserId(patient.id, nowAfter);

      // Assert
      expect(resultBefore).toHaveLength(1); // Active before expiry
      expect(resultAfter).toHaveLength(0); // Expired after expiry
    });

    it('should return multiple active access records sorted by module ASC', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      // Create access in non-sorted order: 3, 1, 2
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 3,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
      });
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
      });
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
      });

      // Act
      const result = await repository.listActiveAccessByUserId(patient.id, now);

      // Assert
      expect(result).toHaveLength(3);
      expect(result[0].module).toBe(1); // Sorted ASC
      expect(result[1].module).toBe(2);
      expect(result[2].module).toBe(3);
    });

    it('should return correct fields: module, startAt, expiresAt', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');
      const startAt = new Date('2023-06-01T00:00:00Z');
      const expiresAt = new Date('2024-12-01T00:00:00Z');

      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt,
        expiresAt,
      });

      // Act
      const result = await repository.listActiveAccessByUserId(patient.id, now);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        module: 2,
        startAt,
        expiresAt,
      });
    });
  });

  describe('hasActiveAccessToModule()', () => {
    it('should return true for user with active access to specific module', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
      });

      // Act
      const result = await repository.hasActiveAccessToModule(patient.id, 2, now);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for user without access to specific module', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
      });

      // Act: Check access to module 2 (user only has module 1)
      const result = await repository.hasActiveAccessToModule(patient.id, 2, now);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for expired access to specific module', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-01-01T00:00:00Z'),
        expiresAt: new Date('2024-01-01T00:00:00Z'), // Expired 5 months ago
      });

      // Act
      const result = await repository.hasActiveAccessToModule(patient.id, 2, now);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for revoked access to specific module', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2023-06-01T00:00:00Z'),
        expiresAt: new Date('2024-12-01T00:00:00Z'),
        revokedAt: new Date('2024-05-01T00:00:00Z'), // Revoked
      });

      // Act
      const result = await repository.hasActiveAccessToModule(patient.id, 2, now);

      // Assert
      expect(result).toBe(false);
    });

    it('should return false for access that has not started yet', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      const now = new Date('2024-06-01T12:00:00Z');

      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 2,
        startAt: new Date('2024-07-01T00:00:00Z'), // Starts in 1 month
        expiresAt: new Date('2025-07-01T00:00:00Z'),
      });

      // Act
      const result = await repository.hasActiveAccessToModule(patient.id, 2, now);

      // Assert
      expect(result).toBe(false);
    });

    it('should use custom timestamp for "now"', async () => {
      // Arrange
      const patient = await createPatient(db, { email: 'test@example.com' });
      await createPzkModuleAccess(db, {
        userId: patient.id,
        module: 1,
        startAt: new Date('2024-01-01T00:00:00Z'),
        expiresAt: new Date('2024-06-30T23:59:59Z'),
      });

      // Act: Check BEFORE expiry
      const nowBefore = new Date('2024-06-01T12:00:00Z');
      const resultBefore = await repository.hasActiveAccessToModule(
        patient.id,
        1,
        nowBefore
      );

      // Act: Check AFTER expiry
      const nowAfter = new Date('2024-07-01T00:00:00Z');
      const resultAfter = await repository.hasActiveAccessToModule(
        patient.id,
        1,
        nowAfter
      );

      // Assert
      expect(resultBefore).toBe(true); // Active before expiry
      expect(resultAfter).toBe(false); // Expired after expiry
    });
  });
});
