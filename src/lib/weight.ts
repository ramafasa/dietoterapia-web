import { db } from '@/db'
import { weightEntries } from '@/db/schema'
import { eq, count } from 'drizzle-orm'

/**
 * Sprawdza czy użytkownik ma jakiekolwiek wpisy wagi w bazie danych
 * @param userId - UUID użytkownika
 * @returns true jeśli użytkownik ma ≥1 wpis wagi, false w przeciwnym wypadku
 */
export async function hasWeightEntries(userId: string): Promise<boolean> {
  const result = await db
    .select({ count: count() })
    .from(weightEntries)
    .where(eq(weightEntries.userId, userId))
    .limit(1)

  return result[0]?.count > 0
}
