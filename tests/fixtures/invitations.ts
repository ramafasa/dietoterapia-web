import type { Database } from '@/db';
import { invitations } from '@/db/schema';
import { addDays, subDays } from 'date-fns';
import crypto from 'crypto';
import { hashToken } from '@/lib/crypto';

/**
 * Create an invitation for testing
 *
 * IMPORTANT: Returns both the invitation record (with tokenHash) and the raw token.
 * Tests should use the raw token for validation/signup flows.
 */
export async function createInvitation(db: Database, options: {
  email: string;
  dietitianId: string;
  status?: 'pending' | 'accepted' | 'expired';
  token?: string;
  expiresAt?: Date;
  usedAt?: Date;
}) {
  const token = options.token || crypto.randomBytes(32).toString('hex');
  const tokenHash = await hashToken(token); // Hash for DB storage
  const now = new Date();

  let expiresAt: Date;
  let usedAt: Date | null = null;

  switch (options.status) {
    case 'expired':
      expiresAt = subDays(now, 1); // Expired yesterday
      break;
    case 'accepted':
      expiresAt = addDays(now, 7);
      usedAt = now;
      break;
    case 'pending':
    default:
      expiresAt = options.expiresAt || addDays(now, 7);
      break;
  }

  const [invitation] = await db.insert(invitations).values({
    email: options.email,
    tokenHash, // Store hash (NOT raw token)
    createdBy: options.dietitianId,
    expiresAt,
    usedAt: options.usedAt || usedAt,
  }).returning();

  // Return both invitation and raw token for tests
  return { invitation, token };
}

/**
 * Create multiple invitations for testing
 */
export async function createInvitations(db: Database, dietitianId: string) {
  const valid = await createInvitation(db, {
    email: 'valid@example.com',
    dietitianId,
    status: 'pending',
  });

  const expired = await createInvitation(db, {
    email: 'expired@example.com',
    dietitianId,
    status: 'expired',
  });

  const used = await createInvitation(db, {
    email: 'used@example.com',
    dietitianId,
    status: 'accepted',
  });

  return {
    valid,
    expired,
    used,
  };
}

