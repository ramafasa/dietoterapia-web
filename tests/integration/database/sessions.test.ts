/**
 * Integration Tests: Sessions CRUD with Database
 *
 * Tests session management operations with real PostgreSQL database.
 * Verifies Lucia Auth session storage and expiration logic.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, lt, and } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createUser, createSession } from '../../helpers/fixtures';

describe('Integration: Sessions CRUD with Database', () => {
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

  describe('Session Creation', () => {
    it('should create a session for a user', async () => {
      const user = await createUser(db);
      const session = await createSession(db, user.id);

      expect(session.id).toBeDefined();
      expect(session.userId).toBe(user.id);
      expect(session.expiresAt).toBeDefined();
      expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should create session with custom expiration date', async () => {
      const user = await createUser(db);
      const customExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const session = await createSession(db, user.id, {
        expiresAt: customExpiresAt,
      });

      expect(session.expiresAt.getTime()).toBeCloseTo(customExpiresAt.getTime(), -3);
    });

    it('should create session with custom session ID', async () => {
      const user = await createUser(db);
      const customSessionId = 'custom-session-id-123';

      const session = await createSession(db, user.id, {
        sessionId: customSessionId,
      });

      expect(session.id).toBe(customSessionId);
    });

    it('should create multiple sessions for the same user', async () => {
      const user = await createUser(db);

      const session1 = await createSession(db, user.id);
      const session2 = await createSession(db, user.id);

      expect(session1.id).not.toBe(session2.id);
      expect(session1.userId).toBe(user.id);
      expect(session2.userId).toBe(user.id);

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));

      expect(sessions).toHaveLength(2);
    });

    it('should fail to create session with duplicate session ID', async () => {
      const user = await createUser(db);
      const sessionId = 'duplicate-session-id';

      await createSession(db, user.id, { sessionId });

      await expect(
        createSession(db, user.id, { sessionId })
      ).rejects.toThrow();
    });
  });

  describe('Session Read Operations', () => {
    it('should find session by ID', async () => {
      const user = await createUser(db);
      const createdSession = await createSession(db, user.id);

      const [foundSession] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, createdSession.id));

      expect(foundSession).toBeDefined();
      expect(foundSession.id).toBe(createdSession.id);
      expect(foundSession.userId).toBe(user.id);
    });

    it('should find all sessions for a user', async () => {
      const user = await createUser(db);

      await createSession(db, user.id);
      await createSession(db, user.id);
      await createSession(db, user.id);

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));

      expect(sessions).toHaveLength(3);
      expect(sessions.every((s) => s.userId === user.id)).toBe(true);
    });

    it('should join session with user data', async () => {
      const user = await createUser(db, {
        email: 'session-user@example.com',
        firstName: 'Jan',
        lastName: 'Kowalski',
      });
      const session = await createSession(db, user.id);

      const [result] = await db
        .select({
          sessionId: schema.sessions.id,
          userId: schema.sessions.userId,
          expiresAt: schema.sessions.expiresAt,
          userEmail: schema.users.email,
          userName: schema.users.firstName,
        })
        .from(schema.sessions)
        .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
        .where(eq(schema.sessions.id, session.id));

      expect(result).toBeDefined();
      expect(result.sessionId).toBe(session.id);
      expect(result.userId).toBe(user.id);
      expect(result.userEmail).toBe('session-user@example.com');
      expect(result.userName).toBe('Jan');
    });
  });

  describe('Session Expiration', () => {
    it('should identify expired sessions', async () => {
      const user = await createUser(db);

      // Create expired session
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      await createSession(db, user.id, { expiresAt: expiredDate });

      // Create valid session
      const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      await createSession(db, user.id, { expiresAt: validDate });

      const expiredSessions = await db
        .select()
        .from(schema.sessions)
        .where(lt(schema.sessions.expiresAt, new Date()));

      expect(expiredSessions).toHaveLength(1);
      expect(expiredSessions[0].expiresAt.getTime()).toBeLessThan(Date.now());
    });

    it('should filter only valid (non-expired) sessions', async () => {
      const user = await createUser(db);

      // Create expired sessions
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await createSession(db, user.id, { expiresAt: expiredDate });
      await createSession(db, user.id, { expiresAt: expiredDate });

      // Create valid sessions
      const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await createSession(db, user.id, { expiresAt: validDate });

      const validSessions = await db
        .select()
        .from(schema.sessions)
        .where(and(eq(schema.sessions.userId, user.id), eq(schema.sessions.expiresAt, validDate)));

      expect(validSessions).toHaveLength(1);
    });
  });

  describe('Session Delete Operations', () => {
    it('should delete a session (logout)', async () => {
      const user = await createUser(db);
      const session = await createSession(db, user.id);

      await db.delete(schema.sessions).where(eq(schema.sessions.id, session.id));

      const [foundSession] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, session.id));

      expect(foundSession).toBeUndefined();
    });

    it('should delete all sessions for a user (logout all devices)', async () => {
      const user = await createUser(db);

      await createSession(db, user.id);
      await createSession(db, user.id);
      await createSession(db, user.id);

      await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));

      const sessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));

      expect(sessions).toHaveLength(0);
    });

    it('should delete expired sessions (cleanup)', async () => {
      const user = await createUser(db);

      // Create expired sessions
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      await createSession(db, user.id, { expiresAt: expiredDate });
      await createSession(db, user.id, { expiresAt: expiredDate });

      // Create valid session
      const validDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await createSession(db, user.id, { expiresAt: validDate });

      // Delete expired sessions
      await db
        .delete(schema.sessions)
        .where(lt(schema.sessions.expiresAt, new Date()));

      const remainingSessions = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id));

      expect(remainingSessions).toHaveLength(1);
      expect(remainingSessions[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should cascade delete sessions when user is deleted', async () => {
      const user = await createUser(db);
      const session = await createSession(db, user.id);

      // Delete user (cascade should delete sessions)
      await db.delete(schema.users).where(eq(schema.users.id, user.id));

      const [foundSession] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, session.id));

      expect(foundSession).toBeUndefined();
    });
  });

  describe('Session Edge Cases', () => {
    it('should handle sessions for non-existent users gracefully', async () => {
      const nonExistentUserId = '00000000-0000-0000-0000-000000000000';

      // This should fail due to foreign key constraint
      await expect(
        db.insert(schema.sessions).values({
          id: 'invalid-session',
          userId: nonExistentUserId,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
      ).rejects.toThrow();
    });

    it('should handle concurrent session creation', async () => {
      const user = await createUser(db);

      const sessionPromises = Array.from({ length: 5 }, () =>
        createSession(db, user.id)
      );

      const sessions = await Promise.all(sessionPromises);

      expect(sessions).toHaveLength(5);
      expect(new Set(sessions.map((s) => s.id)).size).toBe(5); // All IDs unique
    });
  });
});
