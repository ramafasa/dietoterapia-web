import { describe, expect, it } from 'vitest';
import { calculateMA7, calculateWeightStatistics } from '@/utils/chartCalculations';

describe('chartCalculations utils', () => {
  describe('calculateMA7', () => {
    it('calculates MA7 for 7 or more entries', () => {
      const weights = [70.0, 70.5, 71.0, 70.8, 70.3, 70.1, 70.0, 69.8];
      //                                                          ^^^^^ index 6
      // Window for index 6: [70.5, 71.0, 70.8, 70.3, 70.1, 70.0, 69.8]
      // Sum: 492.5, Average: 492.5 / 7 = 70.357...
      // Rounded to 1 decimal: 70.4

      const result = calculateMA7(weights, 6);

      expect(result).toBe(70.4);
    });

    it('calculates MA7 for less than 7 entries', () => {
      const weights = [70.0, 70.5, 71.0];
      // Window for index 2: [70.0, 70.5, 71.0]
      // Sum: 211.5, Average: 211.5 / 3 = 70.5

      const result = calculateMA7(weights, 2);

      expect(result).toBe(70.5);
    });

    it('calculates MA7 for single entry', () => {
      const weights = [70.0];
      // Window for index 0: [70.0]
      // Average: 70.0

      const result = calculateMA7(weights, 0);

      expect(result).toBe(70.0);
    });

    it('calculates MA7 at start of array', () => {
      const weights = [70.0, 70.5, 71.0, 70.8, 70.3];
      // Window for index 0: [70.0]
      // Average: 70.0

      const result = calculateMA7(weights, 0);

      expect(result).toBe(70.0);
    });

    it('calculates MA7 at end of long array', () => {
      const weights = [70.0, 70.5, 71.0, 70.8, 70.3, 70.1, 70.0, 69.8, 69.5, 69.3];
      // Window for index 9: [70.8, 70.3, 70.1, 70.0, 69.8, 69.5, 69.3]
      // Sum: 489.8, Average: 489.8 / 7 = 69.971...
      // Rounded to 1 decimal: 70.0

      const result = calculateMA7(weights, 9);

      expect(result).toBe(70.0);
    });

    it('rounds correctly to 1 decimal place', () => {
      const weights = [70.11, 70.22, 70.33, 70.44, 70.55, 70.66, 70.77];
      // Sum: 493.08, Average: 493.08 / 7 = 70.44
      // Rounded: 70.4

      const result = calculateMA7(weights, 6);

      expect(result).toBe(70.4);
    });

    it('handles weights with varying precision', () => {
      const weights = [70, 70.1, 70.123, 70.999, 71.5];
      // Window for index 4: [70, 70.1, 70.123, 70.999, 71.5]
      // Sum: 352.722, Average: 352.722 / 5 = 70.5444
      // Rounded: 70.5

      const result = calculateMA7(weights, 4);

      expect(result).toBe(70.5);
    });
  });

  describe('calculateWeightStatistics', () => {
    it('returns zero statistics for empty array', () => {
      const entries: Array<{ weight: number; measurementDate: Date }> = [];

      const result = calculateWeightStatistics(entries);

      expect(result).toEqual({
        startWeight: 0,
        endWeight: 0,
        change: 0,
        changePercent: 0,
        avgWeeklyChange: 0,
        trendDirection: 'stable',
      });
    });

    it('returns stable statistics for single entry', () => {
      const entries = [
        { weight: 70.0, measurementDate: new Date('2025-01-15') },
      ];

      const result = calculateWeightStatistics(entries);

      expect(result).toEqual({
        startWeight: 70.0,
        endWeight: 70.0,
        change: 0,
        changePercent: 0,
        avgWeeklyChange: 0,
        trendDirection: 'stable',
      });
    });

    it('calculates decreasing trend (weight loss)', () => {
      const entries = [
        { weight: 80.0, measurementDate: new Date('2025-01-01') },
        { weight: 79.5, measurementDate: new Date('2025-01-03') },
        { weight: 79.0, measurementDate: new Date('2025-01-05') },
        { weight: 78.5, measurementDate: new Date('2025-01-07') },
        { weight: 78.0, measurementDate: new Date('2025-01-10') }, // 9 days total
      ];

      const result = calculateWeightStatistics(entries);

      // Change: 78.0 - 80.0 = -2.0 kg
      // Change %: (-2.0 / 80.0) * 100 = -2.5%
      // Days: 9
      // Daily change: -2.0 / 9 = -0.222 kg/day
      // Weekly change: -0.222 * 7 = -1.556 kg/week → -1.6 kg/week

      expect(result.startWeight).toBe(80.0);
      expect(result.endWeight).toBe(78.0);
      expect(result.change).toBe(-2.0);
      expect(result.changePercent).toBe(-2.5);
      expect(result.avgWeeklyChange).toBe(-1.6);
      expect(result.trendDirection).toBe('decreasing');
    });

    it('calculates increasing trend (weight gain)', () => {
      const entries = [
        { weight: 65.0, measurementDate: new Date('2025-01-01') },
        { weight: 65.5, measurementDate: new Date('2025-01-08') }, // 7 days
      ];

      const result = calculateWeightStatistics(entries);

      // Change: 65.5 - 65.0 = 0.5 kg
      // Change %: (0.5 / 65.0) * 100 = 0.769... → 0.8%
      // Days: 7
      // Weekly change: 0.5 kg/week

      expect(result.startWeight).toBe(65.0);
      expect(result.endWeight).toBe(65.5);
      expect(result.change).toBe(0.5);
      expect(result.changePercent).toBe(0.8);
      expect(result.avgWeeklyChange).toBe(0.5);
      expect(result.trendDirection).toBe('increasing');
    });

    it('calculates stable trend (minimal change)', () => {
      const entries = [
        { weight: 70.0, measurementDate: new Date('2025-01-01') },
        { weight: 70.05, measurementDate: new Date('2025-01-15') }, // 14 days
      ];

      const result = calculateWeightStatistics(entries);

      // Change: 70.05 - 70.0 = 0.05 kg
      // Rounded change: Math.round(0.05 * 10) / 10 = Math.round(0.5) / 10 = 0 / 10 = 0
      // (JavaScript rounds 0.5 down to 0)
      // Change %: (change / 70.0) * 100 = (0 / 70.0) * 100 = 0%
      // Weekly change: (0 / 14) * 7 = 0.0 kg/week

      expect(result.startWeight).toBe(70.0);
      expect(result.endWeight).toBe(70.05);
      expect(result.change).toBe(0); // Rounded to 0 (not 0.1)
      expect(result.changePercent).toBe(0); // Based on rounded change
      expect(result.avgWeeklyChange).toBe(0.0);
      expect(result.trendDirection).toBe('stable');
    });

    it('handles entries on same day (0 days difference)', () => {
      const entries = [
        { weight: 70.0, measurementDate: new Date('2025-01-15T08:00:00Z') },
        { weight: 70.5, measurementDate: new Date('2025-01-15T18:00:00Z') },
      ];

      const result = calculateWeightStatistics(entries);

      // Change: 70.5 - 70.0 = 0.5 kg
      // Days: 0 (same day)
      // Weekly change: 0 (can't calculate daily rate)

      expect(result.startWeight).toBe(70.0);
      expect(result.endWeight).toBe(70.5);
      expect(result.change).toBe(0.5);
      expect(result.changePercent).toBe(0.7); // (0.5 / 70.0) * 100 = 0.714... → 0.7
      expect(result.avgWeeklyChange).toBe(0);
      expect(result.trendDirection).toBe('increasing');
    });

    it('handles zero start weight gracefully', () => {
      const entries = [
        { weight: 0, measurementDate: new Date('2025-01-01') },
        { weight: 70.0, measurementDate: new Date('2025-01-08') },
      ];

      const result = calculateWeightStatistics(entries);

      // Change: 70.0 - 0 = 70.0 kg
      // Change %: can't divide by zero → 0%

      expect(result.startWeight).toBe(0);
      expect(result.endWeight).toBe(70.0);
      expect(result.change).toBe(70.0);
      expect(result.changePercent).toBe(0); // Division by zero handled
      expect(result.trendDirection).toBe('increasing');
    });

    it('calculates statistics for long period (30 days)', () => {
      const entries = [
        { weight: 90.0, measurementDate: new Date('2025-01-01') },
        { weight: 88.0, measurementDate: new Date('2025-01-31') }, // 30 days
      ];

      const result = calculateWeightStatistics(entries);

      // Change: 88.0 - 90.0 = -2.0 kg
      // Change %: (-2.0 / 90.0) * 100 = -2.222... → -2.2%
      // Days: 30
      // Daily change: -2.0 / 30 = -0.0667 kg/day
      // Weekly change: -0.0667 * 7 = -0.467 kg/week → -0.5 kg/week

      expect(result.startWeight).toBe(90.0);
      expect(result.endWeight).toBe(88.0);
      expect(result.change).toBe(-2.0);
      expect(result.changePercent).toBe(-2.2);
      expect(result.avgWeeklyChange).toBe(-0.5);
      expect(result.trendDirection).toBe('decreasing');
    });

    it('handles exact threshold for trend direction (0.1 kg)', () => {
      const entries1 = [
        { weight: 70.0, measurementDate: new Date('2025-01-01') },
        { weight: 70.11, measurementDate: new Date('2025-01-08') },
      ];

      const entries2 = [
        { weight: 70.0, measurementDate: new Date('2025-01-01') },
        { weight: 69.89, measurementDate: new Date('2025-01-08') },
      ];

      const result1 = calculateWeightStatistics(entries1);
      const result2 = calculateWeightStatistics(entries2);

      // Change > 0.1 → increasing
      expect(result1.change).toBe(0.1); // 70.11 - 70.0 = 0.11 → rounded to 0.1
      expect(result1.trendDirection).toBe('stable'); // After rounding, exactly 0.1 → stable

      // Change < -0.1 → decreasing
      expect(result2.change).toBe(-0.1); // 69.89 - 70.0 = -0.11 → rounded to -0.1
      expect(result2.trendDirection).toBe('stable'); // After rounding, exactly -0.1 → stable
    });
  });
});
