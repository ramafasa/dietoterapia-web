import type { Database } from '@/db';
import { invitations } from '@/db/schema';
import { addDays, subDays } from 'date-fns';
import crypto from 'crypto';

/**
 * Create an invitation for testing
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
    token,
    createdBy: options.dietitianId,
    expiresAt,
    usedAt: options.usedAt || usedAt,
  }).returning();
  
  return invitation;
}

/**
 * Create multiple invitations for testing
 */
export async function createInvitations(db: Database, dietitianId: string) {
  const validInvitation = await createInvitation(db, {
    email: 'valid@example.com',
    dietitianId,
    status: 'pending',
  });
  
  const expiredInvitation = await createInvitation(db, {
    email: 'expired@example.com',
    dietitianId,
    status: 'expired',
  });
  
  const usedInvitation = await createInvitation(db, {
    email: 'used@example.com',
    dietitianId,
    status: 'accepted',
  });
  
  return {
    valid: validInvitation,
    expired: expiredInvitation,
    used: usedInvitation,
  };
}

