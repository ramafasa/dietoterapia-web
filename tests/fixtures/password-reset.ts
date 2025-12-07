import type { Database } from '@/db';
import { passwordResetTokens } from '@/db/schema';
import { addHours, subHours } from 'date-fns';
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
}) {
  const token = options.token || crypto.randomBytes(32).toString('hex');
  const tokenHash = await hashToken(token); // Hash for DB storage
  const now = new Date();

  let expiresAt: Date;
  let usedAt: Date | null = null;

  switch (options.status) {
    case 'expired':
      expiresAt = subHours(now, 1); // Expired 1 hour ago
      break;
    case 'used':
      expiresAt = addHours(now, 1);
      usedAt = now;
      break;
    case 'valid':
    default:
      expiresAt = addHours(now, 1);
      break;
  }

  const [resetToken] = await db.insert(passwordResetTokens).values({
    userId: options.userId,
    tokenHash, // Store hash (NOT raw token)
    expiresAt,
    usedAt,
  }).returning();

  // Return both token record and raw token for tests
  return { ...resetToken, token };
}

