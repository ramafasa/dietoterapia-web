import type { Database } from '@/db';
import { passwordResetTokens } from '@/db/schema';
import { addHours, subHours } from 'date-fns';
import crypto from 'crypto';

/**
 * Create a password reset token for testing
 */
export async function createPasswordResetToken(db: Database, options: {
  userId: string;
  status?: 'valid' | 'expired' | 'used';
  token?: string;
}) {
  const token = options.token || crypto.randomBytes(32).toString('hex');
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
    token,
    expiresAt,
    usedAt,
  }).returning();
  
  return resetToken;
}

