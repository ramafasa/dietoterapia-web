import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { normalizeViewToDates, normalizeToStartOfDay, formatToDateString } from '@/utils/dates';
import { format, subDays } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

describe('dates utils', () => {
  describe('normalizeViewToDates', () => {
    let mockNow: Date;

    beforeEach(() => {
      // Mock date: 2025-01-15 14:30:00 UTC
      mockNow = new Date('2025-01-15T14:30:00Z');
      vi.setSystemTime(mockNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns today\'s date for view=today', () => {
      const result = normalizeViewToDates('today');

      // Expected: dzisiaj w strefie Europe/Warsaw
      const warsawNow = toZonedTime(mockNow, 'Europe/Warsaw');
      const expected = format(warsawNow, 'yyyy-MM-dd');

      expect(result).toEqual({
        startDate: expected,
        endDate: expected,
      });
    });

    it('returns 7-day rolling window for view=week', () => {
      const result = normalizeViewToDates('week');

      // Expected: ostatnie 7 dni (rolling window)
      const warsawNow = toZonedTime(mockNow, 'Europe/Warsaw');
      const today = format(warsawNow, 'yyyy-MM-dd');
      const weekAgo = format(subDays(warsawNow, 6), 'yyyy-MM-dd');

      expect(result).toEqual({
        startDate: weekAgo,
        endDate: today,
      });
    });

    it('returns provided dates for view=range', () => {
      const startDate = '2025-01-01';
      const endDate = '2025-01-10';

      const result = normalizeViewToDates('range', startDate, endDate);

      expect(result).toEqual({
        startDate: '2025-01-01',
        endDate: '2025-01-10',
      });
    });

    it('throws error when view=range but dates are missing', () => {
      expect(() => normalizeViewToDates('range')).toThrow(
        'startDate and endDate are required for view=range'
      );

      expect(() => normalizeViewToDates('range', '2025-01-01')).toThrow(
        'startDate and endDate are required for view=range'
      );
    });

    it('throws error for invalid view', () => {
      // @ts-expect-error Testing invalid input
      expect(() => normalizeViewToDates('invalid')).toThrow(
        'Invalid view: invalid'
      );
    });
  });

  describe('normalizeToStartOfDay', () => {
    it('normalizes date to start of day (00:00:00.000)', () => {
      const date = new Date('2025-01-15T14:30:45.123Z');
      const result = normalizeToStartOfDay(date);

      // Expected: 2025-01-15T00:00:00.000 in local timezone
      // startOfDay uses local timezone, not UTC
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
      expect(format(result, 'yyyy-MM-dd')).toBe('2025-01-15');
    });

    it('handles date already at start of day', () => {
      const date = new Date('2025-01-15T00:00:00.000Z');
      const result = normalizeToStartOfDay(date);

      // Should normalize to start of day in local timezone
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe('formatToDateString', () => {
    it('formats date to YYYY-MM-DD', () => {
      const date = new Date('2025-01-15T14:30:45.123Z');
      const result = formatToDateString(date);

      expect(result).toBe('2025-01-15');
    });

    it('handles dates with single-digit day/month', () => {
      const date = new Date('2025-03-05T10:00:00Z');
      const result = formatToDateString(date);

      expect(result).toBe('2025-03-05');
    });

    it('handles leap year dates', () => {
      const date = new Date('2024-02-29T12:00:00Z');
      const result = formatToDateString(date);

      expect(result).toBe('2024-02-29');
    });
  });
});
