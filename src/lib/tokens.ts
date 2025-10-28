import { db } from '@/db'
import { passwordResetTokens } from '@/db/schema'
import { eq, and, gte, isNull } from 'drizzle-orm'
import { randomBytes } from 'crypto'

const TOKEN_EXPIRY_MINUTES = 60

export async function generatePasswordResetToken(userId: string): Promise<string> {
  // Invalidate existing tokens
  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, userId))

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000)

  await db.insert(passwordResetTokens).values({
    userId,
    token,
    expiresAt,
  })

  return token
}

export async function validatePasswordResetToken(token: string): Promise<{ valid: boolean; userId?: string }> {
  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.token, token),
        gte(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt)
      )
    )
    .limit(1)

  if (!record) {
    return { valid: false }
  }

  return { valid: true, userId: record.userId }
}

export async function markTokenAsUsed(token: string) {
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.token, token))
}
