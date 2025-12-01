/**
 * Integration Tests: Users CRUD with Database
 *
 * Tests user repository operations with real PostgreSQL database.
 * Uses Testcontainers for isolated database instances.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import { createUser, createPatient, createDietitian } from '../../helpers/fixtures';

describe('Integration: Users CRUD with Database', () => {
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

  describe('User Creation', () => {
    it('should create a patient user with all fields', async () => {
      const user = await createUser(db, {
        email: 'patient@example.com',
        password: 'Test123!@#',
        role: 'patient',
        status: 'active',
        firstName: 'Jan',
        lastName: 'Kowalski',
        age: 30,
        gender: 'male',
      });

      expect(user.id).toBeDefined();
      expect(user.email).toBe('patient@example.com');
      expect(user.role).toBe('patient');
      expect(user.status).toBe('active');
      expect(user.firstName).toBe('Jan');
      expect(user.lastName).toBe('Kowalski');
      expect(user.age).toBe(30);
      expect(user.gender).toBe('male');
      expect(user.passwordHash).toBeDefined();
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
    });

    it('should create a dietitian user', async () => {
      const dietitian = await createDietitian(db);

      expect(dietitian.id).toBeDefined();
      expect(dietitian.email).toBe('paulina@example.com');
      expect(dietitian.role).toBe('dietitian');
      expect(dietitian.status).toBe('active');
      expect(dietitian.firstName).toBe('Paulina');
      expect(dietitian.lastName).toBe('Maciak');
    });

    it('should create patient with "paused" status', async () => {
      const patient = await createPatient(db, 'paused');

      expect(patient.status).toBe('paused');
      expect(patient.role).toBe('patient');
    });

    it('should create patient with "ended" status and set timestamps', async () => {
      const patient = await createPatient(db, 'ended');

      expect(patient.status).toBe('ended');
      expect(patient.endedAt).toBeDefined();
      expect(patient.scheduledDeletionAt).toBeDefined();

      // Verify scheduledDeletionAt is 24 months after endedAt
      const monthsDiff =
        (patient.scheduledDeletionAt!.getTime() - patient.endedAt!.getTime()) /
        (1000 * 60 * 60 * 24 * 30);
      expect(monthsDiff).toBeGreaterThanOrEqual(23);
      expect(monthsDiff).toBeLessThanOrEqual(25);
    });

    it('should fail to create user with duplicate email', async () => {
      await createUser(db, { email: 'duplicate@example.com' });

      await expect(
        createUser(db, { email: 'duplicate@example.com' })
      ).rejects.toThrow();
    });
  });

  describe('User Read Operations', () => {
    it('should find user by ID', async () => {
      const createdUser = await createUser(db, { email: 'findme@example.com' });

      const [foundUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, createdUser.id));

      expect(foundUser).toBeDefined();
      expect(foundUser.id).toBe(createdUser.id);
      expect(foundUser.email).toBe('findme@example.com');
    });

    it('should find user by email', async () => {
      await createUser(db, { email: 'findbyemail@example.com' });

      const [foundUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'findbyemail@example.com'));

      expect(foundUser).toBeDefined();
      expect(foundUser.email).toBe('findbyemail@example.com');
    });

    it('should return null for non-existent user', async () => {
      const [foundUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.email, 'nonexistent@example.com'));

      expect(foundUser).toBeUndefined();
    });

    it('should list all patients with role filter', async () => {
      await createPatient(db, 'active');
      await createPatient(db, 'paused');
      await createDietitian(db);

      const patients = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.role, 'patient'));

      expect(patients).toHaveLength(2);
      expect(patients.every((p) => p.role === 'patient')).toBe(true);
    });

    it('should filter patients by status', async () => {
      await createPatient(db, 'active');
      await createPatient(db, 'active');
      await createPatient(db, 'paused');
      await createPatient(db, 'ended');

      const activePatients = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.status, 'active'));

      expect(activePatients).toHaveLength(2);
      expect(activePatients.every((p) => p.status === 'active')).toBe(true);
    });
  });

  describe('User Update Operations', () => {
    it('should update user status from active to paused', async () => {
      const user = await createPatient(db, 'active');

      // Small delay to ensure updatedAt is different
      await new Promise(resolve => setTimeout(resolve, 10));

      const [updatedUser] = await db
        .update(schema.users)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(eq(schema.users.id, user.id))
        .returning();

      expect(updatedUser.status).toBe('paused');
      expect(updatedUser.updatedAt.getTime()).toBeGreaterThanOrEqual(user.updatedAt.getTime());
    });

    it('should update user status to "ended" with timestamps', async () => {
      const user = await createPatient(db, 'active');

      const endedAt = new Date();
      const scheduledDeletionAt = new Date();
      scheduledDeletionAt.setMonth(scheduledDeletionAt.getMonth() + 24);

      const [updatedUser] = await db
        .update(schema.users)
        .set({
          status: 'ended',
          endedAt,
          scheduledDeletionAt,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id))
        .returning();

      expect(updatedUser.status).toBe('ended');
      expect(updatedUser.endedAt).toBeDefined();
      expect(updatedUser.scheduledDeletionAt).toBeDefined();
    });

    it('should update user profile fields', async () => {
      const user = await createUser(db, {
        firstName: 'Jan',
        lastName: 'Kowalski',
      });

      const [updatedUser] = await db
        .update(schema.users)
        .set({
          firstName: 'Piotr',
          lastName: 'Nowak',
          age: 35,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.id, user.id))
        .returning();

      expect(updatedUser.firstName).toBe('Piotr');
      expect(updatedUser.lastName).toBe('Nowak');
      expect(updatedUser.age).toBe(35);
    });
  });

  describe('User Delete Operations', () => {
    it('should delete a user', async () => {
      const user = await createUser(db, { email: 'deleteme@example.com' });

      await db.delete(schema.users).where(eq(schema.users.id, user.id));

      const [foundUser] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.id, user.id));

      expect(foundUser).toBeUndefined();
    });

    it('should cascade delete sessions when user is deleted', async () => {
      const user = await createUser(db);

      // Create session for user
      const [session] = await db
        .insert(schema.sessions)
        .values({
          id: 'session-123',
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        })
        .returning();

      expect(session).toBeDefined();

      // Delete user (should cascade to sessions)
      await db.delete(schema.users).where(eq(schema.users.id, user.id));

      // Verify session is also deleted
      const [foundSession] = await db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, 'session-123'));

      expect(foundSession).toBeUndefined();
    });
  });

  describe('Composite Queries', () => {
    it('should query users by role and status (composite index)', async () => {
      await createPatient(db, 'active');
      await createPatient(db, 'active');
      await createPatient(db, 'paused');
      await createDietitian(db);

      const activePatients = await db
        .select()
        .from(schema.users)
        .where(
          and(
            eq(schema.users.role, 'patient'),
            eq(schema.users.status, 'active')
          )
        );

      expect(activePatients).toHaveLength(2);
    });
  });
});
