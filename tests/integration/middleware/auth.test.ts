/**
 * Integration Tests: Auth Middleware
 *
 * Tests authentication middleware behavior with different session states.
 * Verifies session validation, cookie handling, and user/session assignment to context.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createPatient, createDietitian, createSession } from '../../helpers/fixtures';
import { createLucia } from '@/lib/auth';

describe('Integration: Auth Middleware', () => {
  let db: Database;
  let lucia: ReturnType<typeof createLucia>;

  beforeAll(async () => {
    const result = await startTestDatabase();
    db = result.db;
    lucia = createLucia(db);
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase(db);
  });

  describe('Session Validation', () => {
    it('should validate valid session and set user/session in context', async () => {
      const patient = await createPatient(db);
      const session = await createSession(db, patient.id);

      // Simulate Lucia session validation
      const result = await lucia.validateSession(session.id);

      expect(result.session).toBeDefined();
      expect(result.session?.id).toBe(session.id);
      expect(result.session?.userId).toBe(patient.id);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe(patient.id);
      expect(result.user?.email).toBe(patient.email);
      expect(result.user?.role).toBe('patient');
    });

    it('should return null for non-existent session', async () => {
      const result = await lucia.validateSession('non-existent-session-id');

      expect(result.session).toBeNull();
      expect(result.user).toBeNull();
    });

    it('should return null for expired session', async () => {
      const patient = await createPatient(db);
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const session = await createSession(db, patient.id, {
        expiresAt: expiredDate,
      });

      const result = await lucia.validateSession(session.id);

      expect(result.session).toBeNull();
      expect(result.user).toBeNull();
    });

    it('should validate session for dietitian', async () => {
      const dietitian = await createDietitian(db);
      const session = await createSession(db, dietitian.id);

      const result = await lucia.validateSession(session.id);

      expect(result.user?.role).toBe('dietitian');
      expect(result.user?.email).toBe(dietitian.email);
    });
  });

  describe('Session Freshness', () => {
    it('should detect fresh session (recently created)', async () => {
      const patient = await createPatient(db);
      const futureExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const session = await createSession(db, patient.id, {
        expiresAt: futureExpiry,
      });

      const result = await lucia.validateSession(session.id);

      expect(result.session).toBeDefined();
      // Fresh sessions are those that will expire in more than half the session duration
      // Lucia marks session as fresh if it needs renewal
    });

    it('should handle session renewal for sessions close to expiry', async () => {
      const patient = await createPatient(db);
      const soonExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      const session = await createSession(db, patient.id, {
        expiresAt: soonExpiry,
      });

      const result = await lucia.validateSession(session.id);

      expect(result.session).toBeDefined();
      // Session should be valid but might be marked as needing renewal
    });
  });

  describe('Session Cookie Operations', () => {
    it('should create session cookie with correct attributes', async () => {
      const patient = await createPatient(db);
      const session = await createSession(db, patient.id);

      const sessionCookie = lucia.createSessionCookie(session.id);

      expect(sessionCookie.name).toBeDefined();
      expect(sessionCookie.value).toBe(session.id);
      expect(sessionCookie.attributes).toBeDefined();
      expect(sessionCookie.attributes.httpOnly).toBe(true);
      expect(sessionCookie.attributes.sameSite).toBeDefined();
      expect(sessionCookie.attributes.path).toBe('/');
    });

    it('should create blank session cookie for logout', () => {
      const blankCookie = lucia.createBlankSessionCookie();

      expect(blankCookie.name).toBeDefined();
      expect(blankCookie.value).toBe('');
      expect(blankCookie.attributes.maxAge).toBe(0);
    });
  });

  describe('Multi-Session Management', () => {
    it('should support multiple active sessions for same user', async () => {
      const patient = await createPatient(db);

      const session1 = await createSession(db, patient.id);
      const session2 = await createSession(db, patient.id);

      const result1 = await lucia.validateSession(session1.id);
      const result2 = await lucia.validateSession(session2.id);

      expect(result1.session?.userId).toBe(patient.id);
      expect(result2.session?.userId).toBe(patient.id);
      expect(result1.session?.id).not.toBe(result2.session?.id);
    });

    it('should invalidate specific session without affecting others', async () => {
      const patient = await createPatient(db);

      const session1 = await createSession(db, patient.id);
      const session2 = await createSession(db, patient.id);

      // Invalidate session1
      await lucia.invalidateSession(session1.id);

      const result1 = await lucia.validateSession(session1.id);
      const result2 = await lucia.validateSession(session2.id);

      expect(result1.session).toBeNull();
      expect(result2.session).toBeDefined();
    });

    it('should invalidate all user sessions (logout all devices)', async () => {
      const patient = await createPatient(db);

      await createSession(db, patient.id);
      await createSession(db, patient.id);
      await createSession(db, patient.id);

      // Invalidate all sessions for user
      await lucia.invalidateUserSessions(patient.id);

      const remainingSessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, patient.id));

      expect(remainingSessions).toHaveLength(0);
    });
  });

  describe('Session-User Relationship', () => {
    it('should retrieve user data through session', async () => {
      const patient = await createPatient(db, 'active', {
        email: 'session-user@example.com',
        firstName: 'Jan',
        lastName: 'Kowalski',
      });

      const session = await createSession(db, patient.id);
      const result = await lucia.validateSession(session.id);

      expect(result.user?.email).toBe('session-user@example.com');
      expect(result.user?.firstName).toBe('Jan');
      expect(result.user?.lastName).toBe('Kowalski');
    });

    it('should handle session for user with paused status', async () => {
      const patient = await createPatient(db, 'paused');
      const session = await createSession(db, patient.id);

      const result = await lucia.validateSession(session.id);

      expect(result.user).toBeDefined();
      expect(result.user?.status).toBe('paused');
    });

    it('should handle session for user with ended status', async () => {
      const patient = await createPatient(db, 'ended');
      const session = await createSession(db, patient.id);

      const result = await lucia.validateSession(session.id);

      expect(result.user).toBeDefined();
      expect(result.user?.status).toBe('ended');
      // Note: Application logic should handle access control for ended users
    });
  });

  describe('Session Cleanup', () => {
    it('should allow deletion of expired sessions', async () => {
      const patient = await createPatient(db);

      // Create expired session
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await createSession(db, patient.id, { expiresAt: expiredDate });

      // Create valid session
      const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await createSession(db, patient.id, { expiresAt: validDate });

      // Delete expired sessions
      await db
        .delete(schema.sessions)
        .where(eq(schema.sessions.userId, patient.id))
        .where(eq(schema.sessions.expiresAt, expiredDate));

      const remainingSessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, patient.id));

      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('Edge Cases', () => {
    it('should handle session validation with deleted user', async () => {
      const patient = await createPatient(db);
      const session = await createSession(db, patient.id);

      // Delete user (cascade should delete sessions)
      await db.delete(schema.users).where(eq(schema.users.id, patient.id));

      const result = await lucia.validateSession(session.id);

      expect(result.session).toBeNull();
      expect(result.user).toBeNull();
    });

    it('should handle concurrent session validations', async () => {
      const patient = await createPatient(db);
      const session = await createSession(db, patient.id);

      // Validate session concurrently
      const results = await Promise.all([
        lucia.validateSession(session.id),
        lucia.validateSession(session.id),
        lucia.validateSession(session.id),
      ]);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.session?.id === session.id)).toBe(true);
      expect(results.every((r) => r.user?.id === patient.id)).toBe(true);
    });

    it('should handle malformed session ID', async () => {
      const result = await lucia.validateSession('malformed!!!session@@@id');

      expect(result.session).toBeNull();
      expect(result.user).toBeNull();
    });
  });
});
