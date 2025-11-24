/**
 * Integration Tests: Signup Transaction
 *
 * Tests the complete signup flow which involves a complex transaction:
 * - User creation
 * - Consent storage
 * - Invitation marking as used
 * - Audit log entries
 * - Event tracking
 *
 * This test verifies database transaction integrity and rollback on failures.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createDietitian, createInvitation } from '../../helpers/fixtures';
import { signup } from '@/lib/services/authService';
import type { SignupRequest } from '@/types';

describe('Integration: Signup Transaction', () => {
  let db: Database;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('Successful Signup Transaction', () => {
    it('should create user, consents, mark invitation as used, and create audit logs', async () => {
      // Setup: Create dietitian and invitation
      const dietitian = await createDietitian(db);
      const invitation = await createInvitation(db, dietitian.id, {
        email: 'newpatient@example.com',
        token: 'valid-token-123',
      });

      // Prepare signup request
      const signupRequest: SignupRequest = {
        invitationToken: invitation.token,
        email: 'newpatient@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        age: 30,
        gender: 'male',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      // Execute signup
      const result = await signup(signupRequest);

      // Verify user was created
      expect(result.user.id).toBeDefined();
      expect(result.user.email).toBe('newpatient@example.com');
      expect(result.user.role).toBe('patient');
      expect(result.user.firstName).toBe('Jan');
      expect(result.user.lastName).toBe('Kowalski');
      expect(result.user.status).toBe('active');

      // Verify user exists in database
      const [dbUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, result.userId));

      expect(dbUser).toBeDefined();
      expect(dbUser.email).toBe('newpatient@example.com');
      expect(dbUser.passwordHash).toBeDefined();
      expect(dbUser.passwordHash).not.toBe('SecurePass123!@#'); // Password should be hashed

      // Verify consents were created
      const consents = await db
        .select()
        .from(schema.consents)
        .where(eq(schema.consents.userId, result.userId));

      expect(consents).toHaveLength(2);
      expect(consents.map((c) => c.consentType).sort()).toEqual([
        'data_processing',
        'health_data',
      ]);
      expect(consents.every((c) => c.accepted)).toBe(true);

      // Verify invitation was marked as used
      const [usedInvitation] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.id, invitation.id));

      expect(usedInvitation.usedAt).toBeDefined();
      expect(usedInvitation.usedAt).not.toBeNull();

      // Verify audit logs were created
      const auditLogs = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.userId, result.userId));

      expect(auditLogs.length).toBeGreaterThanOrEqual(1); // At least user creation audit

      const userCreationAudit = auditLogs.find(
        (log) => log.action === 'create' && log.tableName === 'users'
      );
      expect(userCreationAudit).toBeDefined();
      expect(userCreationAudit?.recordId).toBe(result.userId);
      expect(userCreationAudit?.before).toBeNull();
      expect(userCreationAudit?.after).toBeDefined();

      // Verify signup event was tracked
      const events = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.userId, result.userId));

      const signupEvent = events.find((e) => e.eventType === 'signup');
      expect(signupEvent).toBeDefined();
      expect((signupEvent?.properties as any)?.role).toBe('patient');
    });

    it('should handle signup with optional fields', async () => {
      const dietitian = await createDietitian(db);
      const invitation = await createInvitation(db, dietitian.id, {
        email: 'minimal@example.com',
      });

      const signupRequest: SignupRequest = {
        invitationToken: invitation.token,
        email: 'minimal@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        // No age, gender
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      const result = await signup(signupRequest);

      expect(result.user.id).toBeDefined();
      expect(result.user.age).toBeUndefined();
      expect(result.user.gender).toBeUndefined();
    });
  });

  describe('Signup Validation Errors', () => {
    it('should reject signup with invalid invitation token', async () => {
      const signupRequest: SignupRequest = {
        invitationToken: 'invalid-token',
        email: 'test@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await expect(signup(signupRequest)).rejects.toThrow('Token zaproszenia nie istnieje');

      // Verify no user was created
      const users = await db.select().from(schema.users);
      expect(users).toHaveLength(0);
    });

    it('should reject signup with expired invitation', async () => {
      const dietitian = await createDietitian(db);
      const expiredInvitation = await createInvitation(db, dietitian.id, {
        email: 'expired@example.com',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      });

      const signupRequest: SignupRequest = {
        invitationToken: expiredInvitation.token,
        email: 'expired@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await expect(signup(signupRequest)).rejects.toThrow('Token zaproszenia wygasł');
    });

    it('should reject signup with already used invitation', async () => {
      const dietitian = await createDietitian(db);
      const usedInvitation = await createInvitation(db, dietitian.id, {
        email: 'used@example.com',
        usedAt: new Date(),
      });

      const signupRequest: SignupRequest = {
        invitationToken: usedInvitation.token,
        email: 'used@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await expect(signup(signupRequest)).rejects.toThrow('Token zaproszenia został już użyty');
    });

    it('should reject signup with email mismatch', async () => {
      const dietitian = await createDietitian(db);
      const invitation = await createInvitation(db, dietitian.id, {
        email: 'correct@example.com',
      });

      const signupRequest: SignupRequest = {
        invitationToken: invitation.token,
        email: 'wrong@example.com', // Different email
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await expect(signup(signupRequest)).rejects.toThrow('Adres email nie pasuje do zaproszenia');
    });

    it('should reject signup with duplicate email', async () => {
      const dietitian = await createDietitian(db);

      // First signup
      const invitation1 = await createInvitation(db, dietitian.id, {
        email: 'duplicate@example.com',
      });

      const signupRequest1: SignupRequest = {
        invitationToken: invitation1.token,
        email: 'duplicate@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await signup(signupRequest1);

      // Second signup with same email
      const invitation2 = await createInvitation(db, dietitian.id, {
        email: 'duplicate@example.com',
      });

      const signupRequest2: SignupRequest = {
        invitationToken: invitation2.token,
        email: 'duplicate@example.com',
        password: 'DifferentPass456!@#',
        firstName: 'Piotr',
        lastName: 'Nowak',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await expect(signup(signupRequest2)).rejects.toThrow();
    });

    it('should reject signup with missing required consents', async () => {
      const dietitian = await createDietitian(db);
      const invitation = await createInvitation(db, dietitian.id, {
        email: 'noconsent@example.com',
      });

      const signupRequest: SignupRequest = {
        invitationToken: invitation.token,
        email: 'noconsent@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          // Missing health_data consent
        ],
      };

      await expect(signup(signupRequest)).rejects.toThrow('Brak wymaganych zgód');
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback entire transaction on failure', async () => {
      const dietitian = await createDietitian(db);
      const invitation = await createInvitation(db, dietitian.id, {
        email: 'rollback@example.com',
      });

      // Create a user with this email to cause conflict
      await db.insert(schema.users).values({
        email: 'rollback@example.com',
        passwordHash: 'existing-hash',
        role: 'patient',
        status: 'active',
        firstName: 'Existing',
        lastName: 'User',
      });

      const signupRequest: SignupRequest = {
        invitationToken: invitation.token,
        email: 'rollback@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      await expect(signup(signupRequest)).rejects.toThrow();

      // Verify invitation was NOT marked as used (transaction rolled back)
      const [invitationAfter] = await db
        .select()
        .from(schema.invitations)
        .where(eq(schema.invitations.id, invitation.id));

      expect(invitationAfter.usedAt).toBeNull();

      // Verify no consents were created for the failed signup
      const consents = await db
        .select()
        .from(schema.consents)
        .where(eq(schema.consents.consentType, 'data_processing'));

      // Only consents from existing user (if any), not from failed signup
      expect(consents.length).toBeLessThanOrEqual(0);
    });
  });

  describe('Audit Trail', () => {
    it('should create complete audit trail for signup', async () => {
      const dietitian = await createDietitian(db);
      const invitation = await createInvitation(db, dietitian.id, {
        email: 'audit@example.com',
      });

      const signupRequest: SignupRequest = {
        invitationToken: invitation.token,
        email: 'audit@example.com',
        password: 'SecurePass123!@#',
        firstName: 'Jan',
        lastName: 'Kowalski',
        consents: [
          {
            type: 'data_processing',
            text: 'Zgadzam się na przetwarzanie moich danych osobowych.',
            accepted: true,
          },
          {
            type: 'health_data',
            text: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
            accepted: true,
          },
        ],
      };

      const result = await signup(signupRequest);

      // Get all audit logs for this user
      const auditLogs = await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.userId, result.userId))
        .orderBy(schema.auditLog.timestamp);

      // Should have at least user creation audit
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);

      // Check user creation audit
      const userCreationLog = auditLogs.find(
        (log) => log.action === 'create' && log.tableName === 'users'
      );

      expect(userCreationLog).toBeDefined();
      expect(userCreationLog?.userId).toBe(result.userId);
      expect(userCreationLog?.before).toBeNull();
      expect((userCreationLog?.after as any)?.id).toBe(result.userId);
      expect((userCreationLog?.after as any)?.email).toBe('audit@example.com');
      expect((userCreationLog?.after as any)?.role).toBe('patient');
    });
  });
});
