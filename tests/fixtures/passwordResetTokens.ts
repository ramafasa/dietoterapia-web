import type { Database } from '@/db';
import { passwordResetTokens } from '@/db/schema';
import { addMinutes, subMinutes } from 'date-fns';
import crypto from 'crypto';
import { hashToken } from '@/lib/crypto';

/**
 * Create a password reset token for testing
 *
 * IMPORTANT: Returns both the token record (with tokenHash) and the raw token.
 * Tests should use the raw token for password reset flows.
 */
export async function createPasswordResetToken(db: Database, options: {
  userId: string;
  status?: 'valid' | 'expired' | 'used';
  token?: string;
  expiresAt?: Date;
  usedAt?: Date;
}) {
  const token = options.token || crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token); // Hash for DB storage
  const now = new Date();

  let expiresAt: Date;
  let usedAt: Date | null = null;

  switch (options.status) {
    case 'expired':
      expiresAt = subMinutes(now, 1); // Expired 1 minute ago
      break;
    case 'used':
      expiresAt = addMinutes(now, 60); // Valid but used
      usedAt = now;
      break;
    case 'valid':
    default:
      expiresAt = options.expiresAt || addMinutes(now, 60); // Valid for 60 minutes
      break;
  }

  const [tokenRecord] = await db.insert(passwordResetTokens).values({
    userId: options.userId,
    tokenHash, // Store hash (NOT raw token)
    expiresAt,
    usedAt: options.usedAt || usedAt,
  }).returning();

  // Return both token record and raw token for tests
  return { tokenRecord, token };
}
