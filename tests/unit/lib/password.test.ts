import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/password';

describe('password utils', () => {
  describe('hashPassword', () => {
    it('hashes password with bcrypt', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      // Bcrypt hashes start with $2a$, $2b$, or $2y$
      expect(hash).toMatch(/^\$2[aby]\$/);
      // Bcrypt hashes are 60 characters long
      expect(hash).toHaveLength(60);
    });

    it('generates different hashes for same password (due to salt)', async () => {
      const password = 'SecurePass123!';

      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Different hashes due to different salts
      expect(hash1).not.toBe(hash2);

      // But both should verify correctly
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });

    it('handles empty string', async () => {
      const hash = await hashPassword('');

      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(await verifyPassword('', hash)).toBe(true);
    });

    it('handles special characters', async () => {
      const password = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~';
      const hash = await hashPassword(password);

      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it('handles unicode characters', async () => {
      const password = 'Zażółć gęślą jaźń 🔐';
      const hash = await hashPassword(password);

      expect(await verifyPassword(password, hash)).toBe(true);
    });

    it('handles very long passwords', async () => {
      const password = 'a'.repeat(200);
      const hash = await hashPassword(password);

      expect(await verifyPassword(password, hash)).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('returns true for correct password', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      const result = await verifyPassword(password, hash);

      expect(result).toBe(true);
    });

    it('returns false for incorrect password', async () => {
      const password = 'SecurePass123!';
      const wrongPassword = 'WrongPass456!';
      const hash = await hashPassword(password);

      const result = await verifyPassword(wrongPassword, hash);

      expect(result).toBe(false);
    });

    it('returns false for slightly different password (case sensitive)', async () => {
      const password = 'SecurePass123!';
      const wrongPassword = 'securepass123!'; // Different case
      const hash = await hashPassword(password);

      const result = await verifyPassword(wrongPassword, hash);

      expect(result).toBe(false);
    });

    it('returns false for password with trailing space', async () => {
      const password = 'SecurePass123!';
      const passwordWithSpace = 'SecurePass123! '; // Trailing space
      const hash = await hashPassword(password);

      const result = await verifyPassword(passwordWithSpace, hash);

      expect(result).toBe(false);
    });

    it('returns false for empty string when password is not empty', async () => {
      const password = 'SecurePass123!';
      const hash = await hashPassword(password);

      const result = await verifyPassword('', hash);

      expect(result).toBe(false);
    });

    it('handles verification of valid bcrypt hash format', async () => {
      // Create a hash and verify it works correctly
      const password = 'test';
      const hash = await hashPassword(password);

      expect(await verifyPassword(password, hash)).toBe(true);
      expect(await verifyPassword('wrong', hash)).toBe(false);
    });
  });

  describe('hashPassword and verifyPassword integration', () => {
    it('works correctly with common passwords', async () => {
      const passwords = [
        'password123',
        'MySecureP@ssw0rd',
        'Test123!',
        '12345678',
        'qwerty',
      ];

      for (const password of passwords) {
        const hash = await hashPassword(password);
        expect(await verifyPassword(password, hash)).toBe(true);
        expect(await verifyPassword(password + 'x', hash)).toBe(false);
      }
    });

    it('maintains security with similar passwords', async () => {
      const password1 = 'SecurePass123';
      const password2 = 'SecurePass124'; // Only last char different

      const hash1 = await hashPassword(password1);
      const hash2 = await hashPassword(password2);

      // Each hash verifies only its own password
      expect(await verifyPassword(password1, hash1)).toBe(true);
      expect(await verifyPassword(password2, hash1)).toBe(false);

      expect(await verifyPassword(password2, hash2)).toBe(true);
      expect(await verifyPassword(password1, hash2)).toBe(false);
    });
  });
});
