import { hash } from 'bcrypt';
import type { Database } from '@/db';
import { users, consents } from '@/db/schema';

/**
 * Create a dietitian user for testing
 */
export async function createDietitian(db: Database, overrides?: {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
}) {
  const password = overrides?.password || 'SecurePassword123!';
  const passwordHash = await hash(password, 10);

  const [dietitian] = await db.insert(users).values({
    email: overrides?.email || 'paulina@example.com',
    firstName: overrides?.firstName || 'Paulina',
    lastName: overrides?.lastName || 'Maciak',
    role: 'dietitian',
    passwordHash,
  }).returning();
  
  return { ...dietitian, password };
}

/**
 * Create a patient user for testing
 */
export async function createPatient(db: Database, overrides?: {
  email?: string;
  firstName?: string;
  lastName?: string;
  password?: string;
  status?: 'active' | 'paused' | 'ended';
  dietitianId?: string;
  endedAt?: Date;
  scheduledDeletionAt?: Date;
}) {
  const password = overrides?.password || 'PatientPassword123!';
  const passwordHash = await hash(password, 10);

  const status = overrides?.status || 'active';
  const now = new Date();

  const [patient] = await db.insert(users).values({
    email: overrides?.email || `patient-${Date.now()}@example.com`,
    firstName: overrides?.firstName || 'Jan',
    lastName: overrides?.lastName || 'Kowalski',
    role: 'patient',
    passwordHash,
    status,
    dietitianId: overrides?.dietitianId,
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
  
  return { ...patient, password };
}

