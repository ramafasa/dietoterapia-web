import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { isWithinEditWindow } from '@/utils/editWindow';
import { subDays } from 'date-fns';

describe('editWindow utils', () => {
  describe('isWithinEditWindow', () => {
    let mockNow: Date;

    beforeEach(() => {
      // Mock date: 2025-01-15 12:00:00 UTC (13:00 CET)
      mockNow = new Date('2025-01-15T12:00:00Z');
      vi.setSystemTime(mockNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns true when entry is from today', () => {
      // Measurement today: 2025-01-15 10:00 UTC
      const measurementDate = new Date('2025-01-15T10:00:00Z');
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(true);
    });

    it('returns true when entry is from yesterday (within edit window)', () => {
      // Measurement yesterday: 2025-01-14 10:00 UTC
      // Edit window until end of 2025-01-15 (today) in Europe/Warsaw
      const measurementDate = subDays(mockNow, 1);
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(true);
    });

    it('returns false when entry is from 2 days ago (edit window expired)', () => {
      // Measurement 2 days ago: 2025-01-13
      // Edit window expired (ended at 2025-01-14 23:59:59 CET)
      const measurementDate = subDays(mockNow, 2);
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(false);
    });

    it('returns false when entry is from 3+ days ago', () => {
      const measurementDate = subDays(mockNow, 3);
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(false);
    });

    it('handles Date objects', () => {
      const measurementDate = new Date('2025-01-15T08:00:00Z');
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(true);
    });

    it('handles ISO string dates', () => {
      const measurementDate = '2025-01-15T08:00:00Z';
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(true);
    });

    it('returns true at the exact deadline (end of next day)', () => {
      // Mock time: 2025-01-15 22:59:59 UTC (23:59:59 CET)
      vi.setSystemTime(new Date('2025-01-15T22:59:59Z'));

      // Measurement yesterday: 2025-01-14
      // Edit window until 2025-01-15 23:59:59 CET (22:59:59 UTC)
      const measurementDate = new Date('2025-01-14T10:00:00Z');
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(true);
    });

    it('returns false 1 second after deadline', () => {
      // Mock time: 2025-01-15 23:00:00 UTC (00:00:00 CET on 2025-01-16)
      vi.setSystemTime(new Date('2025-01-15T23:00:00Z'));

      // Measurement 2 days ago: 2025-01-14
      // Edit window expired (ended at 2025-01-15 23:59:59 CET)
      const measurementDate = new Date('2025-01-14T10:00:00Z');
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(false);
    });

    it('handles timezone edge cases around DST transitions', () => {
      // Note: This is a simplified test - in production, DST transitions
      // should be handled by date-fns-tz correctly

      // Mock time: March during potential DST change
      vi.setSystemTime(new Date('2025-03-30T12:00:00Z'));

      // Measurement yesterday
      const measurementDate = new Date('2025-03-29T10:00:00Z');
      const result = isWithinEditWindow(measurementDate);

      expect(result).toBe(true);
    });
  });
});
