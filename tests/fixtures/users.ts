import { hash as _hash } from 'bcrypt';
import type { Database } from '@/db';
import { users, consents } from '@/db/schema';
import { hashPasswordV2 } from '@/lib/password';

// Mock SHA-256 hash for E2E test fixtures
// In production, this would come from hashPasswordClient() in the browser
const mockSHA256Hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'; // SHA-256 of "test"

/**
 * Create a dietitian user for testing
 *
 * NOTE: Password parameter should be a plain text password.
 * This function will hash it with SHA-256 first (simulating frontend),
 * then hash with bcrypt (backend).
 */
export async function createDietitian(db: Database, overrides?: {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}) {
  const plainPassword = overrides?.password || 'SecurePassword123!';

  // Simulate frontend SHA-256 hashing (in E2E tests, we need to hash manually)
  // In real app, hashPasswordClient() does this in browser
  const sha256Hash = await hashPlainPasswordToSHA256(plainPassword);

  // Use hashPasswordV2 (expects SHA-256 hash input, applies bcrypt)
  const passwordHash = await hashPasswordV2(sha256Hash);

  const [dietitian] = await db.insert(users).values({
    email: overrides?.email || 'paulina@example.com',
    firstName: overrides?.firstName || 'Paulina',
    lastName: overrides?.lastName || 'Maciak',
    role: 'dietitian',
    passwordHash,
  }).returning();

  // Return plain password for E2E tests to use when logging in
  return { ...dietitian, password: plainPassword };
}

/**
 * Create a patient user for testing
 *
 * NOTE: Password parameter should be a plain text password.
 * This function will hash it with SHA-256 first (simulating frontend),
 * then hash with bcrypt (backend).
 */
export async function createPatient(db: Database, overrides?: {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  status?: 'active' | 'paused' | 'ended';
  endedAt?: Date;
  scheduledDeletionAt?: Date;
}) {
  const plainPassword = overrides?.password || 'PatientPassword123!';

  // Simulate frontend SHA-256 hashing
  const sha256Hash = await hashPlainPasswordToSHA256(plainPassword);

  // Use hashPasswordV2 (expects SHA-256 hash input, applies bcrypt)
  const passwordHash = await hashPasswordV2(sha256Hash);

  const status = overrides?.status || 'active';
  const now = new Date();

  const [patient] = await db.insert(users).values({
    email: overrides?.email || `patient-${Date.now()}@example.com`,
    firstName: overrides?.firstName || 'Jan',
    lastName: overrides?.lastName || 'Kowalski',
    role: 'patient',
    passwordHash,
    status,
    endedAt: overrides?.endedAt || (status === 'ended' ? now : null),
    scheduledDeletionAt: overrides?.scheduledDeletionAt || (status === 'ended' ? new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000) : null),
  }).returning();
  
  // Create default consents for the patient
  await db.insert(consents).values([
    {
      userId: patient.id,
      consentType: 'terms',
      consentText: 'Akceptuję regulamin serwisu',
      accepted: true,
      timestamp: now,
    },
    {
      userId: patient.id,
      consentType: 'privacy',
      consentText: 'Akceptuję politykę prywatności',
      accepted: true,
      timestamp: now,
    },
    {
      userId: patient.id,
      consentType: 'data_processing',
      consentText: 'Wyrażam zgodę na przetwarzanie danych osobowych',
      accepted: true,
      timestamp: now,
    },
  ]);

  // Return plain password for E2E tests to use when logging in
  return { ...patient, password: plainPassword };
}

/**
 * Helper function to hash plain password to SHA-256 (simulating frontend)
 * Uses Node.js crypto module (not Web Crypto API which is browser-only)
 */
async function hashPlainPasswordToSHA256(plainPassword: string): Promise<string> {
  const crypto = await import('crypto');
  return crypto.createHash('sha256').update(plainPassword).digest('hex');
}

