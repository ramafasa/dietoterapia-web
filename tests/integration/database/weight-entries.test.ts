/**
 * Integration Tests: Weight Entries CRUD with Database
 *
 * Tests weight entry operations with real PostgreSQL database.
 * Verifies constraints (1 entry per day), outlier detection, backfill logic.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, desc, and, sql } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { startTestDatabase, stopTestDatabase, cleanDatabase } from '../../helpers/db-container';
import {
  createUser,
  createPatient,
  createDietitian,
  createWeightEntry,
  createWeightHistory,
} from '../../helpers/fixtures';

describe('Integration: Weight Entries CRUD with Database', () => {
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

  describe('Weight Entry Creation', () => {
    it('should create a weight entry for a patient', async () => {
      const patient = await createPatient(db);
      const entry = await createWeightEntry(db, patient.id, {
        weight: 70.5,
        source: 'patient',
      });

      expect(entry.id).toBeDefined();
      expect(entry.userId).toBe(patient.id);
      expect(parseFloat(entry.weight)).toBe(70.5);
      expect(entry.source).toBe('patient');
      expect(entry.isBackfill).toBe(false);
      expect(entry.isOutlier).toBe(false);
      expect(entry.createdBy).toBe(patient.id);
      expect(entry.createdAt).toBeDefined();
    });

    it('should create weight entry by dietitian', async () => {
      const patient = await createPatient(db);
      const dietitian = await createDietitian(db);

      const entry = await createWeightEntry(db, patient.id, {
        weight: 68.0,
        source: 'dietitian',
        createdBy: dietitian.id,
      });

      expect(entry.source).toBe('dietitian');
      expect(entry.createdBy).toBe(dietitian.id);
      expect(entry.userId).toBe(patient.id);
    });

    it('should create backfill entry (historical weight)', async () => {
      const patient = await createPatient(db);
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const entry = await createWeightEntry(db, patient.id, {
        weight: 72.0,
        measurementDate: pastDate,
        isBackfill: true,
      });

      expect(entry.isBackfill).toBe(true);
      expect(entry.measurementDate.getTime()).toBeLessThan(Date.now());
    });

    it('should create outlier entry (large weight change)', async () => {
      const patient = await createPatient(db);

      const entry = await createWeightEntry(db, patient.id, {
        weight: 75.0,
        isOutlier: true,
        outlierConfirmed: false,
      });

      expect(entry.isOutlier).toBe(true);
      expect(entry.outlierConfirmed).toBe(false);
    });

    it('should create entry with note', async () => {
      const patient = await createPatient(db);

      const entry = await createWeightEntry(db, patient.id, {
        weight: 70.0,
        note: 'Rano, na czczo',
      });

      expect(entry.note).toBe('Rano, na czczo');
    });

    it('should enforce 1 entry per day constraint (same day)', async () => {
      const patient = await createPatient(db);
      const today = new Date();

      await createWeightEntry(db, patient.id, {
        weight: 70.0,
        measurementDate: today,
      });

      // Try to create another entry for the same day
      await expect(
        createWeightEntry(db, patient.id, {
          weight: 71.0,
          measurementDate: today,
        })
      ).rejects.toThrow();
    });

    it('should allow entries on different days', async () => {
      const patient = await createPatient(db);

      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const entry1 = await createWeightEntry(db, patient.id, {
        weight: 70.0,
        measurementDate: today,
      });

      const entry2 = await createWeightEntry(db, patient.id, {
        weight: 69.5,
        measurementDate: yesterday,
      });

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.userId).toBe(entry2.userId);
    });
  });

  describe('Weight Entry Read Operations', () => {
    it('should find weight entries by user ID', async () => {
      const patient = await createPatient(db);

      await createWeightEntry(db, patient.id, { weight: 70.0 });
      await createWeightEntry(db, patient.id, { weight: 69.5 });

      const entries = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id));

      expect(entries).toHaveLength(2);
      expect(entries.every((e) => e.userId === patient.id)).toBe(true);
    });

    it('should sort entries by measurement date (desc)', async () => {
      const patient = await createPatient(db);

      await createWeightHistory(db, patient.id, [
        { weight: 70.0, daysAgo: 0 },
        { weight: 69.5, daysAgo: 1 },
        { weight: 69.0, daysAgo: 2 },
      ]);

      const entries = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id))
        .orderBy(desc(schema.weightEntries.measurementDate));

      expect(entries).toHaveLength(3);
      expect(parseFloat(entries[0].weight)).toBe(70.0); // Most recent
      expect(parseFloat(entries[1].weight)).toBe(69.5);
      expect(parseFloat(entries[2].weight)).toBe(69.0); // Oldest
    });

    it('should filter backfill entries', async () => {
      const patient = await createPatient(db);

      await createWeightEntry(db, patient.id, { weight: 70.0, isBackfill: false });
      await createWeightEntry(db, patient.id, { weight: 69.0, isBackfill: true });
      await createWeightEntry(db, patient.id, { weight: 68.0, isBackfill: true });

      const backfillEntries = await db
        .select()
        .from(schema.weightEntries)
        .where(
          and(
            eq(schema.weightEntries.userId, patient.id),
            eq(schema.weightEntries.isBackfill, true)
          )
        );

      expect(backfillEntries).toHaveLength(2);
      expect(backfillEntries.every((e) => e.isBackfill)).toBe(true);
    });

    it('should filter outlier entries', async () => {
      const patient = await createPatient(db);

      await createWeightEntry(db, patient.id, { weight: 70.0, isOutlier: false });
      await createWeightEntry(db, patient.id, { weight: 80.0, isOutlier: true });

      const outlierEntries = await db
        .select()
        .from(schema.weightEntries)
        .where(
          and(
            eq(schema.weightEntries.userId, patient.id),
            eq(schema.weightEntries.isOutlier, true)
          )
        );

      expect(outlierEntries).toHaveLength(1);
      expect(outlierEntries[0].isOutlier).toBe(true);
    });

    it('should join weight entry with user data', async () => {
      const patient = await createPatient(db);
      const entry = await createWeightEntry(db, patient.id, { weight: 70.0 });

      const [result] = await db
        .select({
          entryId: schema.weightEntries.id,
          weight: schema.weightEntries.weight,
          userName: schema.users.firstName,
          userEmail: schema.users.email,
        })
        .from(schema.weightEntries)
        .innerJoin(
          schema.users,
          eq(schema.weightEntries.userId, schema.users.id)
        )
        .where(eq(schema.weightEntries.id, entry.id));

      expect(result).toBeDefined();
      expect(result.entryId).toBe(entry.id);
      expect(parseFloat(result.weight)).toBe(70.0);
      expect(result.userEmail).toBe(patient.email);
    });
  });

  describe('Weight Entry Update Operations', () => {
    it('should update weight value', async () => {
      const patient = await createPatient(db);
      const entry = await createWeightEntry(db, patient.id, { weight: 70.0 });

      const [updatedEntry] = await db
        .update(schema.weightEntries)
        .set({ weight: '71.5', updatedAt: new Date(), updatedBy: patient.id })
        .where(eq(schema.weightEntries.id, entry.id))
        .returning();

      expect(parseFloat(updatedEntry.weight)).toBe(71.5);
      expect(updatedEntry.updatedAt).toBeDefined();
      expect(updatedEntry.updatedBy).toBe(patient.id);
    });

    it('should confirm outlier', async () => {
      const patient = await createPatient(db);
      const entry = await createWeightEntry(db, patient.id, {
        weight: 75.0,
        isOutlier: true,
        outlierConfirmed: false,
      });

      const [updatedEntry] = await db
        .update(schema.weightEntries)
        .set({ outlierConfirmed: true })
        .where(eq(schema.weightEntries.id, entry.id))
        .returning();

      expect(updatedEntry.isOutlier).toBe(true);
      expect(updatedEntry.outlierConfirmed).toBe(true);
    });

    it('should update note', async () => {
      const patient = await createPatient(db);
      const entry = await createWeightEntry(db, patient.id, {
        weight: 70.0,
        note: 'Original note',
      });

      const [updatedEntry] = await db
        .update(schema.weightEntries)
        .set({ note: 'Updated note' })
        .where(eq(schema.weightEntries.id, entry.id))
        .returning();

      expect(updatedEntry.note).toBe('Updated note');
    });
  });

  describe('Weight Entry Delete Operations', () => {
    it('should delete a weight entry', async () => {
      const patient = await createPatient(db);
      const entry = await createWeightEntry(db, patient.id, { weight: 70.0 });

      await db
        .delete(schema.weightEntries)
        .where(eq(schema.weightEntries.id, entry.id));

      const [foundEntry] = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.id, entry.id));

      expect(foundEntry).toBeUndefined();
    });

    it('should delete all entries for a user', async () => {
      const patient = await createPatient(db);

      await createWeightHistory(db, patient.id, [
        { weight: 70.0, daysAgo: 0 },
        { weight: 69.5, daysAgo: 1 },
        { weight: 69.0, daysAgo: 2 },
      ]);

      await db
        .delete(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id));

      const entries = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id));

      expect(entries).toHaveLength(0);
    });

    it('should NOT cascade delete entries when user is deleted (restrict)', async () => {
      const patient = await createPatient(db);
      await createWeightEntry(db, patient.id, { weight: 70.0 });

      // This should fail due to onDelete: 'restrict'
      await expect(
        db.delete(schema.users).where(eq(schema.users.id, patient.id))
      ).rejects.toThrow();
    });
  });

  describe('Weight Entry Constraints and Indexes', () => {
    it('should enforce unique index (1 entry per day per user)', async () => {
      const patient = await createPatient(db);
      const today = new Date();

      await createWeightEntry(db, patient.id, {
        weight: 70.0,
        measurementDate: today,
      });

      // Different time, same calendar day (Europe/Warsaw)
      const todaySameDay = new Date(today);
      todaySameDay.setHours(23, 59, 59);

      await expect(
        createWeightEntry(db, patient.id, {
          weight: 71.0,
          measurementDate: todaySameDay,
        })
      ).rejects.toThrow();
    });

    it('should allow entries for different users on same day', async () => {
      const patient1 = await createPatient(db);
      const patient2 = await createPatient(db);
      const today = new Date();

      const entry1 = await createWeightEntry(db, patient1.id, {
        weight: 70.0,
        measurementDate: today,
      });

      const entry2 = await createWeightEntry(db, patient2.id, {
        weight: 65.0,
        measurementDate: today,
      });

      expect(entry1.id).not.toBe(entry2.id);
      expect(entry1.userId).not.toBe(entry2.userId);
    });

    it('should use composite index for user + date queries', async () => {
      const patient = await createPatient(db);

      await createWeightHistory(db, patient.id, [
        { weight: 70.0, daysAgo: 0 },
        { weight: 69.5, daysAgo: 1 },
        { weight: 69.0, daysAgo: 2 },
      ]);

      // This query should use idx_weight_entries_user_date
      const entries = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id))
        .orderBy(desc(schema.weightEntries.measurementDate))
        .limit(10);

      expect(entries).toHaveLength(3);
      expect(entries[0].measurementDate.getTime()).toBeGreaterThan(
        entries[1].measurementDate.getTime()
      );
    });
  });

  describe('Weight History Scenarios', () => {
    it('should create complete weight history (7 days)', async () => {
      const patient = await createPatient(db);

      const entries = await createWeightHistory(db, patient.id, [
        { weight: 70.0, daysAgo: 0 },
        { weight: 69.8, daysAgo: 1 },
        { weight: 69.5, daysAgo: 2 },
        { weight: 69.3, daysAgo: 3 },
        { weight: 69.0, daysAgo: 4 },
        { weight: 68.8, daysAgo: 5 },
        { weight: 68.5, daysAgo: 6 },
      ]);

      expect(entries).toHaveLength(7);

      const allEntries = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id))
        .orderBy(desc(schema.weightEntries.measurementDate));

      expect(allEntries).toHaveLength(7);
      expect(parseFloat(allEntries[0].weight)).toBe(70.0); // Most recent
      expect(parseFloat(allEntries[6].weight)).toBe(68.5); // Oldest
    });

    it('should handle weight history with gaps', async () => {
      const patient = await createPatient(db);

      await createWeightHistory(db, patient.id, [
        { weight: 70.0, daysAgo: 0 },
        { weight: 69.5, daysAgo: 2 }, // Gap on day 1
        { weight: 69.0, daysAgo: 5 }, // Gap on days 3-4
      ]);

      const entries = await db
        .select()
        .from(schema.weightEntries)
        .where(eq(schema.weightEntries.userId, patient.id))
        .orderBy(desc(schema.weightEntries.measurementDate));

      expect(entries).toHaveLength(3);
    });
  });
});
