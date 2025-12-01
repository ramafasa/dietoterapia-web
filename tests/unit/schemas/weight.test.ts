import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  createWeightEntrySchema,
  updateWeightEntrySchema,
  confirmOutlierSchema,
  getWeightHistoryQuerySchema,
} from '@/schemas/weight';

describe('weight schemas', () => {
  describe('createWeightEntrySchema', () => {
    let mockNow: Date;

    beforeEach(() => {
      // Mock date: 2025-01-15
      mockNow = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(mockNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('validates correct weight entry data', () => {
      const validData = {
        weight: 70.5,
        measurementDate: '2025-01-15',
        note: 'Feeling good today',
      };

      const result = createWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('validates weight with ISO 8601 full timestamp', () => {
      const validData = {
        weight: 70.5,
        measurementDate: '2025-01-15T08:00:00+01:00',
      };

      const result = createWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('validates weight without note (optional)', () => {
      const validData = {
        weight: 70.5,
        measurementDate: '2025-01-15',
      };

      const result = createWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects weight below minimum (30.0 kg)', () => {
      const invalidData = {
        weight: 29.9,
        measurementDate: '2025-01-15',
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('30.0 kg');
      }
    });

    it('rejects weight above maximum (250.0 kg)', () => {
      const invalidData = {
        weight: 250.1,
        measurementDate: '2025-01-15',
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('250.0 kg');
      }
    });

    it('rejects weight with more than 1 decimal place', () => {
      const invalidData = {
        weight: 70.123,
        measurementDate: '2025-01-15',
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('1 miejsce po przecinku');
      }
    });

    it('rejects invalid date format', () => {
      const invalidData = {
        weight: 70.5,
        measurementDate: '15-01-2025', // Wrong format
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('ISO 8601');
      }
    });

    it('rejects future date', () => {
      const invalidData = {
        weight: 70.5,
        measurementDate: '2025-01-20', // 5 days in future from mocked date
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('przyszłej daty');
      }
    });

    it('rejects date more than 7 days ago', () => {
      const invalidData = {
        weight: 70.5,
        measurementDate: '2025-01-05', // 10 days ago from mocked date
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('7 dni wstecz');
      }
    });

    it('accepts date exactly 7 days ago', () => {
      const validData = {
        weight: 70.5,
        measurementDate: '2025-01-08', // Exactly 7 days ago
      };

      const result = createWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('accepts today\'s date', () => {
      const validData = {
        weight: 70.5,
        measurementDate: '2025-01-15', // Today
      };

      const result = createWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects note longer than 200 characters', () => {
      const invalidData = {
        weight: 70.5,
        measurementDate: '2025-01-15',
        note: 'a'.repeat(201),
      };

      const result = createWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('200 znaków');
      }
    });

    it('accepts note with exactly 200 characters', () => {
      const validData = {
        weight: 70.5,
        measurementDate: '2025-01-15',
        note: 'a'.repeat(200),
      };

      const result = createWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });

  describe('updateWeightEntrySchema', () => {
    it('validates correct update data', () => {
      const validData = {
        weight: 71.0,
        note: 'Updated note',
      };

      const result = updateWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('validates update with only weight', () => {
      const validData = {
        weight: 71.0,
      };

      const result = updateWeightEntrySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects update with only note (weight is required)', () => {
      const invalidData = {
        note: 'New note',
      };

      const result = updateWeightEntrySchema.safeParse(invalidData);

      // Weight is required, so this should fail
      expect(result.success).toBe(false);
    });

    it('rejects invalid weight range', () => {
      const invalidData = {
        weight: 29.0, // Below minimum
      };

      const result = updateWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects note longer than 200 characters', () => {
      const invalidData = {
        note: 'a'.repeat(201),
      };

      const result = updateWeightEntrySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('confirmOutlierSchema', () => {
    it('validates confirmed=true', () => {
      const validData = { confirmed: true };

      const result = confirmOutlierSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('validates confirmed=false', () => {
      const validData = { confirmed: false };

      const result = confirmOutlierSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects missing confirmed field', () => {
      const invalidData = {};

      const result = confirmOutlierSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('wymagane');
      }
    });

    it('rejects non-boolean confirmed value', () => {
      const invalidData = { confirmed: 'true' }; // String instead of boolean

      const result = confirmOutlierSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('getWeightHistoryQuerySchema', () => {
    it('validates query with no parameters (uses defaults)', () => {
      const validData = {};

      const result = getWeightHistoryQuerySchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(30); // Default limit
      }
    });

    it('validates query with startDate and endDate', () => {
      const validData = {
        startDate: '2025-01-01',
        endDate: '2025-01-15',
      };

      const result = getWeightHistoryQuerySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('validates query with custom limit', () => {
      const validData = {
        limit: '50',
      };

      const result = getWeightHistoryQuerySchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(50);
      }
    });

    it('validates query with cursor for pagination', () => {
      const validData = {
        cursor: '2025-01-15T12:00:00Z',
      };

      const result = getWeightHistoryQuerySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects invalid startDate format', () => {
      const invalidData = {
        startDate: 'invalid-date',
      };

      const result = getWeightHistoryQuerySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects invalid endDate format', () => {
      const invalidData = {
        endDate: 'invalid-date',
      };

      const result = getWeightHistoryQuerySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects limit less than 1', () => {
      const invalidData = {
        limit: '0',
      };

      const result = getWeightHistoryQuerySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects limit greater than 100', () => {
      const invalidData = {
        limit: '101',
      };

      const result = getWeightHistoryQuerySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects startDate later than endDate', () => {
      const invalidData = {
        startDate: '2025-01-15',
        endDate: '2025-01-01', // Earlier than startDate
      };

      const result = getWeightHistoryQuerySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('startDate');
        expect(result.error.issues[0].message).toContain('endDate');
      }
    });

    it('accepts startDate equal to endDate', () => {
      const validData = {
        startDate: '2025-01-15',
        endDate: '2025-01-15',
      };

      const result = getWeightHistoryQuerySchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects invalid cursor format', () => {
      const invalidData = {
        cursor: 'not-a-timestamp',
      };

      const result = getWeightHistoryQuerySchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('transforms string limit to number', () => {
      const validData = {
        limit: '75',
      };

      const result = getWeightHistoryQuerySchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(typeof result.data.limit).toBe('number');
        expect(result.data.limit).toBe(75);
      }
    });
  });
});
