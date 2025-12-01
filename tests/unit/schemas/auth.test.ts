import { describe, expect, it } from 'vitest';
import {
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  resetPasswordSchema,
  signupSchema,
} from '@/schemas/auth';

describe('auth schemas', () => {
  describe('loginSchema', () => {
    it('validates correct login data', () => {
      const validData = {
        email: 'user@example.com',
        password: 'password123',
      };

      const result = loginSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const invalidData = {
        email: 'not-an-email',
        password: 'password123',
      };

      const result = loginSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Nieprawidłowy adres email');
      }
    });

    it('rejects empty password', () => {
      const invalidData = {
        email: 'user@example.com',
        password: '',
      };

      const result = loginSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Hasło jest wymagane');
      }
    });
  });

  describe('passwordResetRequestSchema', () => {
    it('validates correct email', () => {
      const validData = { email: 'user@example.com' };

      const result = passwordResetRequestSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const invalidData = { email: 'invalid-email' };

      const result = passwordResetRequestSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('passwordResetConfirmSchema', () => {
    it('validates matching passwords with all requirements', () => {
      const validData = {
        password: 'SecurePass123',
        confirmPassword: 'SecurePass123',
      };

      const result = passwordResetConfirmSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects password shorter than 8 characters', () => {
      const invalidData = {
        password: 'Short1A',
        confirmPassword: 'Short1A',
      };

      const result = passwordResetConfirmSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('minimum 8 znaków');
      }
    });

    it('rejects password without uppercase letter', () => {
      const invalidData = {
        password: 'securepass123',
        confirmPassword: 'securepass123',
      };

      const result = passwordResetConfirmSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('wielką literę');
      }
    });

    it('rejects password without lowercase letter', () => {
      const invalidData = {
        password: 'SECUREPASS123',
        confirmPassword: 'SECUREPASS123',
      };

      const result = passwordResetConfirmSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('małą literę');
      }
    });

    it('rejects password without digit', () => {
      const invalidData = {
        password: 'SecurePassword',
        confirmPassword: 'SecurePassword',
      };

      const result = passwordResetConfirmSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('cyfrę');
      }
    });

    it('rejects non-matching passwords', () => {
      const invalidData = {
        password: 'SecurePass123',
        confirmPassword: 'DifferentPass456',
      };

      const result = passwordResetConfirmSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Hasła muszą być identyczne');
        expect(result.error.issues[0].path).toContain('confirmPassword');
      }
    });
  });

  describe('resetPasswordSchema', () => {
    it('validates correct reset password data', () => {
      const validData = {
        token: 'valid-token-123',
        newPassword: 'SecurePass123',
      };

      const result = resetPasswordSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects empty token', () => {
      const invalidData = {
        token: '',
        newPassword: 'SecurePass123',
      };

      const result = resetPasswordSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Token jest wymagany');
      }
    });

    it('rejects weak password', () => {
      const invalidData = {
        token: 'valid-token-123',
        newPassword: 'weak',
      };

      const result = resetPasswordSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });

  describe('signupSchema', () => {
    const buildValidSignupData = () => ({
      invitationToken: 'valid-token-123',
      email: 'newuser@example.com',
      password: 'SecurePass123',
      firstName: 'Jan',
      lastName: 'Kowalski',
      age: 30,
      gender: 'male' as const,
      consents: [
        {
          type: 'data_processing',
          text: 'Zgoda na przetwarzanie danych osobowych',
          accepted: true,
        },
        {
          type: 'health_data',
          text: 'Zgoda na przetwarzanie danych zdrowotnych',
          accepted: true,
        },
      ],
    });

    it('validates correct signup data with all required consents', () => {
      const validData = buildValidSignupData();

      const result = signupSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('validates signup without optional fields (age, gender)', () => {
      const validData = {
        invitationToken: 'valid-token-123',
        email: 'newuser@example.com',
        password: 'SecurePass123',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgoda na przetwarzanie danych',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgoda na dane medyczne',
            accepted: true,
          },
        ],
      };

      const result = signupSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });

    it('rejects empty invitation token', () => {
      const invalidData = {
        ...buildValidSignupData(),
        invitationToken: '',
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Token zaproszenia');
      }
    });

    it('rejects invalid email format', () => {
      const invalidData = {
        ...buildValidSignupData(),
        email: 'invalid-email',
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects password shorter than 8 characters', () => {
      const invalidData = {
        ...buildValidSignupData(),
        password: 'Short1',
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('8 znaków');
      }
    });

    it('rejects empty firstName', () => {
      const invalidData = {
        ...buildValidSignupData(),
        firstName: '',
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects empty lastName', () => {
      const invalidData = {
        ...buildValidSignupData(),
        lastName: '',
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects empty consents array', () => {
      const invalidData = {
        ...buildValidSignupData(),
        consents: [],
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('rejects when data_processing consent is not accepted', () => {
      const invalidData = {
        ...buildValidSignupData(),
        consents: [
          {
            type: 'data_processing',
            text: 'Zgoda na przetwarzanie danych',
            accepted: false, // Not accepted
          },
          {
            type: 'health_data',
            text: 'Zgoda na dane medyczne',
            accepted: true,
          },
        ],
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Wymagane prawnie zgody');
      }
    });

    it('rejects when health_data consent is not accepted', () => {
      const invalidData = {
        ...buildValidSignupData(),
        consents: [
          {
            type: 'data_processing',
            text: 'Zgoda na przetwarzanie danych',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgoda na dane medyczne',
            accepted: false, // Not accepted
          },
        ],
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Wymagane prawnie zgody');
      }
    });

    it('rejects when required consent types are missing', () => {
      const invalidData = {
        ...buildValidSignupData(),
        consents: [
          {
            type: 'marketing', // Wrong type
            text: 'Zgoda marketingowa',
            accepted: true,
          },
        ],
      };

      const result = signupSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it('accepts additional optional consents', () => {
      const validData = {
        ...buildValidSignupData(),
        consents: [
          {
            type: 'data_processing',
            text: 'Zgoda na przetwarzanie danych',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgoda na dane medyczne',
            accepted: true,
          },
          {
            type: 'marketing',
            text: 'Zgoda marketingowa (opcjonalna)',
            accepted: false,
          },
        ],
      };

      const result = signupSchema.safeParse(validData);

      expect(result.success).toBe(true);
    });
  });
});
