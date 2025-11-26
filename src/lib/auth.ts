import { Lucia, TimeSpan } from 'lucia'
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle'
import { db as defaultDb, type Database } from '@/db'
import { sessions, users } from '@/db/schema'
import type { User } from '@/db/schema'

/**
 * Creates a Lucia instance with the provided database
 * This allows for dependency injection in tests
 */
export function createLucia(db: Database) {
  const adapter = new DrizzlePostgreSQLAdapter(db, sessions, users)

  return new Lucia(adapter, {
    sessionCookie: {
      attributes: {
        secure: import.meta.env.PROD
      }
    },
    sessionExpiresIn: new TimeSpan(30, 'd'), // 30 days
    getUserAttributes: (attributes) => {
      return {
        email: attributes.email,
        role: attributes.role,
        firstName: attributes.firstName,
        lastName: attributes.lastName,
        status: attributes.status
      }
    }
  })
}

// Default Lucia instance for production use
export const lucia = createLucia(defaultDb)

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia
    DatabaseUserAttributes: Omit<User, 'id' | 'passwordHash'>
  }
}

// Helper functions
export async function createSession(userId: string) {
  return await lucia.createSession(userId, {})
}

export async function validateSession(sessionId: string) {
  return await lucia.validateSession(sessionId)
}

export async function invalidateSession(sessionId: string) {
  await lucia.invalidateSession(sessionId)
}

/**
 * Sets session cookie in Astro response
 *
 * Used in auth endpoints (signup, login) to establish user session
 *
 * @param sessionId - Session ID from lucia.createSession()
 * @param cookies - Astro.cookies object
 */
export function setSessionCookie(sessionId: string, cookies: any) {
  const sessionCookie = lucia.createSessionCookie(sessionId)
  cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
}

/**
 * Clears session cookie in Astro response
 *
 * Used in logout endpoint
 *
 * @param cookies - Astro.cookies object
 */
export function clearSessionCookie(cookies: any) {
  const sessionCookie = lucia.createBlankSessionCookie()
  cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
}
