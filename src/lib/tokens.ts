import { db } from '@/db'
import { passwordResetTokens } from '@/db/schema'
import { eq, and, gte, isNull } from 'drizzle-orm'
import { randomBytes } from 'crypto'
import { hashToken } from './crypto'

const TOKEN_EXPIRY_MINUTES = 60

/**
 * Generates a password reset token for the specified user
 *
 * Security implementation:
 * - Generates cryptographically secure random token (32 bytes = 64 hex chars)
 * - Stores only SHA-256 hash in database (NOT the raw token)
 * - Returns raw token for email delivery (one-time use)
 * - Invalidates all existing tokens for the user (prevents accumulation)
 *
 * @param userId - User ID to generate token for
 * @returns Raw token (64-char hex string) - MUST be sent via secure channel (email)
 *
 * SECURITY WARNING:
 * - NEVER log the returned token (only log hash for debugging)
 * - Raw token should only exist in memory during email sending
 * - Token expires after 60 minutes
 */
export async function generatePasswordResetToken(userId: string): Promise<string> {
  // Invalidate existing tokens (prevent token accumulation)
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId))

  // Generate cryptographically secure random token
  const token = randomBytes(32).toString('hex') // 64-char hex string
  const tokenHash = hashToken(token) // SHA-256 hash for DB storage
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000)

  // Store hash in database (NOT raw token)
  await db.insert(passwordResetTokens).values({
    userId,
    tokenHash,
    expiresAt,
  })

  // Return raw token for email delivery
  return token
}

/**
 * Validates a password reset token
 *
 * Security implementation:
 * - Hashes incoming token before database lookup (constant-time comparison)
 * - Checks expiration and usage status
 * - Does NOT reveal why token is invalid (prevents enumeration attacks)
 *
 * @param token - Raw token from password reset URL (64-char hex string)
 * @returns Validation result with userId if valid
 *
 * @example
 * ```typescript
 * const { valid, userId } = await validatePasswordResetToken(token)
 * if (!valid || !userId) {
 *   return new Response('Invalid or expired token', { status: 400 })
 * }
 * // Proceed with password reset
 * ```
 */
export async function validatePasswordResetToken(token: string): Promise<{ valid: boolean; userId?: string }> {
  // Hash token before database lookup (security: query hash, not raw token)
  const tokenHash = hashToken(token)

  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash), // Compare hashes
        gte(passwordResetTokens.expiresAt, new Date()), // Not expired
        isNull(passwordResetTokens.usedAt) // Not used yet
      )
    )
    .limit(1)

  if (!record) {
    return { valid: false }
  }

  return { valid: true, userId: record.userId }
}

/**
 * Marks a password reset token as used (prevents reuse)
 *
 * @param token - Raw token from password reset URL (64-char hex string)
 */
export async function markTokenAsUsed(token: string) {
  // Hash token before database lookup
  const tokenHash = hashToken(token)

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
}
