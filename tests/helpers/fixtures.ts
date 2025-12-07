/**
 * Test Fixtures
 *
 * Helper functions to create test data in the database.
 * Used in integration tests to set up test scenarios.
 */

import bcrypt from 'bcrypt';
import { sql } from 'drizzle-orm';
import type { Database } from '@/db';
import * as schema from '@/db/schema';
import { hashToken } from '@/lib/crypto';
import { hashPasswordV2 } from '@/lib/password';

// Counter to ensure unique measurement dates when not specified
// This prevents unique constraint violations on (user_id, date(measurement_date))
let weightEntryDayOffset = 0;

// ===== USER FIXTURES =====

export type UserStatus = 'active' | 'paused' | 'ended';
export type UserRole = 'patient' | 'dietitian';

interface CreateUserOptions {
  email?: string;
  password?: string;
  role?: UserRole;
  status?: UserStatus;
  firstName?: string;
  lastName?: string;
  age?: number;
  gender?: 'male' | 'female';
}

// Mock SHA-256 hash for test fixtures
// In production, this would come from hashPasswordClient() in the browser
const mockSHA256Hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'; // SHA-256 of "test"

/**
 * Create a test user (patient or dietitian)
 *
 * NOTE: Password should be a SHA-256 hash (64 hex chars) matching the v2 password flow.
 * For backward compatibility, if a plain text password is provided, we hash it with SHA-256 first.
 */
export async function createUser(
  db: Database,
  options: CreateUserOptions = {}
) {
  const {
    email = `test-${Date.now()}@example.com`,
    password = mockSHA256Hash, // Default to SHA-256 hash
    role = 'patient',
    status = 'active',
    firstName = 'Jan',
    lastName = 'Kowalski',
    age = 30,
    gender = 'male',
  } = options;

  // Use hashPasswordV2 (expects SHA-256 hash input)
  const passwordHash = await hashPasswordV2(password);

  const [user] = await db
    .insert(schema.users)
    .values({
      email,
      passwordHash,
      role,
      status,
      firstName,
      lastName,
      age,
      gender,
    })
    .returning();

  return { ...user, password }; // Return password for login tests
}

/**
 * Create a dietitian user (Paulina)
 */
export async function createDietitian(db: Database, options: Partial<CreateUserOptions> = {}) {
  return createUser(db, {
    email: 'paulina@example.com',
    firstName: 'Paulina',
    lastName: 'Maciak',
    role: 'dietitian',
    status: 'active',
    ...options,
  });
}

/**
 * Create a patient user with specific status
 */
export async function createPatient(
  db: Database,
  status: UserStatus = 'active',
  options: Partial<CreateUserOptions> = {}
) {
  const user = await createUser(db, {
    role: 'patient',
    status,
    ...options,
  });

  // If status is 'ended', set endedAt and scheduledDeletionAt
  if (status === 'ended') {
    const endedAt = new Date();
    const scheduledDeletionAt = new Date();
    scheduledDeletionAt.setMonth(scheduledDeletionAt.getMonth() + 24);

    const [updatedUser] = await db
      .update(schema.users)
      .set({ endedAt, scheduledDeletionAt })
      .where(sql`${schema.users.id} = ${user.id}`)
      .returning();

    return { ...updatedUser, password: user.password };
  }

  return user;
}

// ===== SESSION FIXTURES =====

/**
 * Create a session for a user
 */
export async function createSession(
  db: Database,
  userId: string,
  options: {
    expiresAt?: Date;
    sessionId?: string;
  } = {}
) {
  const expiresAt = options.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  const sessionId = options.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const [session] = await db
    .insert(schema.sessions)
    .values({
      id: sessionId,
      userId,
      expiresAt,
    })
    .returning();

  return session;
}

// ===== WEIGHT ENTRY FIXTURES =====

interface CreateWeightEntryOptions {
  weight?: number;
  measurementDate?: Date;
  source?: 'patient' | 'dietitian';
  isBackfill?: boolean;
  isOutlier?: boolean;
  outlierConfirmed?: boolean;
  note?: string;
  createdBy?: string;
}

/**
 * Create a weight entry for a patient
 */
export async function createWeightEntry(
  db: Database,
  userId: string,
  options: CreateWeightEntryOptions = {}
) {
  const {
    weight = 70.0,
    measurementDate,
    source = 'patient',
    isBackfill = false,
    isOutlier = false,
    outlierConfirmed = false,
    note,
    createdBy,
  } = options;

  // If no measurement date provided, create entries on different days to avoid unique constraint violations
  const finalMeasurementDate = measurementDate || (() => {
    const date = new Date();
    date.setDate(date.getDate() - weightEntryDayOffset);
    weightEntryDayOffset++;
    return date;
  })();

  const [entry] = await db
    .insert(schema.weightEntries)
    .values({
      userId,
      weight: weight.toString(),
      measurementDate: finalMeasurementDate,
      source,
      isBackfill,
      isOutlier,
      outlierConfirmed,
      note,
      createdBy: createdBy || userId,
    })
    .returning();

  return entry;
}

/**
 * Create multiple weight entries for a patient (weight history)
 */
export async function createWeightHistory(
  db: Database,
  userId: string,
  entries: Array<{ weight: number; daysAgo: number }>
) {
  const createdEntries = [];

  for (const { weight, daysAgo } of entries) {
    const measurementDate = new Date();
    measurementDate.setDate(measurementDate.getDate() - daysAgo);

    const entry = await createWeightEntry(db, userId, {
      weight,
      measurementDate,
      isBackfill: daysAgo > 0,
    });

    createdEntries.push(entry);
  }

  return createdEntries;
}

// ===== INVITATION FIXTURES =====

interface CreateInvitationOptions {
  email?: string;
  token?: string;
  createdBy?: string;
  expiresAt?: Date;
  usedAt?: Date | null;
}

/**
 * Create an invitation
 *
 * IMPORTANT: Returns both the invitation record (with tokenHash) and the raw token.
 * Tests should use the raw token for validation/signup flows.
 */
export async function createInvitation(
  db: Database,
  dietitianId: string,
  options: CreateInvitationOptions = {}
) {
  const {
    email = `patient-${Date.now()}@example.com`,
    token = `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    usedAt = null,
  } = options;

  const tokenHash = await hashToken(token); // Hash for DB storage

  const [invitation] = await db
    .insert(schema.invitations)
    .values({
      email,
      tokenHash, // Store hash (NOT raw token)
      createdBy: dietitianId,
      expiresAt,
      usedAt,
    })
    .returning();

  // Return both invitation and raw token for tests
  return { ...invitation, token };
}

/**
 * Create an expired invitation
 */
export async function createExpiredInvitation(db: Database, dietitianId: string) {
  const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
  return createInvitation(db, dietitianId, { expiresAt });
}

/**
 * Create a used invitation
 */
export async function createUsedInvitation(db: Database, dietitianId: string) {
  const usedAt = new Date();
  return createInvitation(db, dietitianId, { usedAt });
}

// ===== PASSWORD RESET TOKEN FIXTURES =====

/**
 * Create a password reset token
 *
 * IMPORTANT: Returns both the token record (with tokenHash) and the raw token.
 * Tests should use the raw token for password reset flows.
 */
export async function createPasswordResetToken(
  db: Database,
  userId: string,
  options: {
    expiresAt?: Date;
    usedAt?: Date | null;
    token?: string;
  } = {}
) {
  const {
    expiresAt = new Date(Date.now() + 60 * 60 * 1000), // 1 hour
    usedAt = null,
    token = `reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  } = options;

  const tokenHash = await hashToken(token); // Hash for DB storage

  const [resetToken] = await db
    .insert(schema.passwordResetTokens)
    .values({
      userId,
      tokenHash, // Store hash (NOT raw token)
      expiresAt,
      usedAt,
    })
    .returning();

  // Return both token record and raw token for tests
  return { ...resetToken, token };
}

// ===== CONSENT FIXTURES =====

interface CreateConsentOptions {
  consentType?: string;
  consentText?: string;
  accepted?: boolean;
}

/**
 * Create a consent for a user
 */
export async function createConsent(
  db: Database,
  userId: string,
  options: CreateConsentOptions = {}
) {
  const {
    consentType = 'data_processing',
    consentText = 'Zgadzam się na przetwarzanie moich danych osobowych.',
    accepted = true,
  } = options;

  const [consent] = await db
    .insert(schema.consents)
    .values({
      userId,
      consentType,
      consentText,
      accepted,
    })
    .returning();

  return consent;
}

/**
 * Create required consents for signup (data_processing + health_data)
 */
export async function createRequiredConsents(db: Database, userId: string) {
  const dataProcessingConsent = await createConsent(db, userId, {
    consentType: 'data_processing',
    consentText: 'Zgadzam się na przetwarzanie moich danych osobowych.',
    accepted: true,
  });

  const healthDataConsent = await createConsent(db, userId, {
    consentType: 'health_data',
    consentText: 'Zgadzam się na przetwarzanie moich danych zdrowotnych.',
    accepted: true,
  });

  return [dataProcessingConsent, healthDataConsent];
}

// ===== EVENT FIXTURES =====

/**
 * Create an analytics event
 */
export async function createEvent(
  db: Database,
  userId: string | null,
  eventType: string,
  properties: Record<string, any> = {}
) {
  const [event] = await db
    .insert(schema.events)
    .values({
      userId,
      eventType,
      properties,
    })
    .returning();

  return event;
}

// ===== AUDIT LOG FIXTURES =====

/**
 * Create an audit log entry
 */
export async function createAuditLogEntry(
  db: Database,
  options: {
    userId?: string | null;
    action: 'create' | 'update' | 'delete';
    tableName: string;
    recordId?: string;
    before?: Record<string, any>;
    after?: Record<string, any>;
  }
) {
  const [auditEntry] = await db
    .insert(schema.auditLog)
    .values({
      userId: options.userId || null,
      action: options.action,
      tableName: options.tableName,
      recordId: options.recordId,
      before: options.before,
      after: options.after,
    })
    .returning();

  return auditEntry;
}
