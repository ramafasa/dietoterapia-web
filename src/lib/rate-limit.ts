import { db } from '@/db'
import { loginAttempts } from '@/db/schema'
import { and, eq, gte } from 'drizzle-orm'

const MAX_ATTEMPTS = 5
const LOCKOUT_DURATION_MINUTES = 15

export async function checkRateLimit(email: string): Promise<{ allowed: boolean; remainingAttempts?: number; lockedUntil?: Date }> {
  const cutoffTime = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000)

  const recentAttempts = await db
    .select()
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.email, email.toLowerCase()),
        gte(loginAttempts.attemptedAt, cutoffTime)
      )
    )

  const failedAttempts = recentAttempts.filter(a => !a.success).length

  if (failedAttempts >= MAX_ATTEMPTS) {
    const oldestFailedAttempt = recentAttempts
      .filter(a => !a.success)
      .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime())[0]

    const lockedUntil = new Date(oldestFailedAttempt.attemptedAt.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000)

    return {
      allowed: false,
      lockedUntil,
    }
  }

  return {
    allowed: true,
    remainingAttempts: MAX_ATTEMPTS - failedAttempts,
  }
}

export async function recordLoginAttempt(email: string, success: boolean, ipAddress?: string, userAgent?: string) {
  await db.insert(loginAttempts).values({
    email: email.toLowerCase(),
    success,
    ipAddress,
    userAgent,
  })
}
