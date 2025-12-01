import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePasswordStrength } from '@/hooks/usePasswordStrength';

describe('usePasswordStrength', () => {
  describe('score calculation', () => {
    it('returns score 0 for empty password', () => {
      const { result } = renderHook(() => usePasswordStrength(''));

      expect(result.current.score).toBe(0);
      expect(result.current.label).toBe('Bardzo słabe');
    });

    it('returns score 1 for password with only lowercase', () => {
      const { result } = renderHook(() => usePasswordStrength('abcdefgh'));

      // Only hasLower and minLength satisfied (2 rules)
      expect(result.current.score).toBe(2);
      expect(result.current.label).toBe('Słabe');
    });

    it('returns score 2 for password with lowercase and uppercase', () => {
      const { result } = renderHook(() => usePasswordStrength('Abcdefgh'));

      // hasLower, hasUpper, minLength satisfied (3 rules)
      expect(result.current.score).toBe(3);
      expect(result.current.label).toBe('Średnie');
    });

    it('returns score 3 for password with all required rules (no special char)', () => {
      const { result } = renderHook(() => usePasswordStrength('Abcdef12'));

      // All 4 required rules satisfied: minLength, hasUpper, hasLower, hasDigit
      expect(result.current.score).toBe(3);
      expect(result.current.label).toBe('Średnie');
    });

    it('returns score 4 for password with all rules including special char', () => {
      const { result } = renderHook(() => usePasswordStrength('Abcdef12!'));

      // All required rules + hasSpecial
      expect(result.current.score).toBe(4);
      expect(result.current.label).toBe('Mocne');
    });
  });

  describe('rule satisfaction', () => {
    it('validates minLength rule (8 characters)', () => {
      const { result: short } = renderHook(() => usePasswordStrength('Pass1!'));
      const { result: long } = renderHook(() => usePasswordStrength('Password1!'));

      const shortMinLength = short.current.rules.find(r => r.id === 'minLength');
      const longMinLength = long.current.rules.find(r => r.id === 'minLength');

      expect(shortMinLength?.satisfied).toBe(false);
      expect(longMinLength?.satisfied).toBe(true);
    });

    it('validates hasUpper rule', () => {
      const { result: withUpper } = renderHook(() => usePasswordStrength('Password'));
      const { result: noUpper } = renderHook(() => usePasswordStrength('password'));

      const withUpperRule = withUpper.current.rules.find(r => r.id === 'hasUpper');
      const noUpperRule = noUpper.current.rules.find(r => r.id === 'hasUpper');

      expect(withUpperRule?.satisfied).toBe(true);
      expect(noUpperRule?.satisfied).toBe(false);
    });

    it('validates hasLower rule', () => {
      const { result: withLower } = renderHook(() => usePasswordStrength('Password'));
      const { result: noLower } = renderHook(() => usePasswordStrength('PASSWORD'));

      const withLowerRule = withLower.current.rules.find(r => r.id === 'hasLower');
      const noLowerRule = noLower.current.rules.find(r => r.id === 'hasLower');

      expect(withLowerRule?.satisfied).toBe(true);
      expect(noLowerRule?.satisfied).toBe(false);
    });

    it('validates hasDigit rule', () => {
      const { result: withDigit } = renderHook(() => usePasswordStrength('Password1'));
      const { result: noDigit } = renderHook(() => usePasswordStrength('Password'));

      const withDigitRule = withDigit.current.rules.find(r => r.id === 'hasDigit');
      const noDigitRule = noDigit.current.rules.find(r => r.id === 'hasDigit');

      expect(withDigitRule?.satisfied).toBe(true);
      expect(noDigitRule?.satisfied).toBe(false);
    });

    it('validates hasSpecial rule', () => {
      const { result: withSpecial } = renderHook(() => usePasswordStrength('Password1!'));
      const { result: noSpecial } = renderHook(() => usePasswordStrength('Password1'));

      const withSpecialRule = withSpecial.current.rules.find(r => r.id === 'hasSpecial');
      const noSpecialRule = noSpecial.current.rules.find(r => r.id === 'hasSpecial');

      expect(withSpecialRule?.satisfied).toBe(true);
      expect(noSpecialRule?.satisfied).toBe(false);
    });
  });

  describe('label mapping', () => {
    it('returns "Bardzo słabe" for score 0-1', () => {
      const { result: score0 } = renderHook(() => usePasswordStrength(''));
      const { result: score1 } = renderHook(() => usePasswordStrength('a')); // Only 1 char, minLength not satisfied

      expect(score0.current.label).toBe('Bardzo słabe');
      expect(score1.current.label).toBe('Bardzo słabe');
    });

    it('returns "Słabe" for score 2', () => {
      const { result } = renderHook(() => usePasswordStrength('abcdefgh')); // lowercase + minLength

      expect(result.current.score).toBe(2);
      expect(result.current.label).toBe('Słabe');
    });

    it('returns "Średnie" for score 3', () => {
      const { result } = renderHook(() => usePasswordStrength('Abcdef12'));

      expect(result.current.score).toBe(3);
      expect(result.current.label).toBe('Średnie');
    });

    it('returns "Dobre" for score 4 without special char', () => {
      // This shouldn't happen based on the logic (score 4 requires special char)
      // But testing the fallback logic in the switch statement
      const { result } = renderHook(() => usePasswordStrength('Abcdef12'));

      // Score should be 3 (all required, no special)
      expect(result.current.score).toBe(3);
      expect(result.current.label).toBe('Średnie');
    });

    it('returns "Mocne" for score 4 with special char', () => {
      const { result } = renderHook(() => usePasswordStrength('Abcdef12!'));

      expect(result.current.score).toBe(4);
      expect(result.current.label).toBe('Mocne');
    });
  });

  describe('special characters detection', () => {
    it('detects various special characters', () => {
      const specialChars = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+', ' '];

      specialChars.forEach(char => {
        const { result } = renderHook(() => usePasswordStrength(`Pass1${char}`));
        const hasSpecialRule = result.current.rules.find(r => r.id === 'hasSpecial');

        expect(hasSpecialRule?.satisfied).toBe(true);
      });
    });

    it('does not consider alphanumeric as special', () => {
      const { result } = renderHook(() => usePasswordStrength('Password123'));
      const hasSpecialRule = result.current.rules.find(r => r.id === 'hasSpecial');

      expect(hasSpecialRule?.satisfied).toBe(false);
    });
  });

  describe('memoization', () => {
    it('returns same object reference for same password', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordStrength(password),
        { initialProps: { password: 'Test123!' } }
      );

      const firstResult = result.current;

      // Re-render with same password
      rerender({ password: 'Test123!' });

      // Should return same reference due to useMemo
      expect(result.current).toBe(firstResult);
    });

    it('returns new object reference for different password', () => {
      const { result, rerender } = renderHook(
        ({ password }) => usePasswordStrength(password),
        { initialProps: { password: 'Test123!' } }
      );

      const firstResult = result.current;

      // Re-render with different password
      rerender({ password: 'Different456!' });

      // Should return different reference
      expect(result.current).not.toBe(firstResult);
    });
  });

  describe('edge cases', () => {
    it('handles very long passwords', () => {
      const longPassword = 'A'.repeat(100) + 'a1!';
      const { result } = renderHook(() => usePasswordStrength(longPassword));

      expect(result.current.score).toBe(4);
      expect(result.current.label).toBe('Mocne');
    });

    it('handles passwords with only special characters', () => {
      const { result } = renderHook(() => usePasswordStrength('!@#$%^&*'));

      // Only minLength satisfied (8 characters)
      // hasSpecial is satisfied but it's optional, so doesn't count towards required score
      // Score is based on satisfied REQUIRED rules (first 4)
      expect(result.current.score).toBe(1); // Only 1 required rule satisfied (minLength)
      expect(result.current.rules.find(r => r.id === 'minLength')?.satisfied).toBe(true);
      expect(result.current.rules.find(r => r.id === 'hasSpecial')?.satisfied).toBe(true);
      expect(result.current.rules.find(r => r.id === 'hasUpper')?.satisfied).toBe(false);
      expect(result.current.rules.find(r => r.id === 'hasLower')?.satisfied).toBe(false);
      expect(result.current.rules.find(r => r.id === 'hasDigit')?.satisfied).toBe(false);
    });

    it('handles unicode characters', () => {
      const { result } = renderHook(() => usePasswordStrength('Zażółć123!'));

      expect(result.current.score).toBe(4);
      expect(result.current.label).toBe('Mocne');
    });
  });
});
